# `@agile-nuxt/backend`

A secure Nuxt 4 and Nitro backend service module powered by
`@agile-nuxt/edge-db`.

Current release: `0.2.0`.

## Installation

```bash
pnpm add @agile-nuxt/edge-db @agile-nuxt/backend
```

## Nuxt Setup

```ts
// server/backend.config.ts
import { defineBackendConfig } from '@agile-nuxt/backend/config'

export default defineBackendConfig({
  auth: false,
  db: {
    path: process.env.EDGE_DB_PATH || './storage/edge-db'
  },
  entities: {}
})
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agile-nuxt/backend'],
  nitro: { preset: 'node-server' },
  backend: {
    configFile: './server/backend.config.ts'
  }
})
```

Writable deployments require a persistent filesystem and one writable Node
process per database path.

Inline serializable configuration remains supported. Hooks and adapters belong in
the server config file; functions in `nuxt.config.ts` are rejected rather than
serialized with `Function.toString()`.

## Auth Disabled Mode

```ts
backend: {
  auth: false,
  db: { path: './storage/edge-db' },
  entities: {
    products: {
      fields: {
        id: 'id',
        title: 'text',
        price: 'integer',
        status: 'text.default:active',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['status', 'createdAt'],
      timestamps: true,
      api: true,
      permissions: {
        list: 'public',
        read: 'public',
        create: 'disabled',
        update: 'disabled',
        delete: 'disabled'
      }
    }
  }
}
```

Auth endpoints return `404` when auth is disabled. Permissions are still enforced,
and unspecified actions default to disabled.

## Auth Enabled Mode

```ts
backend: {
  auth: {
    enabled: true,
    strategy: 'jwt',
    userEntity: 'users',
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
    accessTokenMaxAge: '15m',
    refreshTokenMaxAge: '30d',
    cookieMode: true
  },
  db: { path: './storage/edge-db' },
  entities: {
    users: {
      fields: {
        id: 'id',
        email: 'text.unique',
        passwordHash: 'text.private',
        role: 'text.default:user',
        isActive: 'boolean.default:true',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['email', 'role'],
      unique: ['email'],
      timestamps: true,
      api: true,
      publicFields: ['id', 'email', 'role', 'isActive'],
      permissions: {
        list: ['admin'],
        read: ['admin', 'self'],
        create: ['admin'],
        update: ['admin', 'self'],
        delete: ['admin']
      }
    }
  }
}
```

Secrets shorter than 32 bytes are rejected. Passwords use Node `scrypt`. Refresh
tokens are opaque, hashed at rest, revoked on use, and rotated. Cookie mode uses
HTTP-only, `SameSite=Strict` cookies plus CSRF validation.

Refresh tokens form revocable families. Reuse of a rotated token revokes the
entire family. Cookie names, domain, and path are configurable.

## Entity Configuration

- `fields`: schema whitelist and field metadata.
- `indexes` and `unique`: query and uniqueness constraints.
- `timestamps` and `softDelete`: lifecycle behavior.
- `api: true`: required before any generated route exposes the entity.
- `publicFields`: optional output allowlist.
- `writableFields`: optional public write allowlist.
- `permissions`: per-action authorization rules.
- `hooks`: before/after CRUD extension points.

Unknown and private fields are blocked from public writes. Private fields are
removed from API output.

## Generated Routes

CRUD:

- `GET /api/backend/:entity`
- `POST /api/backend/:entity`
- `POST /api/backend/:entity/query`
- `GET /api/backend/:entity/:id`
- `PATCH /api/backend/:entity/:id`
- `DELETE /api/backend/:entity/:id`
- `POST /api/backend/:entity/:id/restore`

