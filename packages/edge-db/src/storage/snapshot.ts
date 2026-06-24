import { createHash } from 'node:crypto'
import { EdgeDbError } from '../core/errors.js'
import { SNAPSHOT_FORMAT_VERSION } from '../types/public.js'
import { atomicWriteJson, readJsonFile } from './atomicFile.js'

interface SnapshotPayload {
  formatVersion: number
  collection: string
  sequence: number
  createdAt: string
  records: Record<string, unknown>[]
}

export interface CollectionSnapshot extends SnapshotPayload {
  checksum: string
}

function checksum(payload: SnapshotPayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export async function writeSnapshot(
  path: string,
  collection: string,
  sequence: number,
  records: Record<string, unknown>[]
): Promise<CollectionSnapshot> {
  const payload: SnapshotPayload = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    collection,
    sequence,
    createdAt: new Date().toISOString(),
    records
  }
  const snapshot: CollectionSnapshot = { ...payload, checksum: checksum(payload) }
  await atomicWriteJson(path, snapshot)
  return snapshot
}

export async function readSnapshot(path: string): Promise<CollectionSnapshot> {
  const snapshot = await readJsonFile<CollectionSnapshot>(path)
  if (snapshot.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    throw new EdgeDbError(
      'FORMAT_UNSUPPORTED',
      `Snapshot format ${snapshot.formatVersion} is not supported.`
    )
  }
  const { checksum: found, ...payload } = snapshot
  if (checksum(payload) !== found) {
    throw new EdgeDbError('CORRUPT_STORAGE', `Snapshot checksum validation failed for ${path}.`)
  }
  return snapshot
}
