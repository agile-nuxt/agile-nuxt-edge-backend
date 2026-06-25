import { LockFile } from '../storage/lockFile.js'
import type {
  DatabaseCoordinator,
  DatabaseLease,
  DatabaseLeaseRequest
} from '../types/public.js'

export class FileCoordinator implements DatabaseCoordinator {
  readonly name = 'file-lock'

  constructor(
    private readonly lockPath: string,
    private readonly databasePath: string
  ) {}

  async acquireWriterLease(_request: DatabaseLeaseRequest): Promise<DatabaseLease> {
    const lock = new LockFile(this.lockPath, this.databasePath)
    await lock.acquire()
    let owned = true
    return {
      id: `file:${this.lockPath}`,
      assertOwned() {
        if (!owned || !lock.isOwned) {
          throw new Error('The local writer lock is no longer owned.')
        }
      },
      async release() {
        if (!owned) return
        owned = false
        await lock.release()
      }
    }
  }
}
