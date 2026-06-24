export { createDatabase } from './core/createDatabase.js'
export { Database, type TransactionDatabase } from './core/database.js'
export { Collection } from './core/collection.js'
export { EdgeDbError, type EdgeDbErrorCode } from './core/errors.js'
export type { Logger } from './core/logger.js'
export { defineSchema } from './schema/defineSchema.js'
export { diagnoseStorage } from './core/diagnostics.js'
export { restoreBackup, verifyBackup } from './storage/backup.js'
export type {
  CollectionSchemaDefinition,
  DatabaseDiagnostics,
  DatabaseHooks,
  DatabaseOptions,
  FieldDefinition,
  FieldDefinitionObject,
  FindQuery,
  InferCollection,
  InferField,
  InferSchema,
  QueryPlan,
  QueryResult,
  RefDefinition,
  RelationDefinition,
  SchemaDefinition,
  StorageDiagnostics,
  Where
} from './types/public.js'
