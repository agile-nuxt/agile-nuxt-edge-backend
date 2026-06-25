export { createDatabase } from './core/createDatabase.js'
export { Database, type TransactionDatabase } from './core/database.js'
export { Collection } from './core/collection.js'
export { EdgeDbError, type EdgeDbErrorCode } from './core/errors.js'
export type { Logger } from './core/logger.js'
export { defineSchema } from './schema/defineSchema.js'
export { diagnoseStorage } from './core/diagnostics.js'
export {
  restoreBackup,
  verifyBackup,
  type BackupFileIntegrity,
  type BackupMetadata,
  type BackupVerification
} from './storage/backup.js'
export { FileCoordinator } from './coordination/fileCoordinator.js'
export {
  loadStoredSchema,
  planCollectionChanges,
  planSchema
} from './schema/planSchema.js'
export type {
  CollectionMigration,
  CollectionSchemaDefinition,
  DatabaseChangeEvent,
  DatabaseCoordinator,
  DatabaseDiagnostics,
  DatabaseHooks,
  DatabaseLease,
  DatabaseLeaseRequest,
  DatabaseOptions,
  FieldDefinition,
  FieldDefinitionObject,
  FindQuery,
  InferCollection,
  InferCreate,
  InferField,
  InferPublicCollection,
  InferPublicCreate,
  InferPublicSchema,
  InferPublicUpdate,
  InferSchema,
  InferUpdate,
  IncludeOptions,
  IncludeQuery,
  QueryPlan,
  QueryResult,
  RefDefinition,
  RelationDefinition,
  SchemaDefinition,
  SchemaChange,
  SchemaChangeKind,
  SchemaChangePlan,
  SchemaMigrationContext,
  StorageDiagnostics,
  Where
} from './types/public.js'
