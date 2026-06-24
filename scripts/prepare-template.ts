import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface TemplatePackage {
  name?: string
  private?: boolean
  scripts?: Record<string, string>
  publishConfig?: {
    access?: string
  }
}

interface ChangesetConfig {
  ignore?: string[]
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templateRoot = join(root, 'templates', 'agile-nuxt-fullstack')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const manifest = JSON.parse(
  readFileSync(join(templateRoot, 'package.json'), 'utf8')
) as TemplatePackage
const changesets = JSON.parse(
  readFileSync(join(root, '.changeset', 'config.json'), 'utf8')
) as ChangesetConfig

assert(manifest.name === 'agile-nuxt-fullstack', 'Template package name is invalid.')
assert(manifest.private === true, 'Template package.json must include private: true.')
assert(
  manifest.publishConfig?.access !== 'public',
  'Template publishConfig must never grant public access.'
)
assert(!manifest.scripts?.publish, 'Template must not define a publish script.')
assert(
  changesets.ignore?.includes('agile-nuxt-fullstack'),
  'Changesets must ignore agile-nuxt-fullstack.'
)

for (const path of [
  'README.md',
  'nuxt.config.ts',
  'app.vue',
  'tsconfig.json',
  '.env.example',
  '.gitignore',
  'pages/index.vue',
  'pages/dashboard.vue',
  'pages/login.vue',
  'components/AppEntityTable.vue',
  'components/AppLoginForm.vue',
  'composables/useProductsDemo.ts',
  'assets/css/main.css',
  'server/api/health.get.ts'
]) {
  assert(existsSync(join(templateRoot, path)), `Template is missing ${path}.`)
}

const templateText = [
  readFileSync(join(templateRoot, 'app.vue'), 'utf8'),
  readFileSync(join(templateRoot, 'assets/css/main.css'), 'utf8')
].join('\n')
assert(!templateText.includes('dir="rtl"'), 'Template must remain English and LTR.')

console.info('[template:check] private GitHub-only template safeguards passed')
