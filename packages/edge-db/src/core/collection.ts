import { EdgeDbError } from './errors.js'
import { createId } from './ids.js'
import { logEvent, type Logger } from './logger.js'
import { IndexRegistry } from '../index/indexRegistry.js'
import { matchesWhere, validateWhere } from '../query/filters.js'
import { projectRecord } from '../query/projection.js'
import type {
  FindQuery,
  NormalizedCollectionSchema,
  QueryPlan,
  QueryResult,
  Where,
  WriteOperation
} from '../types/public.js'
import type { ResolvedDatabaseConfig } from './config.js'

export interface CollectionState {
  records: Map<string, Record<string, unknown>>
  indexes: IndexRegistry
}

export type OperationExecutor = (operations: WriteOperation[]) => Promise<boolean>
export type DeleteGuard = (collection: string, id: string) => void
export type QueryObserver = (plan: QueryPlan) => void

function validateFieldValue(field: string, value: unknown, type: string, nullable: boolean): void {
  if (value === null) {
    if (!nullable) throw new EdgeDbError('VALIDATION_FAILED', `Field "${field}" cannot be null.`)
    return
  }
  if (value === undefined) return
  const valid =
    type === 'json' ||
    ((type === 'id' || type === 'text' || type === 'datetime') && typeof value === 'string') ||
    ((type === 'integer' || type === 'real') && typeof value === 'number' && Number.isFinite(value)) ||
    (type === 'boolean' && typeof value === 'boolean')
  if (!valid || (type === 'integer' && !Number.isInteger(value))) {
    throw new EdgeDbError('VALIDATION_FAILED', `Field "${field}" must be ${type}.`)
  }
}

