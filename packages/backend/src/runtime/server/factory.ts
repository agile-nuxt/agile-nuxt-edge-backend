import { createDatabase, type Database, type SchemaDefinition } from '@agile-nuxt/edge-db'
import { BackendService } from './backendService.js'
import { resolveBackendConfig } from './config.js'
import { RateLimiter } from './security/rateLimit.js'
import { BackendRealtimeHub } from './realtime/hub.js'
import type { BackendConfig, ResolvedBackendConfig } from '../types.js'

export interface BackendRuntime {
  config: ResolvedBackendConfig
  db: Database
  service: BackendService
  rateLimiter: RateLimiter
  loginRateLimiter: RateLimiter
  realtime: BackendRealtimeHub
}

function buildSchema(config: ResolvedBackendConfig): SchemaDefinition {
  const schema: SchemaDefinition = { ...config.entities }
  if (config.auth) {
    schema.edgeAuthSessions = {
      fields: {
        id: 'id',
        userId: 'text',
        familyId: 'text',
        refreshTokenHash: 'text.private.unique',
        replacedByHash: 'text.private.nullable',
        expiresAt: 'datetime',
        revokedAt: 'datetime.nullable',
        reuseDetectedAt: 'datetime.nullable',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['userId', 'familyId', 'refreshTokenHash', 'expiresAt'],
      unique: ['refreshTokenHash'],
      timestamps: true
    }
  }
  return schema
}

export async function createBackendRuntime(options: BackendConfig): Promise<BackendRuntime> {
  const config = resolveBackendConfig(options)
  const realtime = new BackendRealtimeHub(
    config.websocket && config.websocket.adapter
      ? config.websocket.adapter
      : undefined
  )
  await realtime.start()
  const db = createDatabase({
    ...config.db,
    schema: buildSchema(config),
    query: {
      ...config.db.query,
      ...(config.security?.maxBodySize !== undefined
        ? { maxBodySize: config.security.maxBodySize }
        : {})
    }
  }, {
    afterWrite: async (operation) => {
      if (!config.entities[operation.collection]?.api) return
      await realtime.publish({
        type: 'entity.changed',
        entity: operation.collection,
        id: operation.id,
        operation: operation.op,
        timestamp: new Date().toISOString()
      })
    }
  })
  await db.boot()
  return {
    config,
    db,
    service: new BackendService(db, config),
    realtime,
    rateLimiter: new RateLimiter(
      config.security?.rateLimit?.maxRequests ?? 120,
      config.security?.rateLimit?.windowMs ?? 60_000,
      config.security?.rateLimit?.adapter,
      config.security?.rateLimit?.maxBuckets
    ),
    loginRateLimiter: new RateLimiter(
      config.auth ? config.auth.loginRateLimit?.maxAttempts ?? 5 : 5,
      config.auth ? config.auth.loginRateLimit?.windowMs ?? 60_000 : 60_000,
      config.security?.rateLimit?.adapter,
      config.security?.rateLimit?.maxBuckets
    )
  }
}
