import { restoreBackup } from '../../storage/backup.js'

export async function restore(path: string, source: string): Promise<unknown> {
  await restoreBackup(path, source)
  return { restored: path, source }
}
