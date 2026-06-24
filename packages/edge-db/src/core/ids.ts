import { randomBytes } from 'node:crypto'

export function createId(prefix = 'rec'): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(8).toString('hex')}`
}

export function createTransactionId(): string {
  return createId('tx')
}
