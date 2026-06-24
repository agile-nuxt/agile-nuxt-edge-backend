import { access } from 'node:fs/promises'
import { EdgeDbError } from '../core/errors.js'
import { logEvent, type Logger } from '../core/logger.js'
import type { NormalizedCollectionSchema, SchemaSyncOptions } from '../types/public.js'
import { SCHEMA_FORMAT_VERSION } from '../types/public.js'
import { atomicWriteJson, readJsonFile } from '../storage/atomicFile.js'

interface StoredCollectionSchema {
  formatVersion: number
  collection: string
  schema: NormalizedCollectionSchema
  updatedAt: string
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
): Promise<string[]> {
  const warnings: string[] = []
  if (!(await exists(path))) {
    if (options.createCollections === false) {
      throw new EdgeDbError('SCHEMA_UNSAFE', `Collection "${collection}" is missing on disk.`)
    }
    await atomicWriteJson(path, {
      formatVersion: SCHEMA_FORMAT_VERSION,
      collection,
      schema: desired,
      updatedAt: new Date().toISOString()
    } satisfies StoredCollectionSchema)
    logEvent(logger, 'info', 'schema.collection_created', 'Collection schema created.', { collection })
    return warnings
  }

  const stored = await readJsonFile<StoredCollectionSchema>(path)
  if (stored.formatVersion !== SCHEMA_FORMAT_VERSION) {
    throw new EdgeDbError(
      'FORMAT_UNSUPPORTED',
      `Schema format ${stored.formatVersion} for "${collection}" is unsupported.`
    )
  }

  for (const [field, definition] of Object.entries(stored.schema.fields)) {
    const next = desired.fields[field]
    if (!next) {
      warnings.push(`Field "${collection}.${field}" is absent from code but was preserved on disk.`)
      continue
    }
    if (next.type !== definition.type) {
      const message = `Unsafe type change for "${collection}.${field}" from ${definition.type} to ${next.type}.`
      if (options.mode === 'strict') throw new EdgeDbError('SCHEMA_UNSAFE', message)
      warnings.push(message)
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

  await atomicWriteJson(path, {
    formatVersion: SCHEMA_FORMAT_VERSION,
    collection,
    schema: merged,
    updatedAt: new Date().toISOString()
  } satisfies StoredCollectionSchema)

  for (const warning of warnings) {
    logEvent(logger, 'warn', 'schema.sync_warning', warning, { collection })
  }
  logEvent(logger, 'info', 'schema.synced', 'Collection schema synchronized.', {
    collection,
    warnings: warnings.length
  })
  return warnings
}
