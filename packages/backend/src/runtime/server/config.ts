import { assertStrongSecret } from './auth/jwt.js'
import type { BackendModuleOptions, ResolvedBackendConfig } from '../types.js'

export function resolveBackendConfig(options: BackendModuleOptions): ResolvedBackendConfig {
  const auth =
    options.auth === false || options.auth === undefined
      ? false
      : {
          ...options.auth,
          enabled: true as const,
          strategy: options.auth.strategy ?? 'jwt',
          userEntity: options.auth.userEntity ?? 'users',
          cookieMode: options.auth.cookieMode ?? true,
          cookieSecure: options.auth.cookieSecure ?? process.env.NODE_ENV === 'production',
          allowRegistration: options.auth.allowRegistration ?? false
        }
  if (auth) {
    assertStrongSecret(auth.accessTokenSecret, 'accessTokenSecret')
    assertStrongSecret(auth.refreshTokenSecret, 'refreshTokenSecret')
  }
  return {
    ...options,
    routePrefix: options.routePrefix ?? '/api/backend',
    auth
  }
}
