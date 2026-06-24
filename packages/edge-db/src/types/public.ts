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

export interface SchemaSyncOptions {
  enabled?: boolean
  runOnBoot?: boolean
  mode?: 'safe' | 'strict'
  createCollections?: boolean
  addFields?: boolean
  createIndexes?: boolean
  destructiveChanges?: false
  strictIndexes?: boolean
}

export interface QueryProtectionOptions {
  maxLimit?: number
  maxBodySize?: number
  maxInFilterItems?: number
  allowUnindexedQueries?: boolean
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

export type Where = Record<string, unknown | FilterOperator>

export interface SearchQuery {
  q: string
  fields: string[]
  mode?: 'contains' | 'startsWith'
}

export interface FindQuery {
  where?: Where
  search?: SearchQuery
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  cursor?: string
  select?: string[]
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
  compactionStatus: 'idle' | 'running'
  permissionChecks: StoragePermissionCheck[]
  warnings: string[]
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
}
