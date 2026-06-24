import { resolve, join } from 'node:path'

export interface StoragePaths {
  root: string
  manifest: string
  lock: string
  journal: string
  collections: string
  archive: string
  collection: (name: string) => CollectionPaths
}

export interface CollectionPaths {
  root: string
  schema: string
  indexes: string
  archive: string
  log: (segment: number) => string
  snapshot: (sequence: number) => string
}

function numberName(prefix: string, value: number, extension: string): string {
  return `${prefix}-${value.toString().padStart(6, '0')}.${extension}`
}

export function createStoragePaths(input: string): StoragePaths {
  const root = resolve(input)
  return {
    root,
    manifest: join(root, 'manifest.json'),
    lock: join(root, 'lock'),
    journal: join(root, 'journal.ndjson'),
    collections: join(root, 'collections'),
    archive: join(root, 'archive'),
    collection(name) {
      const collectionRoot = join(root, 'collections', name)
      return {
        root: collectionRoot,
        schema: join(collectionRoot, 'schema.json'),
        indexes: join(collectionRoot, 'indexes.json'),
        archive: join(collectionRoot, 'archive'),
        log: (segment) => join(collectionRoot, numberName('log', segment, 'ndjson')),
        snapshot: (sequence) => join(collectionRoot, numberName('snapshot', sequence, 'json'))
      }
    }
  }
}