When auth is enabled:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/me`

The diagnostics endpoint is registered only when explicitly enabled and requires
the admin role when auth is active.

## Permissions

Rules support:

- `public`
- `disabled`
- role arrays such as `['admin', 'staff']`
- `self`
- async policy functions

```ts
permissions: {
  read: ({ user, record }) =>
    user?.role === 'admin' || record.userId === user?.id,
  update: ['admin', 'self'],
  delete: ['admin']
}
```

Record-level read, update, delete, and restore policies run after lookup.

## Field Security

- Only configured entities exist through generated CRUD.
- Only schema fields may be filtered, sorted, selected, or written.
- Private fields are never returned by normal API reads.
- Private and non-writable fields are rejected on public writes.
- Body size, query size, `in` filters, and request rates are bounded.
- Bodies are bounded while streaming; malformed JSON and encoded query filters
  return stable `400` responses.

## Hooks

```ts
hooks: {
  beforeCreate: async ({ user, data }) => ({
    ...data,
    createdBy: user?.id
  }),
  afterCreate: async ({ record }) => {
    // Trigger an application-specific side effect.
  },
  beforeUpdate: async ({ patch }) => patch,
  afterDelete: async ({ record }) => {
    // Audit the deleted record.
  }
}
```

## Frontend Composables

```ts
const products = useBackendEntity('products')

const page = await products.list({
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  limit: 20
})

await products.create({ title: 'Plan', price: 120 })
await products.update(id, { price: 150 })
await products.remove(id)
```

```ts
const auth = useBackendAuth()
await auth.login({ email, password })
await auth.me()
await auth.logout()
```

For end-to-end inference:

```ts
import type backendConfig from '~/server/backend.config'

const backend = createBackendClient<typeof backendConfig>()
const products = backend.entity('products')
```

Entity names, filters, create/update inputs, and public records are inferred.
Private fields are excluded from public client input and output types.

## WebSockets

```ts
websocket: {
  enabled: true,
  allowedEntities: ['products'],
  allowedOrigins: ['https://app.example.com'],
  maxSubscriptions: 20,
  adapter: redisRealtimeAdapter
}
```

Connect to `/api/backend/ws` and send
`{"type":"subscribe","entity":"products"}`. Authorized clients receive
metadata-only `entity.changed` messages and refetch through normal HTTP routes.
Cookie or bearer authentication, origin validation, entity permissions, message
limits, and subscription limits apply. `useBackendRealtime()` provides the browser
client. A realtime adapter can distribute events across backend servers.

## Permission-Safe Includes

Relation names must be explicitly listed on the source entity:

```ts
posts: {
  // fields and relations...
  includes: ['author']
}
```

Every included target record is checked against its own `read` permission and
`publicFields`. Arbitrary and recursive joins remain unsupported.

## Server Utilities

For domain workflows that do not fit generic CRUD:

```ts
import {
  defineBackendHandler,
  requireAuth,
  useBackendDb
} from '@agile-nuxt/backend/server'

export default defineBackendHandler(async (event) => {
  const user = await requireAuth(event)
  const db = await useBackendDb()

  return db.transaction(async (tx) => {
    // Implement a domain-specific operation.
  })
})
```

Also available: `getCurrentUser`, `requirePermission`, and
`publishBackendEvent`.

## Deployment

- Use Nitro's `node-server` preset.
- Use a writable persistent path outside `.output`.
- Run one writable process by default, or configure a strong external
  `DatabaseCoordinator` for one active writer across servers on shared storage.
- Configure a realtime adapter when WebSocket clients connect to multiple servers.
- Use strong, separate auth secrets and HTTPS.
- Run `edge-db doctor` under the production Node user.
- Use `edge-db backup`; never copy live storage during writes.

## API Reference

Main exports:

- Nuxt module default export
- `BackendService`
- `createBackendRuntime`
- `hashPassword` and `verifyPassword`
- `signAccessToken` and `verifyAccessToken`
- `RateLimiter`
- `InMemoryRateLimitAdapter`
- `defineBackendConfig`
- `createBackendClient`
- backend entity, auth, user, permission, hook, and module option types

Server export:

- `useBackendDb`
- `getCurrentUser`
- `requireAuth`
- `requirePermission`
- `defineBackendHandler`
- `publishBackendEvent`

## Limitations

Version 0.2 supports multi-server adaptation through external writer-lease and
realtime adapters. It remains a single-active-writer filesystem database, not a
simultaneous multi-writer or distributed consensus database, analytical engine,
arbitrary SQL interface, or PostgreSQL-style relational query layer.

See the [root documentation](../../README.md) and the private
[fullstack quickstart](../../templates/agile-nuxt-fullstack).
