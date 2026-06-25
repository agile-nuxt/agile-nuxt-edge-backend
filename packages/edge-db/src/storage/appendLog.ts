import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { EdgeDbError } from '../core/errors.js'
import { decodeLogRecord, encodeLogRecord, type LogRecord } from './recordCodec.js'

export interface ReadLogResult {
  records: LogRecord[]
  ignoredTailRecords: number
  tailWasCorrupt: boolean
  validBytes: number
  repairedTailBytes: number
  quarantinedTailPath?: string
}

export interface ReadLogOptions {
  repairTail?: boolean
  quarantineTail?: boolean
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

export async function readLog(path: string, options: ReadLogOptions = {}): Promise<ReadLogResult> {
  let content: Buffer
  try {
    content = await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        records: [],
        ignoredTailRecords: 0,
        tailWasCorrupt: false,
        validBytes: 0,
        repairedTailBytes: 0
      }
    }
    throw error
  }

  const records: LogRecord[] = []
  let ignoredTailRecords = 0
  let tailWasCorrupt = false
  let validBytes = 0
  let cursor = 0

  while (cursor < content.length) {
    const newline = content.indexOf(0x0a, cursor)
    if (newline < 0) {
      ignoredTailRecords += 1
      tailWasCorrupt = true
      break
    }
    const line = content.subarray(cursor, newline).toString('utf8')
    const nextOffset = newline + 1
    if (!line) {
      validBytes = nextOffset
      cursor = nextOffset
      continue
    }
    try {
      records.push(decodeLogRecord(line))
      validBytes = nextOffset
      cursor = nextOffset
    } catch (error) {
      const isTail = nextOffset === content.length
      if (isTail) {
        ignoredTailRecords += 1
        tailWasCorrupt = true
        break
      }
      throw new EdgeDbError(
        'CORRUPT_STORAGE',
        `Corrupt log record found before the tail in ${path}.`,
        {
          cause: error instanceof Error ? error.message : String(error),
          path,
          byteOffset: cursor
        }
      )
    }
  }

  let repairedTailBytes = 0
  let quarantinedTailPath: string | undefined
  if (tailWasCorrupt && options.repairTail) {
    const tail = content.subarray(validBytes)
    repairedTailBytes = tail.length
    if (tail.length > 0 && options.quarantineTail !== false) {
      quarantinedTailPath = `${path}.corrupt-tail-${Date.now()}`
      await writeFile(quarantinedTailPath, tail, { mode: 0o600 })
    }
    const handle = await open(path, 'r+')
    try {
      await handle.truncate(validBytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  return {
    records,
    ignoredTailRecords,
    tailWasCorrupt,
    validBytes,
    repairedTailBytes,
    ...(quarantinedTailPath ? { quarantinedTailPath } : {})
  }
}
