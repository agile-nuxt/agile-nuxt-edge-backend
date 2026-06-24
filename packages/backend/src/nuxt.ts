import type { BackendModuleOptions } from './runtime/types.js'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    backend?: BackendModuleOptions
  }

  interface NuxtOptions {
    backend?: BackendModuleOptions
  }
}

export {}
