import type { DatabaseOptions, SchemaDefinition } from '../types/public.js'

export interface ResolvedDatabaseConfig {
  path: string
  readOnly: boolean
  debug: boolean
  environment: 'development' | 'production' | 'test'
  strictIndexes: boolean
  maxLimit: number
  maxBodySize: number
  maxInFilterItems: number
  maxIncludeRecords: number
  allowUnindexedQueries: boolean
  snapshotsEnabled: boolean
  snapshotEveryOperations: number
  compactionEnabled: boolean
  compactionThreshold: number
  slowQueryMs: number
  queryStats: boolean
  maxRecordsWarning: number
}

export function resolveConfig(options: DatabaseOptions<SchemaDefinition>): ResolvedDatabaseConfig {
  const environment =
    options.environment ??
    (process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development')
  const strictIndexes = options.schemaSync?.strictIndexes ?? environment === 'production'
  return {
    path: options.path,
    readOnly: options.readOnly ?? false,
    debug: options.debug ?? environment !== 'production',
    environment,
    strictIndexes,
    maxLimit: options.query?.maxLimit ?? 100,
    maxBodySize: options.query?.maxBodySize ?? 1_048_576,
    maxInFilterItems: options.query?.maxInFilterItems ?? 100,
    maxIncludeRecords: options.query?.maxIncludeRecords ?? 100,
    allowUnindexedQueries: options.query?.allowUnindexedQueries ?? !strictIndexes,
    snapshotsEnabled: options.snapshots?.enabled ?? true,
    snapshotEveryOperations: options.snapshots?.everyOperations ?? 1_000,
    compactionEnabled: options.compaction?.enabled ?? true,
    compactionThreshold: options.compaction?.compactWhenLogOperationsExceed ?? 5_000,
    slowQueryMs: options.diagnostics?.slowQueryMs ?? 100,
    queryStats: options.diagnostics?.queryStats ?? false,
    maxRecordsWarning: options.diagnostics?.maxRecordsWarning ?? 100_000
  }
}
