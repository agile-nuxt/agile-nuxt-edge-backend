import {
  addImports,
  addServerHandler,
  addServerPlugin,
  addTemplate,
  createResolver,
  defineNuxtModule
} from '@nuxt/kit'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import type { BackendModuleOptions } from './runtime/types.js'

function serialize(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'function') {
    throw new TypeError(
      'Backend functions cannot be serialized from nuxt.config. Move hooks and adapters to a defineBackendConfig file and set backend.configFile.'
    )
  }
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${serialize(item)}`)
      .join(',')}}`
  }
  throw new TypeError(`Cannot serialize backend config value of type ${typeof value}.`)
}

export default defineNuxtModule<BackendModuleOptions>({
  meta: {
    name: '@agile-nuxt/backend',
    configKey: 'backend',
    compatibility: { nuxt: '^4.0.0' }
  },
  defaults: {
    routePrefix: '/api/backend',
    auth: false,
    db: {
      path: './storage/edge-db'
    },
    entities: {}
  },
  setup(options, nuxt) {
    const moduleUrl =
      typeof import.meta.url === 'string'
        ? import.meta.url
        : pathToFileURL(__filename).href
    const resolver = createResolver(moduleUrl)
    const configFile =
      'configFile' in options
        ? resolve(nuxt.options.rootDir, options.configFile)
        : undefined
    const configTemplate = addTemplate({
      filename: 'agile-backend-config.mjs',
      write: true,
      getContents: () =>
        configFile
          ? `export { default } from ${JSON.stringify(configFile)}\n`
          : `export default ${serialize(options)}\n`
    })
    nuxt.options.alias['#agile-backend-config'] = configTemplate.dst

    addServerPlugin(resolver.resolve('./runtime/server/plugin/backend'))
    addServerHandler({
      route: `${options.routePrefix ?? '/api/backend'}/**`,
      handler: resolver.resolve('./runtime/server/api/backend/[...path]')
    })
    addServerHandler({
      route: `${options.routePrefix ?? '/api/backend'}/_diagnostics`,
      method: 'get',
      handler: resolver.resolve('./runtime/server/api/backend/diagnostics.get')
    })
    for (const [route, method] of [
      ['register', 'post'],
      ['login', 'post'],
      ['refresh', 'post'],
      ['logout', 'post'],
      ['logout-all', 'post'],
      ['me', 'get']
    ] as const) {
      addServerHandler({
        route: `/api/auth/${route}`,
        method,
        handler: resolver.resolve(`./runtime/server/api/auth/${route}.${method}`)
      })
    }

    if (options.websocket !== false) {
      const nuxtOptions = nuxt.options as typeof nuxt.options & {
        nitro: { experimental?: { websocket?: boolean } }
      }
      nuxtOptions.nitro.experimental ??= {}
      nuxtOptions.nitro.experimental.websocket = true
      addServerHandler({
        route: options.websocket?.path ?? `${options.routePrefix ?? '/api/backend'}/ws`,
        handler: resolver.resolve('./runtime/server/api/backend/ws')
      })
    }

    addImports([
      {
        name: 'useBackend',
        as: 'useBackend',
        from: resolver.resolve('./runtime/app/composables/useBackend')
      },
      {
        name: 'useBackendEntity',
        as: 'useBackendEntity',
        from: resolver.resolve('./runtime/app/composables/useBackendEntity')
      },
      {
        name: 'useBackendAuth',
        as: 'useBackendAuth',
        from: resolver.resolve('./runtime/app/composables/useBackendAuth')
      },
      {
        name: 'createBackendClient',
        as: 'createBackendClient',
        from: resolver.resolve('./runtime/app/composables/createBackendClient')
      },
      {
        name: 'useBackendRealtime',
        as: 'useBackendRealtime',
        from: resolver.resolve('./runtime/app/composables/useBackendRealtime')
      }
    ])
  }
})
