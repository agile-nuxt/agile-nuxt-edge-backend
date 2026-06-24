import { apiError } from '../errors/apiError.js'
import type { BackendEntity } from '../../types.js'

export function sanitizeWrite(
  entityName: string,
  entity: BackendEntity,
  input: Record<string, unknown>
): Record<string, unknown> {
  const fields = entity.fields
  const writable = entity.writableFields ? new Set(entity.writableFields) : undefined
  for (const field of Object.keys(input)) {
    const definition = fields[field]
    if (!definition) throw apiError(400, `Unknown field "${entityName}.${field}".`)
    const privateField =
      typeof definition === 'string'
        ? definition.split('.').includes('private')
        : definition.private === true
    if (privateField || (writable && !writable.has(field))) {
      throw apiError(400, `Field "${entityName}.${field}" is not publicly writable.`)
    }
  }
  return { ...input }
}

export function sanitizeOutput(
  entity: BackendEntity,
  record: Record<string, unknown>
): Record<string, unknown> {
  if (!entity.publicFields) return record
  return Object.fromEntries(
    entity.publicFields.filter((field) => field in record).map((field) => [field, record[field]])
  )
}
