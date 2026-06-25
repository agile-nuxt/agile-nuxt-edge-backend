# Agile Nuxt Fullstack Quickstart

> **GitHub-only template:** this project is private and is not published to npm.

A copyable Nuxt 4 starter using `@agile-nuxt/edge-db` and
`@agile-nuxt/backend` together.

Package release target: `@agile-nuxt/edge-db@0.2.0` and
`@agile-nuxt/backend@0.2.0`.

## Included

- English LTR responsive application shell.
- Public no-auth product and customer entities for a frictionless first run.
- Functional product dashboard with create, status update, delete, loading, empty, and error states.
- Optional auth-ready login form.
- Node server deployment preset.
- Health endpoint at `/api/health`.
- Permission-checked WebSocket change events at `/api/backend/ws`.

## Requirements

- Node.js 20 or newer.
- pnpm 9 or newer.
- A writable persistent filesystem.
- One active writer per database path.

## Install and run

Inside this monorepo:

```bash
pnpm install
pnpm --filter agile-nuxt-fullstack dev
```

After copying the template outside this monorepo, replace workspace dependencies:

```bash
pnpm add nuxt @agile-nuxt/edge-db @agile-nuxt/backend
pnpm dev
```

Open `http://localhost:3000`.

## Enable auth

1. Add a schema-defined users entity with `email`, private `passwordHash`, `role`,
   and `isActive` fields.
2. Replace `auth: false` in `server/backend.config.ts` with JWT configuration.
3. Set separate secrets of at least 32 random bytes in `.env`.
4. Change `authEnabled` in `pages/login.vue` to `true`.
5. Replace public write permissions with role or policy rules.

## Add an entity

Add the entity under `entities` in `server/backend.config.ts`, explicitly set
`api: true`, define indexes, and grant only the permissions the public API needs.

```ts
orders: {
  fields: {
    id: 'id',
    status: 'text.default:draft',
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
```

## cPanel deployment

1. Build with `pnpm build`.
2. Upload `.output` and required production package metadata.
3. Set the startup file to `.output/server/index.mjs`.
4. Set `EDGE_DB_PATH` to a writable persistent directory outside `.output`.
5. Run one cPanel Node application instance against that database path.
6. Use `edge-db backup`; do not copy the live storage folder while writes are active.

The default relative storage path is suitable for local development. Production
deployments should use an absolute path managed independently from application releases.

## Limitations

Version 0.2 is not for simultaneous multi-writer operation, ephemeral serverless
filesystems, analytical workloads, arbitrary SQL, or PostgreSQL-style joins.
Multi-server deployments require a strong external writer lease, shared durable
storage, and a realtime adapter for cross-server WebSocket delivery.

See the [root documentation](../../README.md) for storage safety, auth, backup,
recovery, diagnostics, and production limitations.
