import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Collection, type CollectionState } from './collection.js'
import { resolveConfig, type ResolvedDatabaseConfig } from './config.js'
import { diagnoseStorage } from './diagnostics.js'
import { EdgeDbError } from './errors.js'
import { assertSupportedEnvironment } from './environment.js'
import { createId, createTransactionId } from './ids.js'
import { createLogger, logEvent, type Logger } from './logger.js'
import { FileCoordinator } from '../coordination/fileCoordinator.js'
import { IndexRegistry } from '../index/indexRegistry.js'
import { normalizeSchema } from '../schema/normalizeSchema.js'
import { loadStoredSchema, planSchema } from '../schema/planSchema.js'
import { schemaHash } from '../schema/schemaHash.js'
import {
  syncCollectionSchema,
  writeStoredCollectionSchema,
  type CollectionSchemaSyncResult,
  type StoredCollectionSchema
} from '../schema/schemaSync.js'
import { validateSchema } from '../schema/validateSchema.js'
import { appendLogRecords, readLog } from '../storage/appendLog.js'
import { atomicWriteJson, readJsonFile } from '../storage/atomicFile.js'
import { createBackup, restoreBackup } from '../storage/backup.js'
import {
  manifestExists,
  readManifest,
  writeManifest,
  type StorageManifest
} from '../storage/manifest.js'
import { createStoragePaths, type StoragePaths } from '../storage/paths.js'
import type { LogRecord } from '../storage/recordCodec.js'
import { readSnapshot, writeSnapshot } from '../storage/snapshot.js'
import { projectRecord } from '../query/projection.js'
import { WriteQueue } from '../transaction/writeQueue.js'
import {
  STORAGE_FORMAT_VERSION,
  type CollectionMigration,
  type DatabaseChangeEvent,
  type DatabaseCoordinator,
  type DatabaseDiagnostics,
  type DatabaseHooks,
  type DatabaseLease,
  type DatabaseOptions,
  type IncludeQuery,
  type InferCreate,
  type InferUpdate,
  type InferSchema,
  type NormalizedCollectionSchema,
  type NormalizedSchema,
  type RecoverySummary,
  type SchemaChange,
  type SchemaChangePlan,
  type SchemaDefinition,
  type StoragePermissionCheck,
  type WriteOperation
} from '../types/public.js'

export interface TransactionDatabase {
  collection<TRecord extends Record<string, unknown> = Record<string, unknown>>(name: string): Collection<TRecord>
}

interface QueryStats {
  total: number
  scans: number
  slow: number
}

interface PendingMigration {
  changes: SchemaChange[]
  migration: CollectionMigration
  previous: StoredCollectionSchema
}

interface MigrationMarker {
  formatVersion: 1
  desiredSchemaHash: string
  sequence: number
  collections: Record<
    string,
    {
      previous: StoredCollectionSchema
      desired: NormalizedCollectionSchema
      snapshotPath: string
    }
  >
}

