import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

interface PackageJson {
  name?: string
  private?: boolean
  main?: string
  module?: string
  types?: string
  files?: string[]
  exports?: unknown
  publishConfig?: {
    access?: string
  }
}

interface PackResult {
  files: Array<{ path: string }>
  name: string
  version: string
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageNames = ['edge-db', 'backend'] as const
const requestedPackage = process.argv.includes('--package')
  ? process.argv[process.argv.indexOf('--package') + 1]
  : undefined
const shouldPack = process.argv.includes('--pack')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function validateManifest(name: (typeof packageNames)[number]): void {
  const packagePath = join(root, 'packages', name)
  const manifest = readJson<PackageJson>(join(packagePath, 'package.json'))
  assert(manifest.name?.startsWith('@agile-nuxt/'), `${name}: invalid npm package name.`)
  assert(manifest.private !== true, `${manifest.name}: publishable packages cannot be private.`)
  assert(
    manifest.publishConfig?.access === 'public',
    `${manifest.name}: publishConfig.access must be public.`
  )
  assert(Array.isArray(manifest.files), `${manifest.name}: files must be declared.`)
  for (const required of ['dist', 'README.md', 'LICENSE']) {
    assert(manifest.files.includes(required), `${manifest.name}: files must include ${required}.`)
  }
  assert(manifest.exports, `${manifest.name}: exports must be declared.`)
  assert(manifest.main?.endsWith('.cjs'), `${manifest.name}: main must reference CommonJS output.`)
  assert(manifest.module?.endsWith('.mjs'), `${manifest.name}: module must reference ESM output.`)
  assert(manifest.types?.endsWith('.d.ts'), `${manifest.name}: types must reference declarations.`)
  for (const file of ['README.md', 'LICENSE']) {
    assert(
      readFileSync(join(packagePath, file), 'utf8').trim().length > 0,
      `${manifest.name}: ${file} is missing or empty.`
    )
  }
}

function validateRepository(): void {
  const rootManifest = readJson<PackageJson>(join(root, 'package.json'))
  assert(rootManifest.private === true, 'The root package must remain private.')
  const template = readJson<PackageJson>(
    join(root, 'templates', 'agile-nuxt-fullstack', 'package.json')
  )
  assert(template.private === true, 'The quickstart template must remain private.')
  assert(
    template.publishConfig?.access !== 'public',
    'The quickstart template must never have public publish access.'
  )
  for (const name of packageNames) validateManifest(name)
}

function packPackage(name: (typeof packageNames)[number]): void {
  const packagePath = join(root, 'packages', name)
  const cache = mkdtempSync(join(tmpdir(), 'agile-nuxt-npm-cache-'))
  try {
    const result = spawnSync(
      'npm',
      ['pack', '--dry-run', '--json', '--cache', cache],
      {
        cwd: packagePath,
        encoding: 'utf8',
        env: { ...process.env, npm_config_update_notifier: 'false' }
      }
    )
    if (result.status !== 0) {
      throw new Error(`${name}: npm pack failed.\n${result.stderr || result.stdout}`)
    }
    const pack = (JSON.parse(result.stdout) as PackResult[])[0]
    assert(pack, `${name}: npm pack returned no package result.`)
    const forbidden = pack.files
      .map((file) => file.path)
      .filter(
        (path) =>
          !(
            path === 'package.json' ||
            path === 'README.md' ||
            path === 'LICENSE' ||
            path.startsWith('dist/')
          )
      )
    assert(
      forbidden.length === 0,
      `${name}: forbidden files would be published: ${forbidden.join(', ')}`
    )
    console.info(
      `[pack:check] ${pack.name}@${pack.version}: ${pack.files.length} allowed files`
    )
  } finally {
    rmSync(cache, { recursive: true, force: true })
  }
}

validateRepository()

const selected = requestedPackage
  ? packageNames.filter((name) => name === requestedPackage)
  : [...packageNames]

assert(
  !requestedPackage || selected.length === 1,
  `Unknown package "${requestedPackage}". Expected edge-db or backend.`
)

if (shouldPack) {
  for (const name of selected) packPackage(name)
}

console.info('[check-package] package publishing safeguards passed')
