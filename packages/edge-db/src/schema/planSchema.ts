import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonFile } from '../storage/atomicFile.js'
import type {
  NormalizedCollectionSchema,
  NormalizedSchema,
  SchemaChange,
  SchemaChangePlan
} from '../types/public.js'
import { schemaHash } from './schemaHash.js'

interface StoredCollectionSchema {
  schema: NormalizedCollectionSchema
}

function hasIndex(indexes: string[][], expected: string[]): boolean {
  return indexes.some((index) => index.join('\0') === expected.join('\0'))
}

export function planCollectionChanges(
  collection: string,
  current: NormalizedCollectionSchema | undefined,
  desired: NormalizedCollectionSchema
): SchemaChange[] {
  if (!current) {
    return [{
      collection,
      kind: 'collection-added',
      safe: true,
      requiresMigration: false,
      description: `Collection "${collection}" will be created.`
    }]
  }

  const changes: SchemaChange[] = []
  for (const [field, next] of Object.entries(desired.fields)) {
    const previous = current.fields[field]
    if (!previous) {
      const requiresMigration = !next.nullable
      changes.push({
        collection,
        field,
        kind: 'field-added',
        safe: !requiresMigration,
        requiresMigration,
        description: requiresMigration
          ? `Required field "${collection}.${field}" needs an explicit migration value.`
          : `Field "${collection}.${field}" will be added.`
      })
      continue
    }
    if (previous.type !== next.type) {
      changes.push({
        collection,
        field,
        kind: 'field-type-changed',
        safe: false,
        requiresMigration: true,
        description: `Field "${collection}.${field}" changes from ${previous.type} to ${next.type}.`
      })
    }
    if (previous.nullable && !next.nullable) {
      changes.push({
        collection,
        field,
        kind: 'field-required',
        safe: false,
        requiresMigration: true,
        description: `Field "${collection}.${field}" becomes required.`
      })
    } else if (!previous.nullable && next.nullable) {
      changes.push({
        collection,
        field,
        kind: 'field-relaxed',
        safe: true,
        requiresMigration: false,
        description: `Field "${collection}.${field}" becomes nullable.`
      })
    }
  }

  for (const field of Object.keys(current.fields)) {
    if (!desired.fields[field]) {
      changes.push({
        collection,
        field,
        kind: 'field-removed',
        safe: false,
        requiresMigration: true,
        description: `Stored field "${collection}.${field}" is absent from the desired schema.`
      })
    }
  }

  for (const index of desired.indexes) {
    if (!hasIndex(current.indexes, index)) {
      changes.push({
        collection,
        index,
        kind: 'index-added',
        safe: true,
        requiresMigration: false,
        description: `Index [${index.join(', ')}] will be added to "${collection}".`
      })
    }
  }
  for (const index of current.indexes) {
    if (!hasIndex(desired.indexes, index)) {
      changes.push({
        collection,
        index,
        kind: 'index-removed',
        safe: false,
        requiresMigration: false,
        description: `Stored index [${index.join(', ')}] is absent from the desired schema and will be preserved.`
      })
    }
  }

  for (const field of desired.unique) {
    if (!current.unique.includes(field)) {
      changes.push({
        collection,
        field,
        kind: 'unique-added',
        safe: false,
        requiresMigration: true,
        description: `Unique constraint "${collection}.${field}" requires existing data validation.`
      })
    }
  }
  for (const field of current.unique) {
    if (!desired.unique.includes(field)) {
      changes.push({
        collection,
        field,
        kind: 'unique-removed',
        safe: false,
        requiresMigration: false,
        description: `Stored unique constraint "${collection}.${field}" will be preserved.`
      })
    }
  }
  return changes
}

export function planSchema(
  current: NormalizedSchema,
  desired: NormalizedSchema
): SchemaChangePlan {
  const changes = Object.entries(desired).flatMap(([collection, schema]) =>
    planCollectionChanges(collection, current[collection], schema)
  )
  for (const collection of Object.keys(current)) {
    if (!desired[collection]) {
      changes.push({
        collection,
        kind: 'collection-removed',
        safe: false,
        requiresMigration: false,
        description: `Stored collection "${collection}" is absent from the desired schema and will be preserved.`
      })
    }
  }
  return {
    formatVersion: 1,
    ...(Object.keys(current).length > 0 ? { currentSchemaHash: schemaHash(current) } : {}),
    desiredSchemaHash: schemaHash(desired),
    changes,
    safe: changes.every((change) => change.safe),
    requiresMigration: changes.some((change) => change.requiresMigration)
  }
}

export async function loadStoredSchema(root: string): Promise<NormalizedSchema> {
  const collectionsRoot = join(root, 'collections')
  try {
    await access(collectionsRoot)
  } catch {
    return {}
  }
  const names = await readdir(collectionsRoot)
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const stored = await readJsonFile<StoredCollectionSchema>(
          join(collectionsRoot, name, 'schema.json')
        )
        return [name, stored.schema] as const
      } catch {
        return undefined
      }
    })
  )
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, NormalizedCollectionSchema] => Boolean(entry)))
}
