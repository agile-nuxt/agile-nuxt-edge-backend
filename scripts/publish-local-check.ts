import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const commands: Array<[string, string[]]> = [
  ['corepack', ['pnpm', 'lint']],
  ['corepack', ['pnpm', 'build']],
  ['corepack', ['pnpm', 'test']],
  ['corepack', ['pnpm', 'typecheck']],
  ['corepack', ['pnpm', 'pack:check']],
  ['corepack', ['pnpm', 'template:check']]
]

for (const [command, args] of commands) {
  console.info(`\n[publish-local-check] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.info('\n[publish-local-check] repository is ready for release')
