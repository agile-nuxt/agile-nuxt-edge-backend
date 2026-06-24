export type EdgeDbErrorCode =
  | 'ENVIRONMENT_UNSUPPORTED'
  | 'STORAGE_PERMISSION_DENIED'
  | 'LOCK_CONFLICT'
  | 'READ_ONLY'
  | 'NOT_BOOTED'
  | 'SCHEMA_INVALID'
  | 'SCHEMA_UNSAFE'
  | 'COLLECTION_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_FIELD'
  | 'PRIVATE_FIELD'
  | 'UNIQUE_CONSTRAINT'
  | 'REFERENTIAL_INTEGRITY'
  | 'QUERY_LIMIT'
  | 'QUERY_NOT_INDEXED'
  | 'CORRUPT_STORAGE'
  | 'FORMAT_UNSUPPORTED'
  | 'BACKUP_INVALID'

export class EdgeDbError extends Error {
  readonly code: EdgeDbErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(code: EdgeDbErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'EdgeDbError'
    this.code = code
    this.details = details
  }
}
