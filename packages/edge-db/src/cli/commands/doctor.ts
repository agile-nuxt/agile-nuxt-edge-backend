import { diagnoseStorage } from '../../core/diagnostics.js'
import { readManifest } from '../../storage/manifest.js'
import { join } from 'node:path'

export async function doctor(path: string): Promise<unknown> {
  const storage = await diagnoseStorage(path, false)
  let manifest: unknown
  try {
    manifest = await readManifest(join(path, 'manifest.json'))
  } catch (error) {
    manifest = { error: error instanceof Error ? error.message : String(error) }
  }
  return { storage, manifest }
}