export class Collection<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    readonly name: string,
    readonly schema: NormalizedCollectionSchema,
    readonly state: CollectionState,
    private readonly config: ResolvedDatabaseConfig,
    private readonly execute: OperationExecutor,
    private readonly deleteGuard: DeleteGuard,
    private readonly logger: Logger,
    private readonly observeQuery?: QueryObserver
  ) {}

  private normalizeInput(
    input: Record<string, unknown>,
    mode: 'create' | 'update'
  ): Record<string, unknown> {
    for (const field of Object.keys(input)) {
      if (!this.schema.fields[field]) {
        throw new EdgeDbError('UNKNOWN_FIELD', `Unknown field "${this.name}.${field}".`)
      }
    }

    const now = new Date().toISOString()
    const output: Record<string, unknown> = {}
    for (const [name, definition] of Object.entries(this.schema.fields)) {
      let value = input[name]
      if (mode === 'create') {
        if (name === 'id' && value === undefined) value = createId(this.name.slice(0, 3))
        if (definition.hasDefault && value === undefined) {
          value =
            typeof definition.defaultValue === 'function'
              ? (definition.defaultValue as () => unknown)()
              : structuredClone(definition.defaultValue)
        }
        if (this.schema.timestamps && name === 'createdAt' && value === undefined) value = now
      }
      if (this.schema.timestamps && name === 'updatedAt') value = now
      if (mode === 'update' && value === undefined) continue
      validateFieldValue(name, value, definition.type, definition.nullable)
      if (value === undefined && mode === 'create' && !definition.nullable && !definition.hasDefault) {
        throw new EdgeDbError('VALIDATION_FAILED', `Required field "${this.name}.${name}" is missing.`)
      }
      if (value !== undefined) output[name] = value
    }
    return output
  }

  private applyLocal(operation: WriteOperation): void {
    const current = this.state.records.get(operation.id)
    if (operation.op === 'insert' && operation.data) {
      this.state.indexes.add(operation.data)
      this.state.records.set(operation.id, operation.data)
    } else if (operation.op === 'update' && current && operation.patch) {
      const next = { ...current, ...operation.patch }
      this.state.indexes.update(current, next)
      this.state.records.set(operation.id, next)
    } else if (operation.op === 'delete' && current) {
      this.state.indexes.remove(current)
      this.state.records.delete(operation.id)
    } else if (operation.op === 'restore' && current) {
      const next = { ...current, deletedAt: null }
      this.state.indexes.update(current, next)
      this.state.records.set(operation.id, next)
    }
  }

  async create(data: Partial<TRecord>): Promise<TRecord> {
    const record = this.normalizeInput(data, 'create')
    this.state.indexes.assertUnique(record)
    const operation: WriteOperation = {
      collection: this.name,
      op: 'insert',
      id: String(record.id),
      data: record
    }
    const applied = await this.execute([operation])
    if (!applied) this.applyLocal(operation)
    return projectRecord(record, this.schema) as TRecord
  }

  async createMany(rows: Array<Partial<TRecord>>): Promise<TRecord[]> {
    const records = rows.map((row) => this.normalizeInput(row, 'create'))
    const clone = new Map(this.state.records)
    const indexes = new IndexRegistry(this.schema, clone)
    for (const record of records) {
      indexes.assertUnique(record)
      indexes.add(record)
      clone.set(String(record.id), record)
    }
    const operations = records.map(
      (record): WriteOperation => ({
        collection: this.name,
        op: 'insert',
        id: String(record.id),
        data: record
      })
    )
    const applied = await this.execute(operations)
    if (!applied) operations.forEach((operation) => this.applyLocal(operation))
    return records.map((record) => projectRecord(record, this.schema) as TRecord)
  }

  async findById(id: string, options: { withDeleted?: boolean; select?: string[] } = {}): Promise<TRecord | null> {
    const record = this.state.records.get(id)
    if (!record || (!options.withDeleted && record.deletedAt)) return null
    return projectRecord(record, this.schema, options.select) as TRecord
  }

  async findByIdInternal(id: string): Promise<TRecord | null> {
    const record = this.state.records.get(id)
    return record ? (structuredClone(record) as TRecord) : null
  }

  async findFirst(query: FindQuery = {}): Promise<TRecord | null> {
    const result = await this.findMany({ ...query, limit: 1 })
    return result.data[0] ?? null
  }

  async findFirstInternal(query: FindQuery = {}): Promise<TRecord | null> {
    const result = await this.findMany({ ...query, limit: 1, select: ['id'] })
    const id = result.data[0]?.id
    return id ? this.findByIdInternal(String(id)) : null
  }

  async findMany(query: FindQuery = {}): Promise<QueryResult<TRecord>> {
    const started = performance.now()
    const where = query.where ?? {}
    validateWhere(where, this.schema, this.config.maxInFilterItems)
    const limit = query.limit ?? Math.min(50, this.config.maxLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > this.config.maxLimit) {
      throw new EdgeDbError('QUERY_LIMIT', `limit must be between 1 and ${this.config.maxLimit}.`)
    }
    if (query.search) {
      for (const field of query.search.fields) {
        if (!this.schema.fields[field] || this.schema.fields[field]?.private) {
          throw new EdgeDbError('UNKNOWN_FIELD', `Search field "${field}" is not public or does not exist.`)
        }
      }
    }
    const orderFields = Object.keys(query.orderBy ?? {})
    for (const field of orderFields) {
      if (!this.schema.fields[field]) {
        throw new EdgeDbError('UNKNOWN_FIELD', `Unknown orderBy field "${field}".`)
      }
    }

    const planned = this.state.indexes.plan(where)
    const requiresScan =
      planned.plan.strategy === 'scan' &&
      (Object.keys(where).length > 0 || Boolean(query.search) || orderFields.length > 0)
    const unindexedOrder = orderFields.length > 0 && !this.state.indexes.hasOrderIndex(orderFields)
    if ((requiresScan || unindexedOrder) && !this.config.allowUnindexedQueries) {
      throw new EdgeDbError(
        'QUERY_NOT_INDEXED',
        `Query on "${this.name}" requires an unindexed filter, search, or sort. Add an index or explicitly enable allowUnindexedQueries.`,
        { recommendedIndex: planned.plan.recommendedIndex ?? orderFields }
      )
    }

    const warnings = [...planned.plan.warnings]
    if (unindexedOrder) {
      warnings.push(`Sorting by "${orderFields.join(',')}" cannot use an index.`)
    }
    if (planned.plan.recommendedIndex && planned.plan.recommendedIndex.length > 1) {
      warnings.push(`Consider a compound index on [${planned.plan.recommendedIndex.join(', ')}].`)
    }

    let records = [...planned.ids]
      .map((id) => this.state.records.get(id))
      .filter((record): record is Record<string, unknown> => Boolean(record))
      .filter((record) => query.withDeleted || !record.deletedAt)
      .filter((record) => matchesWhere(record, where))

    if (query.search) {
      const needle = query.search.q.toLocaleLowerCase()
      records = records.filter((record) =>
        query.search!.fields.some((field) => {
          const value = String(record[field] ?? '').toLocaleLowerCase()
          return query.search!.mode === 'startsWith' ? value.startsWith(needle) : value.includes(needle)
        })
      )
    }

    if (query.orderBy) {
      records.sort((a, b) => {
        for (const [field, direction] of Object.entries(query.orderBy!)) {
          if (Object.is(a[field], b[field])) continue
          const result = a[field]! < b[field]! ? -1 : 1
          return direction === 'asc' ? result : -result
        }
        return String(a.id).localeCompare(String(b.id))
      })
    } else {
      records.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }

    if (query.cursor) {
      const cursorIndex = records.findIndex((record) => String(record.id) === query.cursor)
      if (cursorIndex >= 0) records = records.slice(cursorIndex + 1)
    }
    const page = records.slice(0, limit)
    const durationMs = performance.now() - started
    const plan: QueryPlan = {
      ...planned.plan,
      scannedCount: planned.ids.size,
      candidateCount: planned.ids.size,
      durationMs,
      warnings
    }
    for (const warning of warnings) {
      logEvent(this.logger, 'warn', 'query.planner_warning', warning, {
        collection: this.name,
        indexUsed: plan.indexUsed,
        recommendedIndex: plan.recommendedIndex
      })
    }
    if (durationMs >= this.config.slowQueryMs) {
      logEvent(this.logger, 'warn', 'query.slow', 'Slow query detected.', {
        collection: this.name,
        durationMs,
        scannedCount: plan.scannedCount
      })
    }
    this.observeQuery?.(plan)

    return {
      data: page.map((record) => projectRecord(record, this.schema, query.select) as TRecord),
      ...(records.length > limit ? { nextCursor: String(page.at(-1)?.id) } : {}),
      ...(query.debug || this.config.debug ? { plan } : {})
    }
  }

  async count(query: Omit<FindQuery, 'limit' | 'cursor' | 'select'> = {}): Promise<number> {
    const result = await this.findMany({ ...query, limit: this.config.maxLimit })
    if (result.nextCursor) {
      let count = result.data.length
      let cursor = result.nextCursor
      while (cursor) {
        const page = await this.findMany({ ...query, limit: this.config.maxLimit, cursor })
        count += page.data.length
        cursor = page.nextCursor ?? ''
      }
      return count
    }
    return result.data.length
  }

  async exists(query: FindQuery): Promise<boolean> {
    return Boolean(await this.findFirst(query))
  }

  async update(id: string, patch: Partial<TRecord>): Promise<TRecord> {
    const current = this.state.records.get(id)
    if (!current) throw new EdgeDbError('VALIDATION_FAILED', `Record "${this.name}.${id}" not found.`)
    const normalized = this.normalizeInput(patch, 'update')
    if ('id' in normalized && normalized.id !== id) {
      throw new EdgeDbError('VALIDATION_FAILED', 'Record id cannot be changed.')
    }
    const next = { ...current, ...normalized }
    this.state.indexes.assertUnique(next, id)
    const operation: WriteOperation = {
      collection: this.name,
      op: 'update',
      id,
      patch: normalized
    }
    const applied = await this.execute([operation])
    if (!applied) this.applyLocal(operation)
    return projectRecord(next, this.schema) as TRecord
  }

  async updateMany(query: FindQuery, patch: Partial<TRecord>): Promise<number> {
    const matches = await this.findMany({ ...query, limit: this.config.maxLimit, select: ['id'] })
    const operations = matches.data.map((record) => {
      const id = String(record.id)
      const normalized = this.normalizeInput(patch, 'update')
      return { collection: this.name, op: 'update' as const, id, patch: normalized }
    })
    const applied = await this.execute(operations)
    if (!applied) operations.forEach((operation) => this.applyLocal(operation))
    return operations.length
  }

  async delete(id: string): Promise<void> {
    const current = this.state.records.get(id)
    if (!current) return
    this.deleteGuard(this.name, id)
    if (this.schema.softDelete) {
      await this.softDelete(id)
      return
    }
    const operation: WriteOperation = { collection: this.name, op: 'delete', id }
    const applied = await this.execute([operation])
    if (!applied) this.applyLocal(operation)
  }

  async deleteMany(query: FindQuery): Promise<number> {
    const matches = await this.findMany({ ...query, limit: this.config.maxLimit, select: ['id'] })
    for (const record of matches.data) this.deleteGuard(this.name, String(record.id))
    const operations = matches.data.map(
      (record): WriteOperation => ({ collection: this.name, op: 'delete', id: String(record.id) })
    )
    const applied = await this.execute(operations)
    if (!applied) operations.forEach((operation) => this.applyLocal(operation))
    return operations.length
  }

  async softDelete(id: string): Promise<void> {
    if (!this.schema.softDelete || !this.schema.fields.deletedAt) {
      throw new EdgeDbError('VALIDATION_FAILED', `Collection "${this.name}" does not support soft delete.`)
    }
    await this.update(id, { deletedAt: new Date().toISOString() } as unknown as Partial<TRecord>)
  }

  async restore(id: string): Promise<TRecord> {
    const current = this.state.records.get(id)
    if (!current) throw new EdgeDbError('VALIDATION_FAILED', `Record "${this.name}.${id}" not found.`)
    const operation: WriteOperation = { collection: this.name, op: 'restore', id }
    const applied = await this.execute([operation])
    if (!applied) this.applyLocal(operation)
    return projectRecord({ ...current, deletedAt: null }, this.schema) as TRecord
  }

  async upsert(where: Where, data: Partial<TRecord>): Promise<TRecord> {
    const existing = await this.findFirst({ where, withDeleted: true })
    return existing ? this.update(String(existing.id), data) : this.create(data)
  }
}
