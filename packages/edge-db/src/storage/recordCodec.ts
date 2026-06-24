import { createHash } from 'node:crypto'
import { EdgeDbError } from '../core/errors.js'
import { LOG_FORMAT_VERSION, type WriteOperation } from '../types/public.js'

export type LogOperation = WriteOperation['op'] | 'transaction-start' | 'transaction-commit' | 'transaction-rollback'

export interface LogRecord {
  v: number
  sequence: number
  collection: string
  txId: string
  op: LogOperation
  id?: string
  data?: Record<string, unknown>
  patch?: Record<string, unknown>
  ts: number
}

export interface EncodedLogRecord extends LogRecord {
  bytes: number
  checksum: string
}

function checksum(record: LogRecord): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex')
}

export function encodeLogRecord(record: Omit<LogRecord, 'v'> & { v?: number }): string {
  const normalized: LogRecord = { ...record, v: record.v ?? LOG_FORMAT_VERSION }
  const raw = JSON.stringify(normalized)
  return `${JSON.stringify({
    ...normalized,
    bytes: Buffer.byteLength(raw),
    checksum: checksum(normalized)
  })}\n`
}

export function decodeLogRecord(line: string): LogRecord {
  let encoded: EncodedLogRecord
  try {
    encoded = JSON.parse(line) as EncodedLogRecord
  } catch {
    throw new EdgeDbError('CORRUPT_STORAGE', 'Log record is not valid JSON.')
  }
  if (encoded.v !== LOG_FORMAT_VERSION) {
    throw new EdgeDbError(
      'FORMAT_UNSUPPORTED',
      `Log format ${encoded.v} is not supported.`,
      { supported: LOG_FORMAT_VERSION, found: encoded.v }
    )
  }
  const { bytes, checksum: foundChecksum, ...record } = encoded
  const raw = JSON.stringify(record)
  if (Buffer.byteLength(raw) !== bytes || checksum(record) !== foundChecksum) {
    throw new EdgeDbError('CORRUPT_STORAGE', 'Log record checksum or length validation failed.')
  }
  return record
}
