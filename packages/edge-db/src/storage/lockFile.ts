import { hostname } from 'node:os'
import { open, readFile, rm } from 'node:fs/promises'
import { EdgeDbError } from '../core/errors.js'

interface LockMetadata {
  formatVersion: 1
  pid: number
  hostname: string
  startedAt: string
  databasePath: string
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export class LockFile {
  private owned = false

  constructor(
    private readonly path: string,
    private readonly databasePath: string
  ) {}

  async acquire(): Promise<void> {
    const metadata: LockMetadata = {
      formatVersion: 1,
      pid: process.pid,
      hostname: hostname(),
      startedAt: new Date().toISOString(),
      databasePath: this.databasePath
    }

    try {
      const handle = await open(this.path, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }
      this.owned = true
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }

    let existing: LockMetadata | undefined
    try {
      existing = JSON.parse(await readFile(this.path, 'utf8')) as LockMetadata
    } catch {
      throw new EdgeDbError(
        'LOCK_CONFLICT',
        `The database lock at ${this.path} exists but cannot be read. Remove it only after confirming no writer is running.`
      )
    }

    const sameHost = existing.hostname === hostname()
    if (sameHost && !processExists(existing.pid)) {
      await rm(this.path, { force: true })
      return this.acquire()
    }

    throw new EdgeDbError(
      'LOCK_CONFLICT',
      `Another writer owns ${this.databasePath} (pid ${existing.pid} on ${existing.hostname}). v1 supports one writable Node process per database path. Open with readOnly: true for inspection.`,
      { lock: existing }
    )
  }

  async release(): Promise<void> {
    if (!this.owned) return
    await rm(this.path, { force: true })
    this.owned = false
  }

  get isOwned(): boolean {
    return this.owned
  }
}
