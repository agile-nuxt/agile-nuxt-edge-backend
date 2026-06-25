# `@agile-nuxt/edge-db`

A zero-setup, pure TypeScript embedded database for schema-driven Node, Nuxt,
and Nitro applications.

Current release: `0.2.0`.

## Installation

```bash
pnpm add @agile-nuxt/edge-db
```

Requires Node.js 20 or newer and a writable persistent filesystem.

## What It Is

- Append-only, checksum-validated collection logs.
- Cross-collection transaction journal and single-writer queue.
- Primary, secondary, unique, and compound indexes.
- Snapshots, compaction, recovery, diagnostics, backup, restore, and CLI.
- Type inference from `defineSchema`.
- Pure TypeScript with no native database dependency.

## What It Is Not

Version 0.2 is not SQL, PostgreSQL, a multi-active-writer database, an analytical
engine, or an ephemeral serverless database. It does not implement arbitrary joins.

## Schema Example

```ts
import {
  createDatabase,
  defineSchema,
  type InferCreate,
  type InferPublicCollection,
  type InferSchema,
  type InferUpdate
} from '@agile-nuxt/edge-db'

const schema = defineSchema({
  users: {
    fields: {
      id: 'id',
      name: 'text',
      email: 'text.unique',
      passwordHash: 'text.private',
      role: 'text.default:user',
      createdAt: 'datetime',
      updatedAt: 'datetime'
    },
    indexes: ['email', 'role', 'createdAt'],
    unique: ['email'],
    timestamps: true
  }
})

type AppData = InferSchema<typeof schema>
type NewUser = InferCreate<(typeof schema)['users']>
type UserPatch = InferUpdate<(typeof schema)['users']>
type PublicUser = InferPublicCollection<(typeof schema)['users']>

const db = createDatabase({
  path: './storage/edge-db',
  schema
})

await db.boot()
```

Supported field types are `id`, `text`, `integer`, `real`, `boolean`, `json`,
and `datetime`, with nullable, unique, private, default, and reference metadata.

## Storage Model

```text
edge-db/
  manifest.json
  journal.ndjson
  lock
  archive/
  collections/
    users/
      schema.json
      snapshot-000123.json
      log-000002.ndjson
      archive/
```

Manifests, schemas, snapshots, and log records carry format versions. Writes are
append-only and fsynced. Manifests and snapshots use temp files plus atomic rename.

## CRUD

```ts
const users = db.collection('users')

const user = await users.create({
  name: 'Admin',
  email: 'admin@example.com',
  passwordHash: 'server-created-hash'
})

await users.update(user.id, { role: 'admin' })
await users.findById(user.id)
await users.delete(user.id)
```

Collections also support `createMany`, `findFirst`, `findMany`, `count`, `exists`,
`updateMany`, `deleteMany`, `softDelete`, `restore`, and `upsert`.

Private fields are removed from normal query output. Trusted server-only code can
use the explicitly named internal read helpers when private data is required.

## Declared Relation Includes

```ts
const posts = await db.collection('posts').findMany({
  include: {
    author: { select: ['id', 'name'] }
  }
})
```

Includes are limited to one level of declared `belongsTo` or `hasMany` metadata
and bounded by `query.maxIncludeRecords`. They are not arbitrary or recursive joins.

## Filters and Pagination

