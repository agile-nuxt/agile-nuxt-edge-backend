import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'agile-nuxt-packed-'))
const packs = join(temporary, 'packs')
const fixture = join(temporary, 'fixture')

function run(command: string, args: string[], cwd = root): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}.`)
  }
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  throw new Error(`Timed out waiting for ${url}.`)
}

async function websocketRoundTrip(baseURL: string): Promise<void> {
  const socket = new WebSocket(baseURL.replace(/^http/, 'ws') + '/api/backend/ws')
  const messages: Array<Record<string, unknown>> = []
  socket.addEventListener('message', (event) => {
    messages.push(JSON.parse(String(event.data)) as Record<string, unknown>)
  })
  await new Promise<void>((resolvePromise, reject) => {
    socket.addEventListener('open', () => resolvePromise(), { once: true })
    socket.addEventListener('error', () => reject(new Error('WebSocket connection failed.')), {
      once: true
    })
  })
  socket.send(JSON.stringify({ type: 'subscribe', entity: 'products' }))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (messages.some((message) => message.type === 'subscribed')) break
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  const response = await fetch(`${baseURL}/api/backend/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Packed fixture', price: 20 })
  })
  if (!response.ok) throw new Error(`Packed CRUD request failed with ${response.status}.`)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (
      messages.some(
        (message) => message.type === 'entity.changed' && message.entity === 'products'
      )
    ) {
      socket.close()
      return
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  socket.close()
  throw new Error('Packed fixture did not receive a WebSocket change event.')
}

try {
  run('mkdir', ['-p', packs])
  for (const packageName of ['@agile-nuxt/edge-db', '@agile-nuxt/backend']) {
    run('corepack', ['pnpm', '--filter', packageName, 'pack', '--pack-destination', packs])
  }
  await cp(join(root, 'templates/agile-nuxt-fullstack'), fixture, {
    recursive: true,
    filter(source) {
      const path = relative(join(root, 'templates/agile-nuxt-fullstack'), source)
      return !(
        path === 'node_modules' ||
        path.startsWith('node_modules/') ||
        path.startsWith('.nuxt') ||
        path.startsWith('.output') ||
        path.startsWith('storage')
      )
    }
  })
  const tarballs = await readdir(packs)
  const edgeTarball = tarballs.find((file) => file.includes('edge-db'))
  const backendTarball = tarballs.find((file) => file.includes('backend'))
  if (!edgeTarball || !backendTarball) throw new Error('Package tarballs were not created.')
  const packageJsonPath = join(fixture, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    dependencies: Record<string, string>
    pnpm?: { overrides?: Record<string, string> }
  }
  const edgeDependency = `file:${join(packs, edgeTarball)}`
  packageJson.dependencies['@agile-nuxt/edge-db'] = edgeDependency
  packageJson.dependencies['@agile-nuxt/backend'] = `file:${join(packs, backendTarball)}`
  packageJson.pnpm = {
    ...packageJson.pnpm,
    overrides: {
      ...packageJson.pnpm?.overrides,
      '@agile-nuxt/edge-db': edgeDependency
    }
  }
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

  run('corepack', ['pnpm', 'install', '--offline'], fixture)
  run('corepack', ['pnpm', 'typecheck'], fixture)
  run('corepack', ['pnpm', 'build'], fixture)

  const port = 43_000 + (process.pid % 1_000)
  const server = spawn(process.execPath, [join(fixture, '.output/server/index.mjs')], {
    cwd: fixture,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      EDGE_DB_PATH: join(temporary, 'storage')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    const baseURL = `http://127.0.0.1:${port}`
    await waitForServer(`${baseURL}/api/health`)
    const malformed = await fetch(`${baseURL}/api/backend/products?where=%7Bbroken`)
    if (malformed.status !== 400) {
      throw new Error(`Malformed query returned ${malformed.status}, expected 400.`)
    }
    await websocketRoundTrip(baseURL)
  } finally {
    server.kill('SIGTERM')
    await new Promise((resolvePromise) => server.once('exit', resolvePromise))
  }
  console.info(`[packed-fixture] verified ${basename(edgeTarball)} and ${basename(backendTarball)}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
