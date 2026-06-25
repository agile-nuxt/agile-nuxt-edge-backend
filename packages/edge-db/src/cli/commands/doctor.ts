import { diagnoseStorage } from '../../core/diagnostics.js'
import { createDatabase } from '../../core/createDatabase.js'
import { readManifest } from '../../storage/manifest.js'
import { join } from 'node:path'
import { loadSchemaFromStorage } from './common.js'

export async function doctor(path: string, repair = false): Promise<unknown> {
  const storage = await diagnoseStorage(path, false)
  let recovery: unknown
  if (repair) {
    const db = createDatabase({ path, schema: await loadSchemaFromStorage(path) })
    await db.boot()
    try {
      recovery = await db.diagnostics()
    } finally {
      await db.close()
    }
  }
  let manifest: unknown
  try {
    manifest = await readManifest(join(path, 'manifest.json'))
  } catch (error) {
    manifest = { error: error instanceof Error ? error.message : String(error) }
  }
  return { storage, manifest, repair, ...(recovery ? { recovery } : {}) }
}
