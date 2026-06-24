import { createHash } from 'node:crypto'
import type { NormalizedSchema } from '../types/public.js'

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function schemaHash(schema: NormalizedSchema): string {
  return createHash('sha256').update(stable(schema)).digest('hex')
}
