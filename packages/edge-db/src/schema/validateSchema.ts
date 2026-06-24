import { EdgeDbError } from '../core/errors.js'
import type { NormalizedSchema } from '../types/public.js'

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

export function validateSchema(schema: NormalizedSchema): void {
  if (Object.keys(schema).length === 0) {
    throw new EdgeDbError('SCHEMA_INVALID', 'At least one collection is required.')
  }

  for (const [collectionName, collection] of Object.entries(schema)) {
    if (!SAFE_NAME.test(collectionName)) {
      throw new EdgeDbError('SCHEMA_INVALID', `Unsafe collection name "${collectionName}".`)
    }
    if (!collection.fields.id || collection.fields.id.type !== 'id') {
      throw new EdgeDbError(
        'SCHEMA_INVALID',
        `Collection "${collectionName}" must define an id field with type "id".`
      )
    }
    for (const fieldName of Object.keys(collection.fields)) {
      if (!SAFE_NAME.test(fieldName)) {
        throw new EdgeDbError('SCHEMA_INVALID', `Unsafe field name "${collectionName}.${fieldName}".`)
      }
    }
    for (const index of collection.indexes) {
      if (index.length === 0 || index.some((field) => !collection.fields[field])) {
        throw new EdgeDbError(
          'SCHEMA_INVALID',
          `Index "${index.join(',')}" in "${collectionName}" references an unknown field.`
        )
      }
    }
    for (const field of collection.unique) {
      if (!collection.fields[field]) {
        throw new EdgeDbError(
          'SCHEMA_INVALID',
          `Unique constraint "${collectionName}.${field}" references an unknown field.`
        )
      }
    }
    for (const [fieldName, field] of Object.entries(collection.fields)) {
      if (field.ref) {
        const target = schema[field.ref.collection]
        const targetField = field.ref.field ?? 'id'
        if (!target?.fields[targetField]) {
          throw new EdgeDbError(
            'SCHEMA_INVALID',
            `Reference "${collectionName}.${fieldName}" targets unknown field "${field.ref.collection}.${targetField}".`
          )
        }
      }
    }
  }
}
