import { readFile, writeFile } from 'node:fs/promises'
import { createDatabase } from '../../core/createDatabase.js'
import { loadSchemaFromStorage } from './common.js'

export async function inspect(path: string): Promise<unknown> {
  const db = createDatabase({ path, schema: await loadSchemaFromStorage(path), readOnly: true })
  await db.boot()
  try {
    return await db.diagnostics()
  } finally {
    await db.close()
  }
}

export async function compact(path: string): Promise<unknown> {
  const db = createDatabase({ path, schema: await loadSchemaFromStorage(path) })
  await db.boot()
  try {
    await db.compact()
    return await db.diagnostics()
  } finally {
    await db.close()
  }
}

export async function exportData(path: string, target: string): Promise<unknown> {
  const db = createDatabase({ path, schema: await loadSchemaFromStorage(path), readOnly: true })
  await db.boot()
  try {
    await writeFile(target, `${JSON.stringify(await db.export(), null, 2)}\n`)
    return { target }
  } finally {
    await db.close()
  }
}

export async function importData(path: string, source: string): Promise<unknown> {
  const db = createDatabase({ path, schema: await loadSchemaFromStorage(path) })
  await db.boot()
  try {
    await db.import(JSON.parse(await readFile(source, 'utf8')) as Record<string, Record<string, unknown>[]>)
    return { source }
  } finally {
    await db.close()
  }
}
