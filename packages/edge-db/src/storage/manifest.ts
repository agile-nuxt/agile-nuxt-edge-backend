import { access } from 'node:fs/promises'
import { atomicWriteJson, readJsonFile } from './atomicFile.js'
import { EdgeDbError } from '../core/errors.js'
import { STORAGE_FORMAT_VERSION } from '../types/public.js'

export interface CollectionManifest {
  activeLogSegment: number
  lastSequence: number
  snapshotSequence: number
  operationCountSinceSnapshot: number
  operationCountSinceCompaction: number
}

export interface StorageManifest {
  formatVersion: number
  databaseId: string
  schemaHash: string
  createdAt: string
  updatedAt: string
  collections: Record<string, CollectionManifest>
}

export async function manifestExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function readManifest(path: string): Promise<StorageManifest> {
  const manifest = await readJsonFile<StorageManifest>(path)
  if (manifest.formatVersion !== STORAGE_FORMAT_VERSION) {
    throw new EdgeDbError(
      'FORMAT_UNSUPPORTED',
      `Storage format ${manifest.formatVersion} is not supported by this edge-db version.`,
      { supported: STORAGE_FORMAT_VERSION, found: manifest.formatVersion }
    )
  }
  return manifest
}

export async function writeManifest(path: string, manifest: StorageManifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString()
  await atomicWriteJson(path, manifest)
}
