import { cp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { EdgeDbError } from '../core/errors.js'
import { atomicWriteJson, readJsonFile } from './atomicFile.js'
import { readManifest } from './manifest.js'

export const BACKUP_FORMAT_VERSION = 2

export interface BackupFileIntegrity {
  path: string
  size: number
  checksum: string
}

export interface BackupMetadata {
  formatVersion: number
  createdAt: string
  sourceDatabaseId: string
  files?: BackupFileIntegrity[]
}

export interface BackupVerification {
  metadata: BackupMetadata
  fullyVerified: boolean
  warnings: string[]
}

async function assertMissing(path: string): Promise<void> {
  try {
    await stat(path)
    throw new EdgeDbError('BACKUP_INVALID', `Backup target "${path}" already exists.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export async function createBackup(sourcePath: string, targetPath: string): Promise<string> {
  const source = resolve(sourcePath)
  const target = resolve(targetPath)
  if (target === source || target.startsWith(`${source}/`)) {
    throw new EdgeDbError('BACKUP_INVALID', 'Backup target must be outside the database directory.')
  }
  await assertMissing(target)
  await mkdir(dirname(target), { recursive: true })
  const temp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  )
  const manifest = await readManifest(join(source, 'manifest.json'))
  try {
    await cp(source, temp, {
      recursive: true,
      filter: (item) => !item.endsWith('/lock') && !item.includes('.edge-db-doctor-') && !item.includes('.tmp-')
    })
    await rm(join(temp, 'lock'), { force: true })
    const files = await createIntegrityInventory(temp)
    await atomicWriteJson(join(temp, 'backup.json'), {
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      sourceDatabaseId: manifest.databaseId,
      files
    } satisfies BackupMetadata)
    await verifyBackup(temp)
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { recursive: true, force: true })
    throw error
  }
  return target
}

async function hashFile(path: string): Promise<{ size: number; checksum: string }> {
  const content = await readFile(path)
  return {
    size: content.length,
    checksum: createHash('sha256').update(content).digest('hex')
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const item = join(current, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(root, item)))
    else if (entry.isFile() && relative(root, item) !== 'backup.json') files.push(item)
  }
  return files
}

async function createIntegrityInventory(root: string): Promise<BackupFileIntegrity[]> {
  const files = await listFiles(root)
  const inventory = await Promise.all(
    files.map(async (path) => {
      const integrity = await hashFile(path)
      return {
        path: relative(root, path).split(sep).join('/'),
        ...integrity
      }
    })
  )
  return inventory.sort((a, b) => a.path.localeCompare(b.path))
}

export async function verifyBackup(path: string): Promise<BackupVerification> {
  const metadata = await readJsonFile<BackupMetadata>(join(path, 'backup.json'))
  if (![1, BACKUP_FORMAT_VERSION].includes(metadata.formatVersion)) {
    throw new EdgeDbError('BACKUP_INVALID', `Unsupported backup format ${metadata.formatVersion}.`)
  }
  const manifest = await readManifest(join(path, 'manifest.json'))
  if (manifest.databaseId !== metadata.sourceDatabaseId) {
    throw new EdgeDbError('BACKUP_INVALID', 'Backup metadata does not match the storage manifest.')
  }
  if (metadata.formatVersion === 1) {
    return {
      metadata,
      fullyVerified: false,
      warnings: [
        'Backup format 1 contains no file checksum inventory. Restore is allowed with reduced verification.'
      ]
    }
  }
  if (!metadata.files) {
    throw new EdgeDbError('BACKUP_INVALID', 'Backup checksum inventory is missing.')
  }

  const actual = await createIntegrityInventory(path)
  const expectedPaths = new Set(metadata.files.map((file) => file.path))
  const actualPaths = new Set(actual.map((file) => file.path))
  if (
    expectedPaths.size !== actualPaths.size ||
    [...expectedPaths].some((file) => !actualPaths.has(file))
  ) {
    throw new EdgeDbError('BACKUP_INVALID', 'Backup file inventory does not match its metadata.')
  }
  for (const expected of metadata.files) {
    const found = actual.find((file) => file.path === expected.path)
    if (
      !found ||
      found.size !== expected.size ||
      found.checksum !== expected.checksum
    ) {
      throw new EdgeDbError('BACKUP_INVALID', `Backup file "${expected.path}" failed integrity verification.`)
    }
  }
  return { metadata, fullyVerified: true, warnings: [] }
}

export async function restoreBackup(databasePath: string, backupPath: string): Promise<void> {
  const database = resolve(databasePath)
  const backup = resolve(backupPath)
  await verifyBackup(backup)
  try {
    await readFile(join(database, 'lock'), 'utf8')
    throw new EdgeDbError(
      'LOCK_CONFLICT',
      'Restore requires the database to be closed. A writer lock is currently present.'
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const parent = dirname(database)
  const token = randomBytes(6).toString('hex')
  const staged = join(parent, `.${basename(database)}.restore-${token}`)
  const previous = join(parent, `.${basename(database)}.previous-${token}`)
  await cp(backup, staged, {
    recursive: true,
    filter: (item) => !item.endsWith('/backup.json') && !item.endsWith('/lock')
  })
  await rm(join(staged, 'backup.json'), { force: true })

  let movedPrevious = false
  try {
    try {
      await rename(database, previous)
      movedPrevious = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await rename(staged, database)
    if (movedPrevious) await rm(previous, { recursive: true, force: true })
  } catch (error) {
    await rm(staged, { recursive: true, force: true })
    if (movedPrevious) await rename(previous, database)
    throw error
  }
}
