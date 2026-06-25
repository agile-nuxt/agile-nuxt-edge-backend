import type { BackendConfig } from './runtime/types.js'

export function defineBackendConfig<const TConfig extends BackendConfig>(
  config: TConfig
): TConfig {
  return config
}
