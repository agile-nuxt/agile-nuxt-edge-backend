import { Database } from './database.js'
import type { DatabaseHooks, DatabaseOptions, SchemaDefinition } from '../types/public.js'

export function createDatabase<const TSchema extends SchemaDefinition>(
  options: DatabaseOptions<TSchema>,
  hooks?: DatabaseHooks
): Database<TSchema> {
  return new Database(options, hooks)
}
