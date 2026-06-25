import type { FindQuery } from '@agile-nuxt/edge-db'
import { apiError } from '../errors/apiError.js'

const QUERY_KEYS = new Set([
  'where',
  'search',
  'orderBy',
  'limit',
  'cursor',
  'select',
  'include',
  'withDeleted',
  'debug'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateFindQueryShape(value: unknown): FindQuery {
  if (!isRecord(value)) throw apiError(400, 'Query must be a JSON object.')
  for (const key of Object.keys(value)) {
    if (!QUERY_KEYS.has(key)) throw apiError(400, `Unknown query option "${key}".`)
  }
  if (value.where !== undefined && !isRecord(value.where)) {
    throw apiError(400, 'where must be an object.')
  }
  if (value.orderBy !== undefined && !isRecord(value.orderBy)) {
    throw apiError(400, 'orderBy must be an object.')
  }
  if (
    value.limit !== undefined &&
    (typeof value.limit !== 'number' || !Number.isInteger(value.limit))
  ) {
    throw apiError(400, 'limit must be an integer.')
  }
  if (value.cursor !== undefined && typeof value.cursor !== 'string') {
    throw apiError(400, 'cursor must be a string.')
  }
  if (
    value.select !== undefined &&
    (!Array.isArray(value.select) || value.select.some((field) => typeof field !== 'string'))
  ) {
    throw apiError(400, 'select must be an array of field names.')
  }
  if (value.include !== undefined) {
    if (!isRecord(value.include)) throw apiError(400, 'include must be an object.')
    for (const [relation, options] of Object.entries(value.include)) {
      if (options === true) continue
      if (!isRecord(options)) {
        throw apiError(400, `Include "${relation}" must be true or an options object.`)
      }
      for (const key of Object.keys(options)) {
        if (!['limit', 'select'].includes(key)) {
          throw apiError(400, `Unknown include option "${relation}.${key}".`)
        }
      }
      if (
        options.limit !== undefined &&
        (typeof options.limit !== 'number' || !Number.isInteger(options.limit))
      ) {
        throw apiError(400, `Include "${relation}" limit must be an integer.`)
      }
      if (
        options.select !== undefined &&
        (!Array.isArray(options.select) ||
          options.select.some((field) => typeof field !== 'string'))
      ) {
        throw apiError(400, `Include "${relation}" select must be an array of field names.`)
      }
    }
  }
  return value as FindQuery
}

export function parseQueryJson(value: string | null, name: string): unknown {
  if (value === null) return undefined
  try {
    return JSON.parse(value)
  } catch {
    throw apiError(400, `Query parameter "${name}" must contain valid JSON.`)
  }
}
