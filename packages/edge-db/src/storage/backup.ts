import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { EdgeDbError } from '../core/errors.js'
import { atomicWriteJson, readJsonFile } from './atomicFile.js'
import { readManifest } from './manifest.js'

export const BACKUP_FORMAT_VERSION = 1

interface BackupMetadata {
  formatVersion: number
  createdAt: string
  sourceDatabaseId: string
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
    await atomicWriteJson(join(temp, 'backup.json'), {
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      sourceDatabaseId: manifest.databaseId
    } satisfies BackupMetadata)
    await verifyBackup(temp)
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { recursive: true, force: true })
    throw error
  }
  return target
}

export async function verifyBackup(path: string): Promise<BackupMetadata> {
  const metadata = await readJsonFile<BackupMetadata>(join(path, 'backup.json'))
  if (metadata.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new EdgeDbError('BACKUP_INVALID', `Unsupported backup format ${metadata.formatVersion}.`)
  }
  const manifest = await readManifest(join(path, 'manifest.json'))
  if (manifest.databaseId !== metadata.sourceDatabaseId) {
    throw new EdgeDbError('BACKUP_INVALID', 'Backup metadata does not match the storage manifest.')
  }
  return metadata
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
