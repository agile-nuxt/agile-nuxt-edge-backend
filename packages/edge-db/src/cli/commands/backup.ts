import { createDatabase } from '../../core/createDatabase.js'
import { loadSchemaFromStorage } from './common.js'

export async function backup(path: string, target: string): Promise<unknown> {
  const db = createDatabase({ path, schema: await loadSchemaFromStorage(path) })
  await db.boot()
  try {
    return { target: await db.backup(target) }
  } finally {
    await db.close()
  }
}
