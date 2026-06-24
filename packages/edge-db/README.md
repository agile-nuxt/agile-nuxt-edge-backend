# `@agile-nuxt/edge-db`

A zero-setup, pure TypeScript embedded database for schema-driven Node, Nuxt,
and Nitro applications.

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

Version 1 is not SQL, PostgreSQL, a distributed database, a multi-server write
system, an analytical engine, or an ephemeral serverless database. It does not
implement arbitrary joins.

## Schema Example

```ts
import {
  createDatabase,
  defineSchema,
  type InferSchema
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

Do not copy the live database folder while writes are active. The backup API
serializes against writes and verifies the staged backup before activation.

## Diagnostics

```ts
const diagnostics = await db.diagnostics()
```

Diagnostics include boot duration, recovery counts, lock state, permission checks,
record/index counts, log and snapshot files, storage size, memory estimates, and
optional query statistics.

Boot also tests read, write, rename, delete, and exclusive-lock permissions.

## CLI

```bash
edge-db doctor --path ./storage/edge-db
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

## cPanel Notes

- Use Nitro's `node-server` preset.
- Store data outside `.output` and release directories.
- Ensure the Node user can read, write, rename, delete, and lock the path.
- Run exactly one writable application instance per database path.
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
- `InferSchema`
- query, schema, diagnostics, relation, and logger types

## Limitations

Not for multi-server writes, distributed storage, analytical workloads, arbitrary
SQL, PostgreSQL-style joins, ephemeral filesystems, or datasets that cannot fit
records and configured indexes in one Node process.

See the [root documentation](../../README.md) for disaster recovery, deployment,
publishing, and the GitHub-only quickstart template.
