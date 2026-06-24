import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/module.ts',
    'src/runtime/server/**/*.ts',
    'src/runtime/app/**/*.ts'
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  external: [
    'nuxt',
    '@nuxt/kit',
    'nitropack/runtime',
    '#agile-backend-config',
    '#app',
    '#imports'
  ]
})
