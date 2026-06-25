import type { Logger } from '../core/logger.js'

export const STORAGE_FORMAT_VERSION = 1 as const
export const SNAPSHOT_FORMAT_VERSION = 1 as const
export const LOG_FORMAT_VERSION = 1 as const
export const SCHEMA_FORMAT_VERSION = 1 as const

export type ScalarFieldType = 'id' | 'text' | 'integer' | 'real' | 'boolean' | 'json' | 'datetime'
export type FieldString = `${ScalarFieldType}${string}`

export interface RefDefinition {
  collection: string
  field?: string
  onDelete?: 'restrict'
}

export interface FieldDefinitionObject {
  type: ScalarFieldType
  nullable?: boolean
  unique?: boolean
  private?: boolean
  default?: unknown
  ref?: RefDefinition
}

export type FieldDefinition = FieldString | FieldDefinitionObject
export type FieldsDefinition = Record<string, FieldDefinition>

export interface RelationDefinition {
  type: 'belongsTo' | 'hasMany'
  collection: string
  localField: string
  foreignField?: string
}

export interface CollectionSchemaDefinition<
  TFields extends FieldsDefinition = FieldsDefinition
> {
  fields: TFields
  indexes?: Array<string | readonly string[]>
  unique?: string[]
  timestamps?: boolean
  softDelete?: boolean
  relations?: Record<string, RelationDefinition>
  api?: boolean
  [key: string]: unknown
}

export type SchemaDefinition = Record<string, CollectionSchemaDefinition>

type HasStringModifier<
  TDefinition extends FieldDefinition,
  TModifier extends string
> = TDefinition extends `${string}.${infer TModifiers}`
  ? TModifiers extends `${string}${TModifier}${string}`
    ? true
    : false
  : false

type IsPrivate<TDefinition extends FieldDefinition> =
  TDefinition extends { private: true }
    ? true
    : HasStringModifier<TDefinition, 'private'>

type PrivateFieldKeys<T extends CollectionSchemaDefinition> = {
  [K in keyof T['fields']]: IsPrivate<T['fields'][K]> extends true ? K : never
}[keyof T['fields']]

type HasDefault<TDefinition extends FieldDefinition> =
  TDefinition extends { default: unknown }
    ? true
    : HasStringModifier<TDefinition, 'default:'>

type IsGeneratedField<
  TCollection extends CollectionSchemaDefinition,
  TField extends PropertyKey
> = TField extends 'id'
  ? true
  : TCollection['timestamps'] extends true
    ? TField extends 'createdAt' | 'updatedAt'
      ? true
      : false
    : false

export interface NormalizedField {
  type: ScalarFieldType
  nullable: boolean
  unique: boolean
  private: boolean
  hasDefault: boolean
  defaultValue?: unknown
  ref?: RefDefinition
}

export interface NormalizedCollectionSchema {
  fields: Record<string, NormalizedField>
  indexes: string[][]
  unique: string[]
  timestamps: boolean
  softDelete: boolean
  relations: Record<string, RelationDefinition>
  metadata: Record<string, unknown>
}

export type NormalizedSchema = Record<string, NormalizedCollectionSchema>

type BaseType<T extends FieldDefinition> =
  T extends { type: infer TObjectType }
    ? TObjectType extends 'id' | 'text' | 'datetime'
      ? string
      : TObjectType extends 'integer' | 'real'
        ? number
        : TObjectType extends 'boolean'
          ? boolean
          : TObjectType extends 'json'
            ? unknown
            : never
    : T extends `${infer TStringType}.${string}`
      ? TStringType extends 'id' | 'text' | 'datetime'
        ? string
        : TStringType extends 'integer' | 'real'
          ? number
          : TStringType extends 'boolean'
            ? boolean
            : TStringType extends 'json'
              ? unknown
              : never
      : T extends 'id' | 'text' | 'datetime'
        ? string
        : T extends 'integer' | 'real'
          ? number
          : T extends 'boolean'
            ? boolean
            : T extends 'json'
              ? unknown
              : never

type IsNullable<T extends FieldDefinition> =
  T extends { nullable: true } ? true : T extends `${string}.nullable${string}` ? true : false

export type InferField<T extends FieldDefinition> =
  IsNullable<T> extends true ? BaseType<T> | null : BaseType<T>

