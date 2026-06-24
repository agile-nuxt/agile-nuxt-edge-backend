import './nuxt.js'

export { default } from './module.js'
export { BackendService } from './runtime/server/backendService.js'
export { createBackendRuntime, type BackendRuntime } from './runtime/server/factory.js'
export { hashPassword, verifyPassword } from './runtime/server/auth/password.js'
export { signAccessToken, verifyAccessToken } from './runtime/server/auth/jwt.js'
export { RateLimiter } from './runtime/server/security/rateLimit.js'
export type {
  BackendAction,
  BackendAuthConfig,
  BackendEntity,
  BackendModuleOptions,
  BackendUser,
  EntityHooks,
  PermissionContext,
  PermissionRule
} from './runtime/types.js'
