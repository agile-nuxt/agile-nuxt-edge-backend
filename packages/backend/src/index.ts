import './nuxt.js'

export { default } from './module.js'
export { defineBackendConfig } from './config.js'
export { BackendService } from './runtime/server/backendService.js'
export { createBackendRuntime, type BackendRuntime } from './runtime/server/factory.js'
export { hashPassword, verifyPassword } from './runtime/server/auth/password.js'
export { signAccessToken, verifyAccessToken } from './runtime/server/auth/jwt.js'
export {
  InMemoryRateLimitAdapter,
  RateLimiter
} from './runtime/server/security/rateLimit.js'
export { createBackendClient } from './runtime/app/composables/createBackendClient.js'
export type {
  BackendAction,
  BackendAuthConfig,
  BackendConfig,
  BackendCookieNames,
  BackendEntity,
  BackendModuleOptions,
  BackendRealtimeAdapter,
  BackendRealtimeEvent,
  BackendUser,
  EntityHooks,
  InferBackendCreate,
  InferBackendEntities,
  InferBackendInternalRecord,
  InferBackendRecord,
  InferBackendUpdate,
  PermissionContext,
  PermissionRule,
  RateLimitAdapter,
  RateLimitConsumeOptions,
  RateLimitDecision
} from './runtime/types.js'
