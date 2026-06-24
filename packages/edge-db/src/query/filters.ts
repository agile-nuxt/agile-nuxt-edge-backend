import { EdgeDbError } from '../core/errors.js'
import type { NormalizedCollectionSchema, Where } from '../types/public.js'

function compare(value: unknown, condition: unknown): boolean {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return Object.is(value, condition)
  }
  const operators = condition as Record<string, unknown>
  for (const [operator, expected] of Object.entries(operators)) {
    switch (operator) {
      case 'eq':
        if (!Object.is(value, expected)) return false
        break
      case 'ne':
        if (Object.is(value, expected)) return false
        break
      case 'gt':
        if (!(value! > expected!)) return false
        break
      case 'gte':
        if (!(value! >= expected!)) return false
        break
      case 'lt':
        if (!(value! < expected!)) return false
        break
      case 'lte':
        if (!(value! <= expected!)) return false
        break
      case 'in':
        if (!(expected as unknown[]).some((item) => Object.is(item, value))) return false
        break
      case 'notIn':
        if ((expected as unknown[]).some((item) => Object.is(item, value))) return false
        break
      case 'contains':
        if (!String(value ?? '').includes(String(expected))) return false
        break
      case 'startsWith':
        if (!String(value ?? '').startsWith(String(expected))) return false
        break
      case 'endsWith':
        if (!String(value ?? '').endsWith(String(expected))) return false
        break
      case 'isNull':
        if ((value === null || value === undefined) !== expected) return false
        break
      default:
        throw new EdgeDbError('VALIDATION_FAILED', `Unsupported filter operator "${operator}".`)
    }
  }
  return true
}

export function validateWhere(
  where: Where,
  schema: NormalizedCollectionSchema,
  maxInFilterItems: number
): void {
  for (const [field, condition] of Object.entries(where)) {
    if (!schema.fields[field]) {
      throw new EdgeDbError('UNKNOWN_FIELD', `Unknown filter field "${field}".`)
    }
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      for (const [operator, value] of Object.entries(condition)) {
        if ((operator === 'in' || operator === 'notIn')) {
          if (!Array.isArray(value)) {
            throw new EdgeDbError('VALIDATION_FAILED', `Filter "${operator}" must be an array.`)
          }
          if (value.length > maxInFilterItems) {
            throw new EdgeDbError(
              'QUERY_LIMIT',
              `Filter "${operator}" exceeds maxInFilterItems (${maxInFilterItems}).`
            )
          }
        }
      }
    }
  }
}

export function matchesWhere(record: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => compare(record[field], condition))
}
