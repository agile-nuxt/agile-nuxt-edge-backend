import { access } from 'node:fs/promises'
import { EdgeDbError } from '../core/errors.js'
import { logEvent, type Logger } from '../core/logger.js'
import type {
  CollectionMigration,
  NormalizedCollectionSchema,
  SchemaChange,
  SchemaSyncOptions
} from '../types/public.js'
import { SCHEMA_FORMAT_VERSION } from '../types/public.js'
import { atomicWriteJson, readJsonFile } from '../storage/atomicFile.js'
import { planCollectionChanges } from './planSchema.js'

export interface StoredCollectionSchema {
  formatVersion: number
  collection: string
  schema: NormalizedCollectionSchema
  updatedAt: string
}

export interface CollectionSchemaSyncResult {
  warnings: string[]
  changes: SchemaChange[]
  previous?: StoredCollectionSchema
  migration?: CollectionMigration
}

export async function writeStoredCollectionSchema(
  path: string,
  collection: string,
  schema: NormalizedCollectionSchema
): Promise<void> {
  await atomicWriteJson(path, {
    formatVersion: SCHEMA_FORMAT_VERSION,
    collection,
    schema,
    updatedAt: new Date().toISOString()
  } satisfies StoredCollectionSchema)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function syncCollectionSchema(
  path: string,
  collection: string,
  desired: NormalizedCollectionSchema,
  options: SchemaSyncOptions,
  logger: Logger
): Promise<CollectionSchemaSyncResult> {
  const warnings: string[] = []
  if (!(await exists(path))) {
    if (options.createCollections === false) {
      throw new EdgeDbError('SCHEMA_UNSAFE', `Collection "${collection}" is missing on disk.`)
    }
    await writeStoredCollectionSchema(path, collection, desired)
    logEvent(logger, 'info', 'schema.collection_created', 'Collection schema created.', { collection })
    return {
      warnings,
      changes: planCollectionChanges(collection, undefined, desired)
    }
  }

  const stored = await readJsonFile<StoredCollectionSchema>(path)
  if (stored.formatVersion !== SCHEMA_FORMAT_VERSION) {
    throw new EdgeDbError(
      'FORMAT_UNSUPPORTED',
      `Schema format ${stored.formatVersion} for "${collection}" is unsupported.`
    )
  }

  const changes = planCollectionChanges(collection, stored.schema, desired)
  const migrationChanges = changes.filter((change) => change.requiresMigration)
  const migration = options.migrations?.[collection]
  if (migrationChanges.length > 0 && !migration) {
    throw new EdgeDbError(
      'MIGRATION_REQUIRED',
      `Schema changes for "${collection}" require an explicit migration handler.`,
      { changes: migrationChanges }
    )
  }
  if (changes.some((change) => !change.safe) && options.mode === 'strict' && !migration) {
    throw new EdgeDbError('SCHEMA_UNSAFE', `Unsafe schema changes detected for "${collection}".`, {
      changes
    })
  }
  for (const change of changes.filter((item) => !item.safe)) {
    warnings.push(change.description)
  }
  if (migrationChanges.length > 0) {
    return {
      warnings,
      changes,
      previous: stored,
      ...(migration ? { migration } : {})
    }
  }

  const merged: NormalizedCollectionSchema = {
    ...desired,
    fields: {
      ...stored.schema.fields,
      ...(options.addFields === false
        ? Object.fromEntries(
            Object.entries(desired.fields).filter(([field]) => Boolean(stored.schema.fields[field]))
          )
        : desired.fields)
    },
    indexes:
      options.createIndexes === false
        ? stored.schema.indexes
        : [...new Map([...stored.schema.indexes, ...desired.indexes].map((item) => [item.join(','), item])).values()],
    unique: [...new Set([...stored.schema.unique, ...desired.unique])]
  }

  await writeStoredCollectionSchema(path, collection, merged)

  for (const warning of warnings) {
    logEvent(logger, 'warn', 'schema.sync_warning', warning, { collection })
  }
  logEvent(logger, 'info', 'schema.synced', 'Collection schema synchronized.', {
    collection,
    warnings: warnings.length
  })
  return { warnings, changes, previous: stored }
}
