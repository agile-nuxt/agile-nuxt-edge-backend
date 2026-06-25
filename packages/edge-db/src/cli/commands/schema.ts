import { readFile } from 'node:fs/promises'
import { normalizeSchema } from '../../schema/normalizeSchema.js'
import { loadStoredSchema, planSchema } from '../../schema/planSchema.js'
import type { SchemaDefinition } from '../../types/public.js'

export async function schemaDiff(path: string, schemaPath?: string): Promise<unknown> {
  const current = await loadStoredSchema(path)
  const desired = schemaPath
    ? normalizeSchema(JSON.parse(await readFile(schemaPath, 'utf8')) as SchemaDefinition)
    : current
  return planSchema(current, desired)
}
