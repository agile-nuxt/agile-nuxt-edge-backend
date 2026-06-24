import { EdgeDbError } from '../core/errors.js'
import type { NormalizedCollectionSchema, QueryPlan, Where } from '../types/public.js'

function key(value: unknown): string {
  return JSON.stringify(value)
}

function equalityValue(value: unknown): { usable: boolean; value?: unknown } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const operator = value as Record<string, unknown>
    if ('eq' in operator) return { usable: true, value: operator.eq }
    return { usable: false }
  }
  return { usable: true, value }
}

export interface PlannedCandidates {
  ids: Set<string>
  plan: Omit<QueryPlan, 'scannedCount' | 'durationMs'>
}

export class IndexRegistry {
  private readonly secondary = new Map<string, Map<string, Set<string>>>()
  private readonly compound = new Map<string, Map<string, Set<string>>>()
  private readonly unique = new Map<string, Map<string, string>>()

  constructor(
    private readonly schema: NormalizedCollectionSchema,
    private readonly records: Map<string, Record<string, unknown>>
  ) {
    for (const fields of schema.indexes) {
      if (fields.length === 1) {
        this.secondary.set(fields[0]!, new Map())
      } else {
        this.compound.set(fields.join(','), new Map())
      }
    }
    for (const field of schema.unique) {
      this.unique.set(field, new Map())
    }
    this.rebuild()
  }

  rebuild(): void {
    for (const index of this.secondary.values()) index.clear()
    for (const index of this.compound.values()) index.clear()
    for (const index of this.unique.values()) index.clear()
    for (const record of this.records.values()) this.add(record)
  }

  add(record: Record<string, unknown>): void {
    const id = String(record.id)
    for (const [field, index] of this.secondary) {
      const valueKey = key(record[field])
      const ids = index.get(valueKey) ?? new Set<string>()
      ids.add(id)
      index.set(valueKey, ids)
    }
    for (const [name, index] of this.compound) {
      const fields = name.split(',')
      const valueKey = key(fields.map((field) => record[field]))
      const ids = index.get(valueKey) ?? new Set<string>()
      ids.add(id)
      index.set(valueKey, ids)
    }
    for (const [field, index] of this.unique) {
      const value = record[field]
      if (value === null || value === undefined) continue
      const valueKey = key(value)
      const existing = index.get(valueKey)
      if (existing && existing !== id) {
        throw new EdgeDbError(
          'UNIQUE_CONSTRAINT',
          `Duplicate value for unique field "${field}".`,
          { field }
        )
      }
      index.set(valueKey, id)
    }
  }

  remove(record: Record<string, unknown>): void {
    const id = String(record.id)
    for (const [field, index] of this.secondary) {
      const valueKey = key(record[field])
      const ids = index.get(valueKey)
      ids?.delete(id)
      if (ids?.size === 0) index.delete(valueKey)
    }
    for (const [name, index] of this.compound) {
      const valueKey = key(name.split(',').map((field) => record[field]))
      const ids = index.get(valueKey)
      ids?.delete(id)
      if (ids?.size === 0) index.delete(valueKey)
    }
    for (const [field, index] of this.unique) {
      if (record[field] !== null && record[field] !== undefined) {
        index.delete(key(record[field]))
      }
    }
  }

  update(previous: Record<string, unknown>, next: Record<string, unknown>): void {
    this.remove(previous)
    try {
      this.add(next)
    } catch (error) {
      this.add(previous)
      throw error
    }
  }

  assertUnique(record: Record<string, unknown>, currentId?: string): void {
    for (const [field, index] of this.unique) {
      const value = record[field]
      if (value === null || value === undefined) continue
      const existing = index.get(key(value))
      if (existing && existing !== currentId) {
        throw new EdgeDbError(
          'UNIQUE_CONSTRAINT',
          `Duplicate value for unique field "${field}".`,
          { field }
        )
      }
    }
  }

  plan(where: Where = {}): PlannedCandidates {
    const entries = Object.entries(where)
    const idEntry = entries.find(([field]) => field === 'id')
    if (idEntry) {
      const equality = equalityValue(idEntry[1])
      if (equality.usable) {
        const id = String(equality.value)
        return {
          ids: this.records.has(id) ? new Set([id]) : new Set(),
          plan: {
            strategy: 'primary',
            indexUsed: 'id',
            candidateCount: this.records.has(id) ? 1 : 0,
            warnings: []
          }
        }
      }
    }

    for (const [field, index] of this.unique) {
      if (!(field in where)) continue
      const equality = equalityValue(where[field])
      if (!equality.usable) continue
      const id = index.get(key(equality.value))
      return {
        ids: id ? new Set([id]) : new Set(),
        plan: {
          strategy: 'unique',
          indexUsed: field,
          candidateCount: id ? 1 : 0,
          warnings: []
        }
      }
    }

    for (const [name, index] of this.compound) {
      const fields = name.split(',')
      const values = fields.map((field) => equalityValue(where[field]))
      if (fields.every((field) => field in where) && values.every((item) => item.usable)) {
        const ids = new Set(index.get(key(values.map((item) => item.value))) ?? [])
        return {
          ids,
          plan: {
            strategy: 'compound',
            indexUsed: name,
            candidateCount: ids.size,
            warnings: []
          }
        }
      }
    }

    const secondaryCandidates: Array<{ field: string; ids: Set<string> }> = []
    for (const [field, index] of this.secondary) {
      if (!(field in where)) continue
      const equality = equalityValue(where[field])
      if (!equality.usable) continue
      secondaryCandidates.push({
        field,
        ids: new Set(index.get(key(equality.value)) ?? [])
      })
    }
    secondaryCandidates.sort((a, b) => a.ids.size - b.ids.size)
    const best = secondaryCandidates[0]
    if (best) {
      return {
        ids: best.ids,
        plan: {
          strategy: 'secondary',
          indexUsed: best.field,
          candidateCount: best.ids.size,
          warnings: []
        }
      }
    }

    const recommendedIndex = entries
      .filter(([, value]) => equalityValue(value).usable)
      .map(([field]) => field)
    return {
      ids: new Set(this.records.keys()),
      plan: {
        strategy: 'scan',
        candidateCount: this.records.size,
        warnings:
          entries.length > 0
            ? ['Filtering cannot use a configured index and requires a full collection scan.']
            : [],
        ...(recommendedIndex.length > 0 ? { recommendedIndex } : {})
      }
    }
  }

  get count(): number {
    return 1 + this.secondary.size + this.compound.size + this.unique.size
  }

  hasOrderIndex(fields: string[]): boolean {
    if (fields.length === 0) return true
    if (fields.length === 1 && fields[0] === 'id') return true
    const name = fields.join(',')
    return this.secondary.has(fields[0]!) || this.compound.has(name) || this.unique.has(fields[0]!)
  }
}
