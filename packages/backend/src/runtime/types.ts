import type {
  CollectionSchemaDefinition,
  DatabaseOptions,
  InferCollection,
  InferPublicCollection,
  InferPublicCreate,
  InferPublicUpdate,
  SchemaDefinition
} from '@agile-nuxt/edge-db'

export type BackendAction = 'list' | 'read' | 'create' | 'update' | 'delete' | 'restore'

export interface BackendUser {
  id: string
  email?: string
  role?: string
  [key: string]: unknown
}

export interface PermissionContext {
  user: BackendUser | null
  entity: string
  action: BackendAction
  record?: Record<string, unknown>
}

export type PermissionRule =
  | 'public'
  | 'disabled'
  | 'self'
  | string[]
  | ((context: PermissionContext) => boolean | Promise<boolean>)

export interface EntityHooks {
  beforeCreate?: (context: {
    user: BackendUser | null
    data: Record<string, unknown>
  }) => Record<string, unknown> | Promise<Record<string, unknown>>
  afterCreate?: (context: {
    user: BackendUser | null
    record: Record<string, unknown>
  }) => void | Promise<void>
  beforeUpdate?: (context: {
    user: BackendUser | null
    record: Record<string, unknown>
    patch: Record<string, unknown>
  }) => Record<string, unknown> | Promise<Record<string, unknown>>
  afterUpdate?: (context: {
    user: BackendUser | null
    record: Record<string, unknown>
  }) => void | Promise<void>
  beforeDelete?: (context: {
    user: BackendUser | null
    record: Record<string, unknown>
  }) => void | Promise<void>
  afterDelete?: (context: {
    user: BackendUser | null
    record: Record<string, unknown>
  }) => void | Promise<void>
}

export interface BackendEntity extends CollectionSchemaDefinition {
  api?: boolean
  publicFields?: string[]
  writableFields?: string[]
  permissions?: Partial<Record<BackendAction, PermissionRule>>
  hooks?: EntityHooks
  includes?: string[]
}

export interface BackendCookieNames {
  access?: string
  refresh?: string
  csrf?: string
}

export interface BackendAuthConfig {
  enabled: true
  strategy?: 'jwt'
  userEntity?: string
  accessTokenSecret: string
  refreshTokenSecret: string
  accessTokenMaxAge?: string | number
  refreshTokenMaxAge?: string | number
  cookieMode?: boolean
  cookieSecure?: boolean
  cookieDomain?: string
  cookiePath?: string
  cookieNames?: BackendCookieNames
  allowRegistration?: boolean
  loginRateLimit?: {
    maxAttempts?: number
    windowMs?: number
  }
}

export interface RateLimitConsumeOptions {
  maxRequests: number
  windowMs: number
}

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RateLimitAdapter {
  readonly name: string
  consume(
    key: string,
    options: RateLimitConsumeOptions
  ): RateLimitDecision | Promise<RateLimitDecision>
}

export interface BackendRealtimeEvent {
  type: 'entity.changed'
  entity: string
  id: string
  operation: 'insert' | 'update' | 'delete' | 'restore'
  timestamp: string
}

export interface BackendRealtimeAdapter {
  readonly name: string
  publish(event: BackendRealtimeEvent): void | Promise<void>
  subscribe(
    listener: (event: BackendRealtimeEvent) => void | Promise<void>
  ): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>
}

export interface BackendConfig<
  TEntities extends Record<string, BackendEntity> = Record<string, BackendEntity>
> {
  routePrefix?: string
  auth?: false | BackendAuthConfig
  db: Omit<DatabaseOptions<SchemaDefinition>, 'schema'>
  entities: TEntities
  security?: {
    maxBodySize?: number
    rateLimit?: {
      maxRequests?: number
      windowMs?: number
      maxBuckets?: number
      adapter?: RateLimitAdapter
    }
    diagnosticsEndpoint?: boolean
    maxQueryStringSize?: number
  }
  websocket?: false | {
    enabled?: boolean
    path?: string
    authRequired?: boolean
    allowedEntities?: string[]
    allowedOrigins?: string[]
    maxSubscriptions?: number
    adapter?: BackendRealtimeAdapter
  }
}

export type BackendModuleOptions<
  TEntities extends Record<string, BackendEntity> = Record<string, BackendEntity>
> =
  | BackendConfig<TEntities>
  | {
      configFile: string
      routePrefix?: string
      websocket?: false | {
        enabled?: boolean
      path?: string
      }
    }

export interface ResolvedBackendConfig extends BackendConfig {
  routePrefix: string
  auth: false | Required<
    Pick<
      BackendAuthConfig,
      | 'enabled'
      | 'strategy'
      | 'userEntity'
      | 'accessTokenSecret'
      | 'refreshTokenSecret'
      | 'cookieMode'
      | 'cookieSecure'
      | 'allowRegistration'
    >
  > &
    BackendAuthConfig
}

export type InferBackendEntities<TConfig extends BackendConfig> = TConfig['entities']

export type InferBackendRecord<
  TConfig extends BackendConfig,
  TEntity extends keyof TConfig['entities']
> = InferPublicCollection<TConfig['entities'][TEntity]>

export type InferBackendInternalRecord<
  TConfig extends BackendConfig,
  TEntity extends keyof TConfig['entities']
> = InferCollection<TConfig['entities'][TEntity]>

export type InferBackendCreate<
  TConfig extends BackendConfig,
  TEntity extends keyof TConfig['entities']
> = InferPublicCreate<TConfig['entities'][TEntity]>

export type InferBackendUpdate<
  TConfig extends BackendConfig,
  TEntity extends keyof TConfig['entities']
> = InferPublicUpdate<TConfig['entities'][TEntity]>
