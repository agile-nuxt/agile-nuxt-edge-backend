import { resolve } from 'node:path'
import { backup } from './commands/backup.js'
import { benchmark } from './commands/benchmark.js'
import { readOption } from './commands/common.js'
import { compact, exportData, importData, inspect } from './commands/databaseCommand.js'
import { doctor } from './commands/doctor.js'
import { restore } from './commands/restore.js'
import { schemaDiff } from './commands/schema.js'

const [, , command, ...args] = process.argv
const path = resolve(readOption(args, 'path', process.env.EDGE_DB_PATH ?? './storage/edge-db')!)

async function main(): Promise<void> {
  let result: unknown
  switch (command) {
    case 'doctor':
      result = await doctor(path, args.includes('--repair'))
      break
    case 'schema': {
      if (args[0] !== 'diff') throw new Error('Usage: edge-db schema diff [--schema <schema.json>]')
      const schemaPath = readOption(args, 'schema')
      result = await schemaDiff(path, schemaPath ? resolve(schemaPath) : undefined)
      break
    }
    case 'inspect':
      result = await inspect(path)
      break
    case 'backup': {
      const target = args.find((arg) => !arg.startsWith('--') && arg !== readOption(args, 'path'))
      if (!target) throw new Error('Usage: edge-db backup <target> [--path <database>]')
      result = await backup(path, resolve(target))
      break
    }
    case 'restore': {
      const source = args.find((arg) => !arg.startsWith('--') && arg !== readOption(args, 'path'))
      if (!source) throw new Error('Usage: edge-db restore <source> [--path <database>]')
      result = await restore(path, resolve(source))
      break
    }
    case 'compact':
      result = await compact(path)
      break
    case 'export': {
      const target = args[0]
      if (!target) throw new Error('Usage: edge-db export <target.json> [--path <database>]')
      result = await exportData(path, resolve(target))
      break
    }
    case 'import': {
      const source = args[0]
      if (!source) throw new Error('Usage: edge-db import <source.json> [--path <database>]')
      result = await importData(path, resolve(source))
      break
    }
    case 'benchmark':
      result = await benchmark()
      break
    default:
      throw new Error(
        'Usage: edge-db <doctor|schema|inspect|backup|restore|compact|export|import|benchmark> [options]'
      )
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
