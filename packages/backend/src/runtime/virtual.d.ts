declare module '#agile-backend-config' {
  import type { BackendModuleOptions } from './types.js'
  const config: BackendModuleOptions
  export default config
}

declare module 'nitropack/runtime' {
  import type { NitroApp } from 'nitropack'
  export function defineNitroPlugin(plugin: (nitroApp: NitroApp) => void | Promise<void>): unknown
}