export type InferCollection<T extends CollectionSchemaDefinition> = {
  [K in keyof T['fields']]: InferField<T['fields'][K]>
}

export type InferSchema<T extends SchemaDefinition> = {
  [K in keyof T]: InferCollection<T[K]>
}

export type InferPublicCollection<T extends CollectionSchemaDefinition> = {
  [K in keyof T['fields'] as IsPrivate<T['fields'][K]> extends true
    ? never
    : K]: InferField<T['fields'][K]>
}

type RequiredCreateKeys<T extends CollectionSchemaDefinition> = {
  [K in keyof T['fields']]: IsGeneratedField<T, K> extends true
    ? never
    : IsNullable<T['fields'][K]> extends true
      ? never
      : HasDefault<T['fields'][K]> extends true
        ? never
        : K
}[keyof T['fields']]

type OptionalCreateKeys<T extends CollectionSchemaDefinition> = Exclude<
  keyof T['fields'],
  RequiredCreateKeys<T> | 'id' | (T['timestamps'] extends true ? 'createdAt' | 'updatedAt' : never)
>

export type InferCreate<T extends CollectionSchemaDefinition> = {
  [K in RequiredCreateKeys<T>]: InferField<T['fields'][K]>
} & {
  [K in OptionalCreateKeys<T>]?: InferField<T['fields'][K]>
}

export type InferUpdate<T extends CollectionSchemaDefinition> = Partial<
  Omit<
    InferCollection<T>,
    'id' | 'createdAt' | 'updatedAt'
  >
>

export type InferPublicCreate<T extends CollectionSchemaDefinition> = Omit<
  InferCreate<T>,
  PrivateFieldKeys<T>
>

export type InferPublicUpdate<T extends CollectionSchemaDefinition> = Omit<
  InferUpdate<T>,
  PrivateFieldKeys<T>
>

export type InferPublicSchema<T extends SchemaDefinition> = {
  [K in keyof T]: InferPublicCollection<T[K]>
}

export type SchemaChangeKind =
  | 'collection-added'
  | 'collection-removed'
  | 'field-added'
  | 'field-removed'
  | 'field-type-changed'
  | 'field-required'
  | 'field-relaxed'
  | 'index-added'
  | 'index-removed'
  | 'unique-added'
  | 'unique-removed'

export interface SchemaChange {
  collection: string
  kind: SchemaChangeKind
  field?: string
  index?: string[]
  safe: boolean
  requiresMigration: boolean
  description: string
}

export interface SchemaChangePlan {
  formatVersion: 1
  currentSchemaHash?: string
  desiredSchemaHash: string
  changes: SchemaChange[]
  safe: boolean
  requiresMigration: boolean
}

export interface SchemaMigrationContext {
  collection: string
  changes: SchemaChange[]
}

export type CollectionMigration = (
  record: Record<string, unknown>,
  context: SchemaMigrationContext
) => Record<string, unknown> | Promise<Record<string, unknown>>

export interface SchemaSyncOptions {
  enabled?: boolean
  runOnBoot?: boolean
  mode?: 'safe' | 'strict'
  createCollections?: boolean
  addFields?: boolean
  createIndexes?: boolean
  destructiveChanges?: false
  strictIndexes?: boolean
  migrations?: Record<string, CollectionMigration>
}

export interface QueryProtectionOptions {
  maxLimit?: number
  maxBodySize?: number
  maxInFilterItems?: number
  maxIncludeRecords?: number
  allowUnindexedQueries?: boolean
}

export interface DatabaseLease {
  id: string
  assertOwned(): void | Promise<void>
  release(): void | Promise<void>
}

export interface DatabaseLeaseRequest {
  databasePath: string
  ownerId: string
  ttlMs: number
}

export interface DatabaseChangeEvent {
  databasePath: string
  ownerId: string
  sequence: number
  collections: string[]
  committedAt: string
}

export interface DatabaseCoordinator {
  readonly name: string
  acquireWriterLease(request: DatabaseLeaseRequest): Promise<DatabaseLease>
  publish?(event: DatabaseChangeEvent): void | Promise<void>
  subscribe?(
    databasePath: string,
    listener: (event: DatabaseChangeEvent) => void | Promise<void>
  ): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>
}

