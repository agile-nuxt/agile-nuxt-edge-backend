import type {
  CollectionSchemaDefinition,
  DatabaseOptions,
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
  allowRegistration?: boolean
  loginRateLimit?: {
    maxAttempts?: number
    windowMs?: number
  }
}

export interface BackendModuleOptions {
  routePrefix?: string
  auth?: false | BackendAuthConfig
  db: Omit<DatabaseOptions<SchemaDefinition>, 'schema'>
  entities: Record<string, BackendEntity>
  security?: {
    maxBodySize?: number
    rateLimit?: {
      maxRequests?: number
      windowMs?: number
    }
    diagnosticsEndpoint?: boolean
  }
}

export interface ResolvedBackendConfig extends BackendModuleOptions {
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
