import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageDiagnostics, StoragePermissionCheck } from '../types/public.js'

export async function diagnoseStorage(path: string, readOnly: boolean): Promise<StorageDiagnostics> {
  await mkdir(path, { recursive: true })
  const token = randomBytes(6).toString('hex')
  const source = join(path, `.edge-db-doctor-${process.pid}-${token}`)
  const renamed = `${source}.renamed`
  const lock = `${source}.lock`
  const checks: StoragePermissionCheck[] = []

  try {
    await readFile(path)
    checks.push({ name: 'read', ok: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    checks.push({ name: 'read', ok: code === 'EISDIR', ...(code === 'EISDIR' ? {} : { error: String(error) }) })
  }

  if (readOnly) {
    for (const name of ['write', 'rename', 'delete', 'lock'] as const) {
      checks.push({ name, ok: true })
    }
    return { path, writable: false, persistentFilesystemRequired: true, checks }
  }

  try {
    await writeFile(source, 'edge-db permission probe', { flag: 'wx', mode: 0o600 })
    checks.push({ name: 'write', ok: true })
  } catch (error) {
    checks.push({ name: 'write', ok: false, error: String(error) })
  }

  try {
    await rename(source, renamed)
    checks.push({ name: 'rename', ok: true })
  } catch (error) {
    checks.push({ name: 'rename', ok: false, error: String(error) })
  }

  try {
    const handle = await open(lock, 'wx', 0o600)
    await handle.close()
    checks.push({ name: 'lock', ok: true })
  } catch (error) {
    checks.push({ name: 'lock', ok: false, error: String(error) })
  }

  try {
    await rm(renamed, { force: true })
    await rm(source, { force: true })
    await rm(lock, { force: true })
    checks.push({ name: 'delete', ok: true })
  } catch (error) {
    checks.push({ name: 'delete', ok: false, error: String(error) })
  }

  return {
    path,
    writable: checks.every((check) => check.ok),
    persistentFilesystemRequired: true,
    checks
  }
}