async function directorySize(path: string): Promise<number> {
  let total = 0
  try {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const entryPath = join(path, entry.name)
      total += entry.isDirectory() ? await directorySize(entryPath) : (await stat(entryPath)).size
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return total
}

function applyOperationToState(state: CollectionState, operation: WriteOperation): void {
  const current = state.records.get(operation.id)
  if (operation.op === 'insert' && operation.data) {
    state.indexes.add(operation.data)
    state.records.set(operation.id, structuredClone(operation.data))
  } else if (operation.op === 'update' && current && operation.patch) {
    const next = { ...current, ...operation.patch }
    state.indexes.update(current, next)
    state.records.set(operation.id, next)
  } else if (operation.op === 'delete' && current) {
    state.indexes.remove(current)
    state.records.delete(operation.id)
  } else if (operation.op === 'restore' && current) {
    const next = { ...current, deletedAt: null }
    state.indexes.update(current, next)
    state.records.set(operation.id, next)
  }
}

function assertRecordMatchesSchema(
  collection: string,
  record: Record<string, unknown>,
  schema: NormalizedCollectionSchema
): void {
  for (const field of Object.keys(record)) {
    if (!schema.fields[field]) {
      throw new EdgeDbError(
        'UNKNOWN_FIELD',
        `Migration retained unknown field "${collection}.${field}".`
      )
    }
  }
  for (const [field, definition] of Object.entries(schema.fields)) {
    const value = record[field]
    if (value === undefined || value === null) {
      if (!definition.nullable && !definition.hasDefault) {
        throw new EdgeDbError(
          'VALIDATION_FAILED',
          `Migration did not provide required field "${collection}.${field}".`
        )
      }
      continue
    }
    const valid =
      definition.type === 'json' ||
      ((definition.type === 'id' ||
        definition.type === 'text' ||
        definition.type === 'datetime') &&
        typeof value === 'string') ||
      ((definition.type === 'integer' || definition.type === 'real') &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (definition.type !== 'integer' || Number.isInteger(value))) ||
      (definition.type === 'boolean' && typeof value === 'boolean')
    if (!valid) {
      throw new EdgeDbError(
        'VALIDATION_FAILED',
        `Migration produced an invalid ${definition.type} value for "${collection}.${field}".`
      )
    }
  }
}

export class Database<TSchema extends SchemaDefinition = SchemaDefinition> {
  readonly schema: NormalizedSchema
  readonly config: ResolvedDatabaseConfig
  private readonly paths: StoragePaths
  private readonly logger: Logger
  private readonly coordinator: DatabaseCoordinator
  private readonly ownerId: string
  private lease: DatabaseLease | undefined
  private unsubscribeCoordinator: (() => void | Promise<void>) | undefined
  private readonly writeQueue = new WriteQueue()
  private readonly states = new Map<string, CollectionState>()
  private readonly collections = new Map<string, Collection>()
  private manifest?: StorageManifest
  private booted = false
  private compacting = false
  private bootDurationMs = 0
  private recovery: RecoverySummary = {
    replayedOperations: 0,
    ignoredUncommittedTransactions: 0,
    ignoredTailRecords: 0,
    corruptTailFiles: [],
    repairedTailBytes: 0
  }
  private permissionChecks: StoragePermissionCheck[] = []
  private warnings: string[] = []
  private sequence = 0
  private readonly hooks: DatabaseHooks
  private readonly queryStats: QueryStats = { total: 0, scans: 0, slow: 0 }
  private readonly pendingMigrations = new Map<string, PendingMigration>()

  constructor(
    private readonly options: DatabaseOptions<TSchema>,
    hooks: DatabaseHooks = {}
  ) {
    this.schema = normalizeSchema(options.schema)
    validateSchema(this.schema)
    this.config = resolveConfig(options as DatabaseOptions<SchemaDefinition>)
    this.paths = createStoragePaths(this.config.path)
    this.logger = createLogger(options.logger, this.config.debug)
    this.coordinator =
      options.coordination?.adapter ?? new FileCoordinator(this.paths.lock, this.paths.root)
    this.ownerId = options.coordination?.ownerId ?? createId('owner')
    this.hooks = hooks
  }

  async boot(): Promise<void> {
    if (this.booted) return
    const started = performance.now()
    assertSupportedEnvironment(this.config.readOnly)
    await mkdir(this.paths.collections, { recursive: true })
    const diagnostics = await diagnoseStorage(this.paths.root, this.config.readOnly)
    this.permissionChecks = diagnostics.checks
    if (!this.config.readOnly && !diagnostics.writable) {
      logEvent(this.logger, 'error', 'storage.permission_denied', 'Storage permission diagnostics failed.', {
        path: this.paths.root,
        checks: diagnostics.checks
      })
      throw new EdgeDbError(
        'STORAGE_PERMISSION_DENIED',
        `Storage path "${this.paths.root}" must support read, write, rename, delete, and exclusive lock operations.`,
        { checks: diagnostics.checks }
      )
    }
    if (!this.config.readOnly) {
      this.lease = await this.coordinator.acquireWriterLease({
        databasePath: this.paths.root,
        ownerId: this.ownerId,
        ttlMs: this.options.coordination?.leaseTtlMs ?? 30_000
      })
    }

    try {
      await this.loadOrCreateManifest()
      await this.recoverPendingMigration()
      await this.syncSchemas()
      const committed = await this.readCommittedTransactions()
      for (const [name, collectionSchema] of Object.entries(this.schema)) {
        const state = await this.loadCollection(name, collectionSchema, committed)
        this.states.set(name, state)
      }
      await this.applyPendingMigrations()
      this.createCollectionHandles()
      this.booted = true
      await this.subscribeToCoordinator()
      this.bootDurationMs = performance.now() - started
      logEvent(this.logger, 'info', 'database.recovery', 'Storage recovery completed.', {
        replayedOperations: this.recovery.replayedOperations,
        ignoredUncommittedTransactions: this.recovery.ignoredUncommittedTransactions,
        ignoredTailRecords: this.recovery.ignoredTailRecords,
        repairedTailBytes: this.recovery.repairedTailBytes,
        corruptTailFiles: this.recovery.corruptTailFiles
      })
      logEvent(this.logger, 'info', 'database.boot', 'Database boot completed.', {
        path: this.paths.root,
        readOnly: this.config.readOnly,
        durationMs: this.bootDurationMs,
        replayedOperations: this.recovery.replayedOperations
      })
      if (
        [...this.states.values()].reduce((total, state) => total + state.records.size, 0) >
        this.config.maxRecordsWarning
      ) {
        this.warnings.push(
          `Record count exceeds the configured warning threshold (${this.config.maxRecordsWarning}).`
        )
      }
    } catch (error) {
      await this.lease?.release()
      this.lease = undefined
      throw error
    }
  }

  private async loadOrCreateManifest(): Promise<void> {
    if (await manifestExists(this.paths.manifest)) {
      this.manifest = await readManifest(this.paths.manifest)
      this.sequence = Math.max(
        0,
        ...Object.values(this.manifest.collections).map((collection) => collection.lastSequence)
      )
      return
    }
    if (this.config.readOnly) {
      throw new EdgeDbError('CORRUPT_STORAGE', 'Cannot open a missing database in readOnly mode.')
    }
    const now = new Date().toISOString()
    this.manifest = {
      formatVersion: STORAGE_FORMAT_VERSION,
      databaseId: createId('db'),
      schemaHash: schemaHash(this.schema),
      createdAt: now,
      updatedAt: now,
      collections: Object.fromEntries(
        Object.keys(this.schema).map((name) => [
          name,
          {
            activeLogSegment: 1,
            lastSequence: 0,
            snapshotSequence: 0,
            operationCountSinceSnapshot: 0,
            operationCountSinceCompaction: 0
          }
        ])
      )
    }
    await writeManifest(this.paths.manifest, this.manifest)
  }

  private async recoverPendingMigration(): Promise<void> {
    let marker: MigrationMarker
    try {
      marker = await readJsonFile<MigrationMarker>(this.paths.migration)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    if (marker.formatVersion !== 1) {
      throw new EdgeDbError('FORMAT_UNSUPPORTED', 'Unsupported migration marker format.')
    }

    try {
      await Promise.all(
        Object.values(marker.collections).map((entry) => readSnapshot(entry.snapshotPath))
      )
    } catch (error) {
      for (const [name, entry] of Object.entries(marker.collections)) {
        await atomicWriteJson(this.paths.collection(name).schema, entry.previous)
      }
      await rm(this.paths.migration, { force: true })
      this.warnings.push(
        `An incomplete schema migration was rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return
    }

    for (const [name, entry] of Object.entries(marker.collections)) {
      await writeStoredCollectionSchema(this.paths.collection(name).schema, name, entry.desired)
      const config = this.manifest!.collections[name]!
      config.snapshotSequence = marker.sequence
      config.lastSequence = Math.max(config.lastSequence, marker.sequence)
      config.operationCountSinceSnapshot = 0
    }
    this.manifest!.schemaHash = marker.desiredSchemaHash
    await writeManifest(this.paths.manifest, this.manifest!)
    await rm(this.paths.migration, { force: true })
    this.warnings.push('A previously staged schema migration was completed during recovery.')
  }

  private async applyPendingMigrations(): Promise<void> {
    if (this.pendingMigrations.size === 0) return
    const migratedStates = new Map<string, CollectionState>()
    const marker: MigrationMarker = {
      formatVersion: 1,
      desiredSchemaHash: schemaHash(this.schema),
      sequence: this.sequence,
      collections: {}
    }

    for (const [name, pending] of this.pendingMigrations) {
      const desired = this.schema[name]!
      const records = new Map<string, Record<string, unknown>>()
      for (const [id, record] of this.states.get(name)!.records) {
        const migrated = await pending.migration(structuredClone(record), {
          collection: name,
          changes: pending.changes
        })
        if (String(migrated.id) !== id) {
          throw new EdgeDbError(
            'VALIDATION_FAILED',
            `Migration for "${name}" cannot change record ids.`
          )
        }
        assertRecordMatchesSchema(name, migrated, desired)
        records.set(id, migrated)
      }
      const state = { records, indexes: new IndexRegistry(desired, records) }
      migratedStates.set(name, state)
      marker.collections[name] = {
        previous: pending.previous,
        desired,
        snapshotPath: this.paths.collection(name).snapshot(this.sequence)
      }
    }

    await atomicWriteJson(this.paths.migration, marker)
    try {
      for (const [name, state] of migratedStates) {
        const snapshotPath = marker.collections[name]!.snapshotPath
        await writeSnapshot(snapshotPath, name, this.sequence, [...state.records.values()])
        await readSnapshot(snapshotPath)
      }
      for (const [name, state] of migratedStates) {
        this.states.set(name, state)
        await writeStoredCollectionSchema(
          this.paths.collection(name).schema,
          name,
          this.schema[name]!
        )
        const config = this.manifest!.collections[name]!
        config.snapshotSequence = this.sequence
        config.lastSequence = Math.max(config.lastSequence, this.sequence)
        config.operationCountSinceSnapshot = 0
      }
      this.manifest!.schemaHash = marker.desiredSchemaHash
      await writeManifest(this.paths.manifest, this.manifest!)
      await rm(this.paths.migration, { force: true })
      logEvent(this.logger, 'info', 'schema.migrated', 'Schema migration completed.', {
        collections: [...migratedStates.keys()],
        sequence: this.sequence
      })
    } catch (error) {
      logEvent(this.logger, 'error', 'schema.migration_failed', 'Schema migration failed.', {
        reason: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  private async syncSchemas(): Promise<void> {
    if (!this.manifest) return
    this.pendingMigrations.clear()
    for (const [name, collection] of Object.entries(this.schema)) {
      const paths = this.paths.collection(name)
      await mkdir(paths.root, { recursive: true })
      if (!this.manifest.collections[name]) {
        if (this.config.readOnly) {
          throw new EdgeDbError('SCHEMA_UNSAFE', `Collection "${name}" is missing in readOnly storage.`)
        }
        this.manifest.collections[name] = {
          activeLogSegment: 1,
          lastSequence: 0,
          snapshotSequence: 0,
          operationCountSinceSnapshot: 0,
          operationCountSinceCompaction: 0
        }
      }
      if (!this.config.readOnly && this.options.schemaSync?.enabled !== false) {
        const result: CollectionSchemaSyncResult = await syncCollectionSchema(
          paths.schema,
          name,
          collection,
          this.options.schemaSync ?? {},
          this.logger
        )
        this.warnings.push(...result.warnings)
        if (result.migration && result.previous) {
          this.pendingMigrations.set(name, {
            changes: result.changes.filter((change) => change.requiresMigration),
            migration: result.migration,
            previous: result.previous
          })
        }
      }
    }
    if (!this.config.readOnly && this.pendingMigrations.size === 0) {
      this.manifest.schemaHash = schemaHash(this.schema)
      await writeManifest(this.paths.manifest, this.manifest)
    }
  }

  private async readCommittedTransactions(): Promise<Set<string>> {
    const result = await readLog(this.paths.journal, {
      repairTail: !this.config.readOnly,
      quarantineTail: true
    })
    this.recovery.ignoredTailRecords += result.ignoredTailRecords
    this.recovery.repairedTailBytes += result.repairedTailBytes
    if (result.tailWasCorrupt) this.recovery.corruptTailFiles.push(this.paths.journal)
    const started = new Set<string>()
    const committed = new Set<string>()
    for (const record of result.records) {
      this.sequence = Math.max(this.sequence, record.sequence)
      if (record.op === 'transaction-start') started.add(record.txId)
      if (record.op === 'transaction-rollback') started.delete(record.txId)
      if (record.op === 'transaction-commit' && started.has(record.txId)) {
        committed.add(record.txId)
        started.delete(record.txId)
      }
    }
    this.recovery.ignoredUncommittedTransactions += started.size
    return committed
  }

  private async loadCollection(
    name: string,
    collectionSchema: NormalizedSchema[string],
    committed: Set<string>
  ): Promise<CollectionState> {
    const paths = this.paths.collection(name)
    const config = this.manifest!.collections[name]!
    const records = new Map<string, Record<string, unknown>>()
    let snapshotSequence = 0
    if (config.snapshotSequence > 0) {
      const snapshot = await readSnapshot(paths.snapshot(config.snapshotSequence))
      snapshotSequence = snapshot.sequence
      for (const record of snapshot.records) records.set(String(record.id), record)
    }

    let files: string[] = []
    try {
      files = (await readdir(paths.root))
        .filter((file) => /^log-\d{6}\.ndjson$/.test(file))
        .sort()
    } catch {
      files = []
    }
    for (const file of files) {
      const result = await readLog(join(paths.root, file), {
        repairTail: !this.config.readOnly,
        quarantineTail: true
      })
      this.recovery.ignoredTailRecords += result.ignoredTailRecords
      this.recovery.repairedTailBytes += result.repairedTailBytes
      if (result.tailWasCorrupt) this.recovery.corruptTailFiles.push(join(paths.root, file))
      for (const record of result.records) {
        this.sequence = Math.max(this.sequence, record.sequence)
        if (
          record.sequence <= snapshotSequence ||
          !committed.has(record.txId) ||
          !['insert', 'update', 'delete', 'restore'].includes(record.op) ||
          !record.id
        ) {
          continue
        }
        const operation: WriteOperation = {
          collection: name,
          op: record.op as WriteOperation['op'],
          id: record.id,
          ...(record.data ? { data: record.data } : {}),
          ...(record.patch ? { patch: record.patch } : {})
        }
        const temporaryState: CollectionState = {
          records,
          indexes: new IndexRegistry(collectionSchema, records)
        }
        applyOperationToState(temporaryState, operation)
        this.recovery.replayedOperations += 1
      }
    }
    return { records, indexes: new IndexRegistry(collectionSchema, records) }
  }

  private createCollectionHandles(): void {
    this.collections.clear()
    for (const [name, schema] of Object.entries(this.schema)) {
      const state = this.states.get(name)!
      this.collections.set(
        name,
        new Collection(
          name,
          schema,
          state,
          this.config,
          async (operations) => {
            await this.writeQueue.run(async () => {
              await this.assertWritable()
              this.validateOperations(operations)
              await this.persistOperations(operations)
              operations.forEach((operation) => applyOperationToState(this.states.get(operation.collection)!, operation))
              await this.runAutomaticMaintenance()
            })
            return true
          },
          (collection, id) => this.assertDeleteAllowed(collection, id, this.states),
          this.logger,
          (plan) => {
            this.queryStats.total += 1
            if (plan.strategy === 'scan') this.queryStats.scans += 1
            if (plan.durationMs >= this.config.slowQueryMs) this.queryStats.slow += 1
          },
          (collection, records, include) => this.resolveIncludes(collection, records, include)
        )
      )
    }
  }

  private assertBooted(): void {
    if (!this.booted) throw new EdgeDbError('NOT_BOOTED', 'Call db.boot() before using the database.')
  }

  private async assertWritable(): Promise<void> {
    this.assertBooted()
    if (this.config.readOnly) {
      throw new EdgeDbError('READ_ONLY', 'Database is open in readOnly mode.')
    }
    try {
      await this.lease?.assertOwned()
    } catch (error) {
      throw new EdgeDbError(
        'LEASE_LOST',
        'The database writer lease is no longer owned. Writes are disabled until restart.',
        { cause: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  collection<K extends keyof InferSchema<TSchema> & string>(
    name: K
  ): Collection<
    InferSchema<TSchema>[K],
    InferCreate<TSchema[K]>,
    InferUpdate<TSchema[K]>
  >
  collection<TRecord extends Record<string, unknown> = Record<string, unknown>>(name: string): Collection<TRecord>
  collection(name: string): Collection<any, any, any> {
    this.assertBooted()
    const collection = this.collections.get(name)
    if (!collection) throw new EdgeDbError('COLLECTION_NOT_FOUND', `Collection "${name}" is not defined.`)
    return collection
  }

  private async resolveIncludes(
    collectionName: string,
    records: Record<string, unknown>[],
    include: IncludeQuery,
    states: Map<string, CollectionState> = this.states
  ): Promise<Record<string, unknown>[]> {
    const sourceSchema = this.schema[collectionName]!
    const entries = Object.entries(include)
    for (const [relationName, options] of entries) {
      const relation = sourceSchema.relations[relationName]
      if (!relation) {
        throw new EdgeDbError(
          'SCHEMA_INVALID',
          `Relation "${collectionName}.${relationName}" is not declared.`
        )
      }
      const requestedLimit = options === true ? this.config.maxIncludeRecords : options.limit
      if (
        requestedLimit !== undefined &&
        (!Number.isInteger(requestedLimit) ||
          requestedLimit < 1 ||
          requestedLimit > this.config.maxIncludeRecords)
      ) {
        throw new EdgeDbError(
          'QUERY_LIMIT',
          `Include limit must be between 1 and ${this.config.maxIncludeRecords}.`
        )
      }
    }

    return Promise.all(
      records.map(async (record) => {
        const output = { ...record }
        for (const [relationName, options] of entries) {
          const relation = sourceSchema.relations[relationName]!
          const targetSchema = this.schema[relation.collection]
          const targetState = states.get(relation.collection)
          if (!targetSchema || !targetState) {
            throw new EdgeDbError(
              'SCHEMA_INVALID',
              `Relation "${collectionName}.${relationName}" targets an unknown collection.`
            )
          }
          const select = options === true ? undefined : options.select
          const limit =
            options === true
              ? this.config.maxIncludeRecords
              : options.limit ?? this.config.maxIncludeRecords
          const foreignField = relation.foreignField ?? 'id'
          const indexed =
            foreignField === 'id' ||
            targetSchema.unique.includes(foreignField) ||
            targetSchema.indexes.some((index) => index[0] === foreignField)
          if (!indexed) {
            logEvent(
              this.logger,
              'warn',
              'query.planner_warning',
              `Relation include "${collectionName}.${relationName}" scans "${relation.collection}".`,
              { recommendedIndex: [foreignField] }
            )
          }

          if (relation.type === 'belongsTo') {
            const localValue = record[relation.localField]
            const related = [...targetState.records.values()].find(
              (candidate) => Object.is(candidate[foreignField], localValue)
            )
            output[relationName] = related
              ? projectRecord(related, targetSchema, select)
              : null
          } else {
            const localValue = record[relation.localField]
            output[relationName] = [...targetState.records.values()]
              .filter((candidate) => Object.is(candidate[foreignField], localValue))
              .slice(0, limit)
              .map((candidate) => projectRecord(candidate, targetSchema, select))
          }
        }
        return output
      })
    )
  }

  private cloneStates(): Map<string, CollectionState> {
    return new Map(
      Object.entries(this.schema).map(([name, schema]) => {
        const records = new Map(
          [...this.states.get(name)!.records].map(([id, record]) => [id, structuredClone(record)])
        )
        return [name, { records, indexes: new IndexRegistry(schema, records) }]
      })
    )
  }

  async transaction<T>(callback: (tx: TransactionDatabase) => Promise<T>): Promise<T> {
    return this.writeQueue.run(async () => {
      await this.assertWritable()
      const states = this.cloneStates()
      const staged: WriteOperation[] = []
      const handles = new Map<string, Collection>()
      for (const [name, schema] of Object.entries(this.schema)) {
        handles.set(
          name,
          new Collection(
            name,
            schema,
            states.get(name)!,
            this.config,
            async (operations) => {
              this.validateOperations(operations, states)
              staged.push(...operations)
              return false
            },
            (collection, id) => this.assertDeleteAllowed(collection, id, states),
            this.logger,
            (plan) => {
              this.queryStats.total += 1
              if (plan.strategy === 'scan') this.queryStats.scans += 1
              if (plan.durationMs >= this.config.slowQueryMs) this.queryStats.slow += 1
            },
            (collection, records, include) => this.resolveIncludes(collection, records, include, states)
          )
        )
      }
      const tx: TransactionDatabase = {
        collection: <TRecord extends Record<string, unknown> = Record<string, unknown>>(name: string) => {
          const collection = handles.get(name)
          if (!collection) {
            throw new EdgeDbError('COLLECTION_NOT_FOUND', `Collection "${name}" is not defined.`)
          }
          return collection as Collection<TRecord>
        }
      }

      try {
        const result = await callback(tx)
        this.validateOperations(staged)
        await this.persistOperations(staged)
        for (const operation of staged) {
          applyOperationToState(this.states.get(operation.collection)!, operation)
        }
        await this.runAutomaticMaintenance()
        return result
      } catch (error) {
        logEvent(this.logger, 'warn', 'transaction.rollback', 'Transaction rolled back.', {
          operationCount: staged.length,
          reason: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
    })
  }

  private validateOperations(
    operations: WriteOperation[],
    sourceStates: Map<string, CollectionState> = this.states
  ): void {
    const states = new Map(
      Object.entries(this.schema).map(([name, schema]) => {
        const records = new Map(
          [...sourceStates.get(name)!.records].map(([id, record]) => [id, structuredClone(record)])
        )
        return [name, { records, indexes: new IndexRegistry(schema, records) }]
      })
    )

    for (const operation of operations) {
      const schema = this.schema[operation.collection]
      const state = states.get(operation.collection)
      if (!schema || !state) {
        throw new EdgeDbError('COLLECTION_NOT_FOUND', `Collection "${operation.collection}" is not defined.`)
      }
      const current = state.records.get(operation.id)
      const next =
        operation.op === 'insert'
          ? operation.data
          : operation.op === 'update' && current
            ? { ...current, ...operation.patch }
            : current
      if ((operation.op === 'insert' || operation.op === 'update') && next) {
        state.indexes.assertUnique(next, operation.op === 'update' ? operation.id : undefined)
        for (const [field, definition] of Object.entries(schema.fields)) {
          if (!definition.ref || next[field] === null || next[field] === undefined) continue
          const target = states.get(definition.ref.collection)
          const targetField = definition.ref.field ?? 'id'
          const exists = [...(target?.records.values() ?? [])].some(
            (record) => Object.is(record[targetField], next[field])
          )
          if (!exists) {
            throw new EdgeDbError(
              'REFERENTIAL_INTEGRITY',
              `Reference "${operation.collection}.${field}" does not match "${definition.ref.collection}.${targetField}".`
            )
          }
        }
      }
      if (operation.op === 'delete') this.assertDeleteAllowed(operation.collection, operation.id, states)
      applyOperationToState(state, operation)
    }
  }

  private assertDeleteAllowed(
    collectionName: string,
    id: string,
    states: Map<string, CollectionState>
  ): void {
    const targetRecord = states.get(collectionName)?.records.get(id)
    if (!targetRecord) return
    for (const [sourceName, sourceSchema] of Object.entries(this.schema)) {
      for (const [field, definition] of Object.entries(sourceSchema.fields)) {
        if (definition.ref?.collection !== collectionName || definition.ref.onDelete !== 'restrict') continue
        const targetField = definition.ref.field ?? 'id'
        const targetValue = targetRecord[targetField]
        const referencing = [...states.get(sourceName)!.records.values()].find(
          (record) => Object.is(record[field], targetValue)
        )
        if (referencing) {
          throw new EdgeDbError(
            'REFERENTIAL_INTEGRITY',
            `Cannot delete "${collectionName}.${id}" because "${sourceName}.${field}" references it with onDelete: restrict.`
          )
        }
      }
    }
  }

  private nextSequence(): number {
    this.sequence += 1
    return this.sequence
  }

  private async persistOperations(operations: WriteOperation[]): Promise<void> {
    if (operations.length === 0) return
    for (const operation of operations) await this.hooks.beforeWrite?.(operation)
    const txId = createTransactionId()
    const start: LogRecord = {
      v: 1,
      sequence: this.nextSequence(),
      collection: '__journal__',
      txId,
      op: 'transaction-start',
      ts: Date.now()
    }
    await appendLogRecords(this.paths.journal, [start])
    await this.hooks.onStorageStage?.('journal-start', { txId })

    const grouped = new Map<string, LogRecord[]>()
    for (const operation of operations) {
      const records = grouped.get(operation.collection) ?? []
      if (records.length === 0) {
        records.push({
          v: 1,
          sequence: this.nextSequence(),
          collection: operation.collection,
          txId,
          op: 'transaction-start',
          ts: Date.now()
        })
      }
      records.push({
        v: 1,
        sequence: this.nextSequence(),
        collection: operation.collection,
        txId,
        op: operation.op,
        id: operation.id,
        ...(operation.data ? { data: operation.data } : {}),
        ...(operation.patch ? { patch: operation.patch } : {}),
        ts: Date.now()
      })
      grouped.set(operation.collection, records)
    }

    try {
      for (const [collection, records] of grouped) {
        records.push({
          v: 1,
          sequence: this.nextSequence(),
          collection,
          txId,
          op: 'transaction-commit',
          ts: Date.now()
        })
        const collectionManifest = this.manifest!.collections[collection]!
        await appendLogRecords(
          this.paths.collection(collection).log(collectionManifest.activeLogSegment),
          records
        )
        await this.hooks.onStorageStage?.('collection-append', {
          txId,
          collection
        })
      }
      await appendLogRecords(this.paths.journal, [
        {
          v: 1,
          sequence: this.nextSequence(),
          collection: '__journal__',
          txId,
          op: 'transaction-commit',
          ts: Date.now()
        }
      ])
      await this.hooks.onStorageStage?.('journal-commit', { txId })
    } catch (error) {
      try {
        await appendLogRecords(this.paths.journal, [
          {
            v: 1,
            sequence: this.nextSequence(),
            collection: '__journal__',
            txId,
            op: 'transaction-rollback',
            ts: Date.now()
          }
        ])
      } catch {
        // The missing commit marker is sufficient for recovery to ignore the transaction.
      }
      throw error
    }

    for (const [collection, records] of grouped) {
      const collectionManifest = this.manifest!.collections[collection]!
      collectionManifest.lastSequence = Math.max(
        collectionManifest.lastSequence,
        ...records.map((record) => record.sequence)
      )
      collectionManifest.operationCountSinceSnapshot += operations.filter(
        (operation) => operation.collection === collection
      ).length
      collectionManifest.operationCountSinceCompaction =
        (collectionManifest.operationCountSinceCompaction ?? 0) +
        operations.filter((operation) => operation.collection === collection).length
    }
    await writeManifest(this.paths.manifest, this.manifest!)
    await this.hooks.onStorageStage?.('manifest-write', { txId })
    for (const operation of operations) await this.hooks.afterWrite?.(operation)
    if (this.coordinator.publish) {
      const event: DatabaseChangeEvent = {
        databasePath: this.paths.root,
        ownerId: this.ownerId,
        sequence: this.sequence,
        collections: [...new Set(operations.map((operation) => operation.collection))],
        committedAt: new Date().toISOString()
      }
      try {
        await this.coordinator.publish(event)
      } catch (error) {
        logEvent(
          this.logger,
          'warn',
          'coordination.publish_failed',
          'The transaction committed, but its coordination event could not be published.',
          { reason: error instanceof Error ? error.message : String(error) }
        )
      }
    }
  }

  async compact(): Promise<void> {
    await this.writeQueue.run(async () => {
      await this.assertWritable()
      await this.compactUnlocked()
    })
  }

  private async runAutomaticMaintenance(): Promise<void> {
    const collectionConfigs = Object.values(this.manifest!.collections)
    if (
      this.config.compactionEnabled &&
      collectionConfigs.some(
        (config) =>
          (config.operationCountSinceCompaction ?? config.operationCountSinceSnapshot) >=
          this.config.compactionThreshold
      )
    ) {
      await this.compactUnlocked()
      return
    }
    if (
      this.config.snapshotsEnabled &&
      collectionConfigs.some(
        (config) => config.operationCountSinceSnapshot >= this.config.snapshotEveryOperations
      )
    ) {
      await this.snapshotUnlocked()
    }
  }

  private async snapshotUnlocked(): Promise<void> {
    for (const [name, state] of this.states) {
      const snapshotPath = this.paths.collection(name).snapshot(this.sequence)
      await writeSnapshot(snapshotPath, name, this.sequence, [...state.records.values()])
      await readSnapshot(snapshotPath)
      await this.hooks.onStorageStage?.('snapshot-write', {
        collection: name,
        sequence: this.sequence
      })
      const config = this.manifest!.collections[name]!
      config.snapshotSequence = this.sequence
      config.lastSequence = this.sequence
      config.operationCountSinceSnapshot = 0
    }
    await writeManifest(this.paths.manifest, this.manifest!)
    logEvent(this.logger, 'info', 'database.snapshot', 'Verified snapshots activated.', {
      sequence: this.sequence
    })
  }

  private async compactUnlocked(): Promise<void> {
    this.compacting = true
    const started = performance.now()
    try {
      for (const [name, state] of this.states) {
        const paths = this.paths.collection(name)
        const snapshotPath = paths.snapshot(this.sequence)
        await writeSnapshot(snapshotPath, name, this.sequence, [...state.records.values()])
        await readSnapshot(snapshotPath)
        await this.hooks.onStorageStage?.('snapshot-write', {
          collection: name,
          sequence: this.sequence
        })
      }

      for (const [name, config] of Object.entries(this.manifest!.collections)) {
        config.snapshotSequence = this.sequence
        config.lastSequence = this.sequence
        config.operationCountSinceSnapshot = 0
        config.operationCountSinceCompaction = 0
        config.activeLogSegment += 1
        await mkdir(this.paths.collection(name).archive, { recursive: true })
      }
      await writeManifest(this.paths.manifest, this.manifest!)
      await this.hooks.onStorageStage?.('compaction-activate', {
        sequence: this.sequence
      })

      for (const [name, config] of Object.entries(this.manifest!.collections)) {
        const paths = this.paths.collection(name)
        const files = (await readdir(paths.root)).filter((file) => /^log-\d{6}\.ndjson$/.test(file))
        for (const file of files) {
          const segment = Number(file.match(/\d{6}/)?.[0])
          if (segment < config.activeLogSegment) {
            await rename(join(paths.root, file), join(paths.archive, `${Date.now()}-${file}`))
          }
        }
      }
      try {
        await mkdir(this.paths.archive, { recursive: true })
        await rename(this.paths.journal, join(this.paths.archive, `${Date.now()}-journal.ndjson`))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      logEvent(this.logger, 'info', 'database.compaction', 'Compaction completed.', {
        durationMs: performance.now() - started,
        sequence: this.sequence
      })
    } finally {
      this.compacting = false
    }
  }

  async backup(targetPath: string): Promise<string> {
    return this.writeQueue.run(async () => {
      this.assertBooted()
      const result = await createBackup(this.paths.root, targetPath)
      logEvent(this.logger, 'info', 'database.backup', 'Backup completed.', {
        targetPath: result
      })
      return result
    })
  }

  async restore(backupPath: string): Promise<void> {
    const wasBooted = this.booted
    if (wasBooted) await this.close()
    await restoreBackup(this.paths.root, backupPath)
    logEvent(this.logger, 'info', 'database.restore', 'Backup restored.', { backupPath })
    if (wasBooted) await this.boot()
  }

  async export(): Promise<Record<string, Record<string, unknown>[]>> {
    this.assertBooted()
    return Object.fromEntries(
      [...this.states].map(([name, state]) => [
        name,
        [...state.records.values()].map((record) => structuredClone(record))
      ])
    )
  }

  async import(data: Record<string, Record<string, unknown>[]>): Promise<void> {
    await this.transaction(async (tx) => {
      for (const [name, records] of Object.entries(data)) {
        const collection = tx.collection(name)
        await collection.createMany(records)
      }
    })
  }

  async planSchemaChanges(): Promise<SchemaChangePlan> {
    return planSchema(await loadStoredSchema(this.paths.root), this.schema)
  }

  async refresh(): Promise<void> {
    await this.writeQueue.run(async () => {
      this.assertBooted()
      if (!this.config.readOnly) {
        throw new EdgeDbError('READ_ONLY', 'refresh() is reserved for read-only replicas.')
      }
      this.manifest = await readManifest(this.paths.manifest)
      const committed = await this.readCommittedTransactions()
      const nextStates = new Map<string, CollectionState>()
      for (const [name, collectionSchema] of Object.entries(this.schema)) {
        nextStates.set(name, await this.loadCollection(name, collectionSchema, committed))
      }
      this.states.clear()
      for (const [name, state] of nextStates) this.states.set(name, state)
      this.createCollectionHandles()
      logEvent(this.logger, 'info', 'database.refresh', 'Read-only replica refreshed.', {
        sequence: this.sequence
      })
    })
  }

  private async subscribeToCoordinator(): Promise<void> {
    if (
      !this.config.readOnly ||
      !this.options.coordination?.autoRefreshReadOnly ||
      !this.coordinator.subscribe
    ) {
      return
    }
    const unsubscribe = await this.coordinator.subscribe(this.paths.root, async (event) => {
      if (event.ownerId === this.ownerId || event.sequence <= this.sequence || !this.booted) return
      try {
        await this.refresh()
      } catch (error) {
        logEvent(this.logger, 'error', 'database.refresh_failed', 'Read-only refresh failed.', {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    })
    if (unsubscribe) this.unsubscribeCoordinator = unsubscribe
  }

  async diagnostics(): Promise<DatabaseDiagnostics> {
    this.assertBooted()
    const collections = await Promise.all(
      [...this.states].map(async ([name, state]) => {
        const files = await readdir(this.paths.collection(name).root)
        const logFiles = files.filter((file) => file.startsWith('log-')).sort()
        const snapshotFiles = files.filter((file) => file.startsWith('snapshot-')).sort()
        const latestSnapshot = snapshotFiles.at(-1)
        return {
          name,
          recordCount: state.records.size,
          indexCount: state.indexes.count,
          logFiles,
          snapshotFiles,
          ...(latestSnapshot
            ? {
                lastSnapshotTime: (
                  await stat(join(this.paths.collection(name).root, latestSnapshot))
                ).mtime.toISOString()
              }
            : {}),
          approximateMemoryBytes: Buffer.byteLength(JSON.stringify([...state.records.values()]))
        }
      })
    )
    return {
      path: this.paths.root,
      platform: process.platform,
      nodeVersion: process.version,
      readOnly: this.config.readOnly,
      lockStatus: this.config.readOnly ? 'not-required' : this.lease ? 'owned' : 'unavailable',
      storageSizeBytes: await directorySize(this.paths.root),
      collectionCount: collections.length,
      collections,
      bootDurationMs: this.bootDurationMs,
      replayedOperations: this.recovery.replayedOperations,
      ignoredTailRecords: this.recovery.ignoredTailRecords,
      repairedTailBytes: this.recovery.repairedTailBytes,
      compactionStatus: this.compacting ? 'running' : 'idle',
      permissionChecks: this.permissionChecks,
      warnings: [...this.warnings],
      coordination: {
        adapter: this.coordinator.name,
        ownerId: this.ownerId,
        writerLease: this.config.readOnly ? 'not-required' : this.lease ? 'owned' : 'unavailable'
      },
      ...(this.config.queryStats ? { queryStats: { ...this.queryStats } } : {})
    }
  }

  async close(): Promise<void> {
    if (!this.booted) return
    await this.writeQueue.idle()
    await this.unsubscribeCoordinator?.()
    this.unsubscribeCoordinator = undefined
    await this.lease?.release()
    this.lease = undefined
    this.booted = false
    this.states.clear()
    this.collections.clear()
    logEvent(this.logger, 'info', 'database.close', 'Database closed.', { path: this.paths.root })
  }
}
