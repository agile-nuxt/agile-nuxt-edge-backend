import type { LogRecord } from './recordCodec.js'
import type { RecoverySummary, WriteOperation } from '../types/public.js'

export interface RecoveryResult {
  operations: Array<WriteOperation & { sequence: number }>
  summary: RecoverySummary
}

export function recoverTransactions(
  records: LogRecord[],
  baseSummary?: Partial<RecoverySummary>
): RecoveryResult {
  const pending = new Map<string, LogRecord[]>()
  const operations: Array<WriteOperation & { sequence: number }> = []

  for (const record of records) {
    if (record.op === 'transaction-start') {
      pending.set(record.txId, [])
      continue
    }
    if (record.op === 'transaction-rollback') {
      pending.delete(record.txId)
      continue
    }
    if (record.op === 'transaction-commit') {
      const transaction = pending.get(record.txId) ?? []
      for (const operation of transaction) {
        if (!operation.id) continue
        operations.push({
          collection: operation.collection,
          op: operation.op as WriteOperation['op'],
          id: operation.id,
          ...(operation.data ? { data: operation.data } : {}),
          ...(operation.patch ? { patch: operation.patch } : {}),
          sequence: operation.sequence
        })
      }
      pending.delete(record.txId)
      continue
    }
    const transaction = pending.get(record.txId)
    if (transaction) transaction.push(record)
  }

  return {
    operations,
    summary: {
      replayedOperations: operations.length,
      ignoredUncommittedTransactions: pending.size,
      ignoredTailRecords: baseSummary?.ignoredTailRecords ?? 0,
      corruptTailFiles: baseSummary?.corruptTailFiles ?? [],
      repairedTailBytes: baseSummary?.repairedTailBytes ?? 0
    }
  }
}
