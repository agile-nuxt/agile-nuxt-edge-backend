import { createDatabase, type Database, type SchemaDefinition } from '@agile-nuxt/edge-db'
import { BackendService } from './backendService.js'
import { resolveBackendConfig } from './config.js'
import { RateLimiter } from './security/rateLimit.js'
import type { BackendModuleOptions, ResolvedBackendConfig } from '../types.js'

export interface BackendRuntime {
  config: ResolvedBackendConfig
  db: Database
  service: BackendService
  rateLimiter: RateLimiter
  loginRateLimiter: RateLimiter
}

function buildSchema(config: ResolvedBackendConfig): SchemaDefinition {
  const schema: SchemaDefinition = { ...config.entities }
  if (config.auth) {
    schema.edgeAuthSessions = {
      fields: {
        id: 'id',
        userId: 'text',
        refreshTokenHash: 'text.private.unique',
        expiresAt: 'datetime',
        revokedAt: 'datetime.nullable',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['userId', 'refreshTokenHash', 'expiresAt'],
      unique: ['refreshTokenHash'],
      timestamps: true
    }
  }
  return schema
}

export async function createBackendRuntime(options: BackendModuleOptions): Promise<BackendRuntime> {
  const config = resolveBackendConfig(options)
  const db = createDatabase({
    ...config.db,
    schema: buildSchema(config),
    query: {
      ...config.db.query,
      ...(config.security?.maxBodySize !== undefined
        ? { maxBodySize: config.security.maxBodySize }
        : {})
    }
  })
  await db.boot()
  return {
    config,
    db,
    service: new BackendService(db, config),
    rateLimiter: new RateLimiter(
      config.security?.rateLimit?.maxRequests ?? 120,
      config.security?.rateLimit?.windowMs ?? 60_000
    ),
    loginRateLimiter: new RateLimiter(
      config.auth ? config.auth.loginRateLimit?.maxAttempts ?? 5 : 5,
      config.auth ? config.auth.loginRateLimit?.windowMs ?? 60_000 : 60_000
    )
  }
}