export interface DatabaseOptions<TSchema extends SchemaDefinition = SchemaDefinition> {
  path: string
  schema: TSchema
  readOnly?: boolean
  debug?: boolean
  environment?: 'development' | 'production' | 'test'
  logger?: Logger
  schemaSync?: SchemaSyncOptions
  query?: QueryProtectionOptions
  snapshots?: {
    enabled?: boolean
    everyOperations?: number
  }
  compaction?: {
    enabled?: boolean
    compactWhenLogOperationsExceed?: number
  }
  diagnostics?: {
    slowQueryMs?: number
    queryStats?: boolean
    maxRecordsWarning?: number
  }
  coordination?: {
    adapter?: DatabaseCoordinator
    ownerId?: string
    leaseTtlMs?: number
    autoRefreshReadOnly?: boolean
  }
}

export type FilterOperator<T = unknown> = {
  eq?: T
  ne?: T
  gt?: T
  gte?: T
  lt?: T
  lte?: T
  in?: T[]
  notIn?: T[]
  contains?: string
  startsWith?: string
  endsWith?: string
  isNull?: boolean
}

export type Where<TRecord extends Record<string, unknown> = Record<string, unknown>> = {
  [K in keyof TRecord]?: TRecord[K] | FilterOperator<TRecord[K]>
}

export interface SearchQuery<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  q: string
  fields: Array<Extract<keyof TRecord, string>>
  mode?: 'contains' | 'startsWith'
}

export interface IncludeOptions {
  limit?: number
  select?: string[]
}

export type IncludeQuery = Record<string, true | IncludeOptions>

export interface FindQuery<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  where?: Where<TRecord>
  search?: SearchQuery<TRecord>
  orderBy?: Partial<Record<Extract<keyof TRecord, string>, 'asc' | 'desc'>>
  limit?: number
  cursor?: string
  select?: Array<Extract<keyof TRecord, string>>
  include?: IncludeQuery
  withDeleted?: boolean
  debug?: boolean
}

export interface QueryPlan {
  strategy: 'primary' | 'unique' | 'compound' | 'secondary' | 'scan'
  indexUsed?: string
  candidateCount: number
  scannedCount: number
  durationMs: number
  warnings: string[]
  recommendedIndex?: string[]
}

export interface QueryResult<T> {
  data: T[]
  nextCursor?: string
  plan?: QueryPlan
}

export interface StoragePermissionCheck {
  name: 'read' | 'write' | 'rename' | 'delete' | 'lock'
  ok: boolean
  error?: string
}

export interface StorageDiagnostics {
  path: string
  writable: boolean
  persistentFilesystemRequired: true
  checks: StoragePermissionCheck[]
}

export interface RecoverySummary {
  replayedOperations: number
  ignoredUncommittedTransactions: number
  ignoredTailRecords: number
  corruptTailFiles: string[]
  repairedTailBytes: number
}

export interface CollectionDiagnostics {
  name: string
  recordCount: number
  indexCount: number
  logFiles: string[]
  snapshotFiles: string[]
  lastSnapshotTime?: string
  approximateMemoryBytes: number
}

export interface DatabaseDiagnostics {
  path: string
  platform: string
  nodeVersion: string
  readOnly: boolean
  lockStatus: 'owned' | 'not-required' | 'unavailable'
  storageSizeBytes: number
  collectionCount: number
  collections: CollectionDiagnostics[]
  bootDurationMs: number
  replayedOperations: number
  ignoredTailRecords: number
  repairedTailBytes: number
  compactionStatus: 'idle' | 'running'
  permissionChecks: StoragePermissionCheck[]
  warnings: string[]
  coordination: {
    adapter: string
    ownerId: string
    writerLease: 'owned' | 'not-required' | 'unavailable'
  }
  queryStats?: {
    total: number
    scans: number
    slow: number
  }
}

export interface WriteOperation {
  collection: string
  op: 'insert' | 'update' | 'delete' | 'restore'
  id: string
  data?: Record<string, unknown>
  patch?: Record<string, unknown>
}

export interface DatabaseHooks {
  beforeWrite?: (operation: WriteOperation) => void | Promise<void>
  afterWrite?: (operation: WriteOperation) => void | Promise<void>
  onStorageStage?: (
    stage:
      | 'journal-start'
      | 'collection-append'
      | 'journal-commit'
      | 'manifest-write'
      | 'snapshot-write'
      | 'compaction-activate',
    context: Record<string, unknown>
  ) => void | Promise<void>
}
