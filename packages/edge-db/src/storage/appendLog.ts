import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { EdgeDbError } from '../core/errors.js'
import { decodeLogRecord, encodeLogRecord, type LogRecord } from './recordCodec.js'

export interface ReadLogResult {
  records: LogRecord[]
  ignoredTailRecords: number
  tailWasCorrupt: boolean
}

export async function appendLogRecords(path: string, records: LogRecord[]): Promise<void> {
  if (records.length === 0) return
  await mkdir(dirname(path), { recursive: true })
  const handle = await open(path, 'a', 0o600)
  try {
    await handle.write(records.map(encodeLogRecord).join(''))
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export async function readLog(path: string): Promise<ReadLogResult> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { records: [], ignoredTailRecords: 0, tailWasCorrupt: false }
    }
    throw error
  }

  const complete = content.endsWith('\n')
  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const records: LogRecord[] = []
  let ignoredTailRecords = 0
  let tailWasCorrupt = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    const isTail = index === lines.length - 1
    try {
      records.push(decodeLogRecord(line))
    } catch (error) {
      if (isTail) {
        ignoredTailRecords += 1
        tailWasCorrupt = true
        break
      }
      throw new EdgeDbError(
        'CORRUPT_STORAGE',
        `Corrupt log record found before the tail at line ${index + 1} in ${path}.`,
        { cause: error instanceof Error ? error.message : String(error), path, line: index + 1 }
      )
    }
  }
  if (!complete && lines.length > 0 && !tailWasCorrupt) {
    ignoredTailRecords += 1
    tailWasCorrupt = true
    records.pop()
  }

  return { records, ignoredTailRecords, tailWasCorrupt }
}
