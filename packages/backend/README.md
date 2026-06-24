# `@agile-nuxt/backend`

A secure Nuxt 4 and Nitro backend service module powered by
`@agile-nuxt/edge-db`.

## Installation

```bash
pnpm add @agile-nuxt/edge-db @agile-nuxt/backend
```

## Nuxt Setup

```ts
export default defineNuxtConfig({
  modules: ['@agile-nuxt/backend'],
  nitro: { preset: 'node-server' },
  backend: {
    auth: false,
    db: {
      path: process.env.EDGE_DB_PATH || './storage/edge-db'
    },
    entities: {}
  }
})
```

Writable deployments require a persistent filesystem and one writable Node
process per database path.

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

Auth routes are not registered. Permissions are still enforced, and unspecified
actions default to disabled.

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

Also available: `getCurrentUser` and `requirePermission`.

## Deployment

- Use Nitro's `node-server` preset.
- Use a writable persistent path outside `.output`.
- Run one writable Node process per database path.
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
- backend entity, auth, user, permission, hook, and module option types

Server export:

- `useBackendDb`
- `getCurrentUser`
- `requireAuth`
- `requirePermission`
- `defineBackendHandler`

## Limitations

Version 1 is for single-server Nuxt/Nitro applications. It is not a multi-server
write system, distributed database, analytical engine, arbitrary SQL interface,
or PostgreSQL-style relational query layer.

See the [root documentation](../../README.md) and the private
[fullstack quickstart](../../templates/agile-nuxt-fullstack).
