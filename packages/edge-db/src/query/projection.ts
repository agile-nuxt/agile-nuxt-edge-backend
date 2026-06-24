import { EdgeDbError } from '../core/errors.js'
import type { NormalizedCollectionSchema } from '../types/public.js'

export function projectRecord(
  record: Record<string, unknown>,
  schema: NormalizedCollectionSchema,
  select?: string[]
): Record<string, unknown> {
  if (select) {
    for (const field of select) {
      if (!schema.fields[field]) {
        throw new EdgeDbError('UNKNOWN_FIELD', `Unknown selected field "${field}".`)
      }
      if (schema.fields[field]?.private) {
        throw new EdgeDbError('PRIVATE_FIELD', `Private field "${field}" cannot be selected.`)
      }
    }
  }
  const fields = select ?? Object.keys(schema.fields)
  return Object.fromEntries(
    fields
      .filter((field) => !schema.fields[field]?.private)
      .filter((field) => field in record)
      .map((field) => [field, record[field]])
  )
}
