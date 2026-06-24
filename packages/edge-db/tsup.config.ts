import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' }
    }
  },
  {
    entry: {
      'cli/cli': 'src/cli/cli.ts'
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    banner: {
      js: '#!/usr/bin/env node'
    },
    outExtension() {
      return { js: '.mjs' }
    }
  }
])
