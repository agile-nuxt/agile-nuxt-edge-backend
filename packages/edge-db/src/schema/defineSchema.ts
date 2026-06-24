import type { SchemaDefinition } from '../types/public.js'

export function defineSchema<const TSchema extends SchemaDefinition>(schema: TSchema): TSchema {
  return schema
}
