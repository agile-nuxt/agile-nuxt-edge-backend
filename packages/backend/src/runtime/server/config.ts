import { assertStrongSecret } from './auth/jwt.js'
import type { BackendConfig, ResolvedBackendConfig } from '../types.js'

export function resolveBackendConfig(options: BackendConfig): ResolvedBackendConfig {
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
          cookiePath: options.auth.cookiePath ?? '/',
          cookieNames: {
            access: options.auth.cookieNames?.access ?? 'edge_access',
            refresh: options.auth.cookieNames?.refresh ?? 'edge_refresh',
            csrf: options.auth.cookieNames?.csrf ?? 'edge_csrf'
          },
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