```ts
const page = await users.findMany({
  where: {
    role: 'admin',
    createdAt: { gte: '2026-01-01T00:00:00.000Z' }
  },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  cursor: undefined,
  select: ['id', 'name', 'email', 'role'],
  debug: true
})
```

Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`,
`startsWith`, `endsWith`, and `isNull`.

Limits are enforced for result size and `in`/`notIn` items. Cursor pagination is
used instead of offset pagination.

## Indexes and Query Planner

The deterministic planner prefers:

1. Primary ID index.
2. Unique index.
3. Compound index.
4. Secondary index with the smallest candidate set.
5. Scan fallback, when allowed.

Development logs warnings for scans and unindexed sorting. Production rejects
expensive unindexed queries by default unless `allowUnindexedQueries` is enabled.

## Transactions

```ts
await db.transaction(async (tx) => {
  const user = await tx.collection('users').create({ /* ... */ })
  await tx.collection('auditLogs').create({
    userId: user.id,
    action: 'created'
  })
})
```

Recovery applies only globally committed transactions. Failed transactions are
rolled back in memory and ignored on replay.

## Snapshots and Compaction

Snapshots limit boot replay. Compaction pauses writes, writes and reload-verifies
new snapshots, atomically activates the manifest, then archives old logs.

```ts
await db.compact()
```

## Backup and Restore

```ts
await db.backup('/srv/backups/app-2026-06-24')
await db.restore('/srv/backups/app-2026-06-24')
```

Do not copy the live database folder while writes are active. Backup format 2
stores and verifies a SHA-256 inventory of every file before restore activation.
Format 1 backups remain readable with a reduced-verification warning.

## Schema Planning and Migrations

```ts
const plan = await db.planSchemaChanges()

const migrated = createDatabase({
  path: './storage/edge-db',
  schema: nextSchema,
  schemaSync: {
    migrations: {
      users: (record) => ({
        ...record,
        slug: String(record.email).toLocaleLowerCase()
      })
    }
  }
})
```

Required fields, type changes, removed fields, and new unique constraints require
explicit handlers. Verified migration snapshots use a recovery marker so an
interruption can complete or roll back safely.

## Diagnostics

```ts
const diagnostics = await db.diagnostics()
```

Diagnostics include boot duration, recovery counts, lock state, permission checks,
record/index counts, log and snapshot files, storage size, memory estimates, and
optional query statistics.

Boot also tests read, write, rename, delete, and exclusive-lock permissions.
Writable recovery quarantines and truncates invalid tail bytes before accepting
new writes. Read-only mode reports damaged tails without modifying storage.

## CLI

```bash
edge-db doctor --path ./storage/edge-db
edge-db doctor --repair --path ./storage/edge-db
edge-db schema diff --schema ./schema.json --path ./storage/edge-db
edge-db inspect --path ./storage/edge-db
edge-db backup ./backup --path ./storage/edge-db
edge-db restore ./backup --path ./storage/edge-db
edge-db compact --path ./storage/edge-db
edge-db export ./data.json --path ./storage/edge-db
edge-db import ./data.json --path ./storage/edge-db
edge-db benchmark
```

The backup command acquires the writer lock and refuses to copy an active database
owned by another process.

## Multi-Server Adaptability

The default `FileCoordinator` enforces one writable process. Multi-server
deployments can supply a `DatabaseCoordinator` backed by a strong lease service:

```ts
const db = createDatabase({
  path: '/shared/persistent/edge-db',
  schema,
  coordination: {
    adapter: redisLeaseCoordinator,
    ownerId: process.env.INSTANCE_ID,
    autoRefreshReadOnly: true
  }
})
```

All instances must share the same durable filesystem. The adapter must maintain
one renewable writer lease and report lease loss through `assertOwned()`. Change
events can refresh read-only replicas. This is one active writer across servers,
not simultaneous multi-writer file appends.

## cPanel Notes

- Use Nitro's `node-server` preset.
- Store data outside `.output` and release directories.
- Ensure the Node user can read, write, rename, delete, and lock the path.
- Run one active writer. Multiple servers require shared durable storage and a
  tested external writer-lease coordinator.
- Use the backup API or CLI, not raw live-folder copies.

## API Reference

Public exports include:

- `createDatabase`
- `defineSchema`
- `Database`
- `Collection`
- `EdgeDbError`
- `diagnoseStorage`
- `restoreBackup`
- `verifyBackup`
- `InferCollection`
- `InferCreate`
- `InferUpdate`
- `InferPublicCollection`
- `InferSchema`
- `DatabaseCoordinator`
- schema planning and migration types
- query, schema, diagnostics, relation, and logger types

## Limitations

Not for simultaneous multi-writer operation, uncoordinated network filesystems,
analytical workloads, arbitrary SQL, PostgreSQL-style joins, ephemeral filesystems,
or datasets that cannot fit records and configured indexes in one Node process.

See the [root documentation](../../README.md) for disaster recovery, deployment,
publishing, and the GitHub-only quickstart template.
