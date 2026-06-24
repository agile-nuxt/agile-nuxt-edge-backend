import { EdgeDbError } from '../core/errors.js'
import type {
  CollectionSchemaDefinition,
  FieldDefinition,
  NormalizedCollectionSchema,
  NormalizedField,
  NormalizedSchema,
  ScalarFieldType,
  SchemaDefinition
} from '../types/public.js'

const TYPES = new Set<ScalarFieldType>([
  'id',
  'text',
  'integer',
  'real',
  'boolean',
  'json',
  'datetime'
])

function parseDefault(type: ScalarFieldType, input: string): unknown {
  if (input === 'null') return null
  if (type === 'boolean') return input === 'true'
  if (type === 'integer' || type === 'real') {
    const value = Number(input)
    if (!Number.isFinite(value)) {
      throw new EdgeDbError('SCHEMA_INVALID', `Invalid numeric default "${input}".`)
    }
    return value
  }
  if (type === 'json') {
    try {
      return JSON.parse(input)
    } catch {
      throw new EdgeDbError('SCHEMA_INVALID', `Invalid JSON default "${input}".`)
    }
  }
  return input
}

export function normalizeField(definition: FieldDefinition): NormalizedField {
  if (typeof definition === 'object') {
    if (!TYPES.has(definition.type)) {
      throw new EdgeDbError('SCHEMA_INVALID', `Unsupported field type "${definition.type}".`)
    }
    return {
      type: definition.type,
      nullable: definition.nullable ?? false,
      unique: definition.unique ?? false,
      private: definition.private ?? false,
      hasDefault: Object.prototype.hasOwnProperty.call(definition, 'default'),
      ...(Object.prototype.hasOwnProperty.call(definition, 'default')
        ? { defaultValue: definition.default }
        : {}),
      ...(definition.ref ? { ref: { field: 'id', onDelete: 'restrict', ...definition.ref } } : {})
    }
  }

  const [rawType, ...modifiers] = definition.split('.')
  if (!TYPES.has(rawType as ScalarFieldType)) {
    throw new EdgeDbError('SCHEMA_INVALID', `Unsupported field type "${rawType}".`)
  }
  const type = rawType as ScalarFieldType
  const defaultModifier = modifiers.find((item) => item.startsWith('default:'))
  return {
    type,
    nullable: modifiers.includes('nullable'),
    unique: modifiers.includes('unique'),
    private: modifiers.includes('private'),
    hasDefault: Boolean(defaultModifier),
    ...(defaultModifier
      ? { defaultValue: parseDefault(type, defaultModifier.slice('default:'.length)) }
      : {})
  }
}

function normalizeCollection(definition: CollectionSchemaDefinition): NormalizedCollectionSchema {
  const fields = Object.fromEntries(
    Object.entries(definition.fields).map(([name, field]) => [name, normalizeField(field)])
  )
  const unique = new Set(definition.unique ?? [])
  for (const [name, field] of Object.entries(fields)) {
    if (field.unique) unique.add(name)
  }

  return {
    fields,
    indexes: (definition.indexes ?? []).map((index) =>
      typeof index === 'string' ? [index] : [...index]
    ),
    unique: [...unique],
    timestamps: definition.timestamps ?? false,
    softDelete: definition.softDelete ?? false,
    relations: definition.relations ?? {},
    metadata: Object.fromEntries(
      Object.entries(definition).filter(
        ([key]) => !['fields', 'indexes', 'unique', 'timestamps', 'softDelete', 'relations'].includes(key)
      )
    )
  }
}

export function normalizeSchema(schema: SchemaDefinition): NormalizedSchema {
  return Object.fromEntries(
    Object.entries(schema).map(([name, definition]) => [name, normalizeCollection(definition)])
  )
}
