import { appendFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDatabase,
  defineSchema,
  type InferCollection,
  type InferSchema
} from '../src/index.js'
import { encodeLogRecord } from '../src/storage/recordCodec.js'

const roots: string[] = []

async function tempRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `edge-db-${name}-`))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const schema = defineSchema({
  users: {
    fields: {
      id: 'id',
      name: 'text',
      email: 'text.unique',
      passwordHash: 'text.private',
      role: 'text.default:user',
      createdAt: 'datetime',
      updatedAt: 'datetime',
      deletedAt: 'datetime.nullable'
    },
    indexes: ['role', 'createdAt'],
    unique: ['email'],
    timestamps: true,
    softDelete: true
  },
  posts: {
    fields: {
      id: 'id',
      userId: {
        type: 'text',
        ref: { collection: 'users', onDelete: 'restrict' }
      },
      title: 'text',
      createdAt: 'datetime',
      updatedAt: 'datetime'
    },
    indexes: ['userId'],
    timestamps: true,
    relations: {
      author: {
        type: 'belongsTo',
        collection: 'users',
        localField: 'userId'
      }
    }
  }
})

type Inferred = InferSchema<typeof schema>
type User = InferCollection<(typeof schema)['users']>
const _typeCheck: Inferred['users'] | User | undefined = undefined
void _typeCheck

function database(path: string, extra: Record<string, unknown> = {}) {
  return createDatabase({
    path,
    schema,
    environment: 'test',
    query: { allowUnindexedQueries: true, maxLimit: 1_000 },
    snapshots: { everyOperations: 10_000 },
    compaction: { compactWhenLogOperationsExceed: 20_000 },
    ...extra
  })
}

describe('database', () => {
  it('supports CRUD, private fields, indexes, cursor pagination, soft delete, and restore', async () => {
    const root = await tempRoot('crud')
    const db = database(root, { diagnostics: { queryStats: true } })
    await db.boot()
    const users = db.collection('users')
    const created = await users.createMany([
      { name: 'A', email: 'a@example.com', passwordHash: 'secret', role: 'admin' },
      { name: 'B', email: 'b@example.com', passwordHash: 'secret', role: 'user' }
    ])

    expect(created[0]).not.toHaveProperty('passwordHash')
    await expect(
      users.create({ name: 'Duplicate', email: 'a@example.com', passwordHash: 'secret' })
    ).rejects.toMatchObject({ code: 'UNIQUE_CONSTRAINT' })

    const page = await users.findMany({
      where: { role: 'admin' },
      orderBy: { createdAt: 'desc' },
      limit: 1,
      debug: true
    })
    expect(page.data).toHaveLength(1)
    expect(page.plan?.strategy).toBe('secondary')
    expect(await users.count({ where: { role: { in: ['admin', 'user'] } } })).toBe(2)

    const id = String(created[0]!.id)
    await users.update(id, { name: 'Updated' })
    expect((await users.findById(id))?.name).toBe('Updated')
    await users.softDelete(id)
    expect(await users.findById(id)).toBeNull()
    expect(await users.findById(id, { withDeleted: true })).not.toBeNull()
    await users.restore(id)
    expect(await users.findById(id)).not.toBeNull()
    const diagnostics = await db.diagnostics()
    expect(diagnostics.queryStats?.total).toBeGreaterThan(0)
    expect(diagnostics.collections[0]?.logFiles).toEqual(
      expect.arrayContaining([expect.stringMatching(/^log-/)])
    )
    await db.close()
  })

  it('commits cross-collection transactions and rolls back failed transactions', async () => {
    const root = await tempRoot('transactions')
    const db = database(root)
    await db.boot()
    await db.transaction(async (tx) => {
      const user = await tx.collection('users').create({
        name: 'Owner',
        email: 'owner@example.com',
        passwordHash: 'secret'
      })
      await tx.collection('posts').create({ userId: user.id, title: 'Committed' })
    })

    await expect(
      db.transaction(async (tx) => {
        await tx.collection('users').create({
          name: 'Rollback',
          email: 'rollback@example.com',
          passwordHash: 'secret'
        })
        throw new Error('stop')
      })
    ).rejects.toThrow('stop')
    expect(await db.collection('users').findFirst({ where: { email: 'rollback@example.com' } })).toBeNull()
    await db.close()

    const reopened = database(root)
    await reopened.boot()
    expect(await reopened.collection('posts').count()).toBe(1)
    expect(await reopened.collection('users').count()).toBe(1)
    await reopened.close()
  })

  it('enforces references and onDelete restrict', async () => {
    const root = await tempRoot('refs')
    const db = database(root)
    await db.boot()
    await expect(
      db.collection('posts').create({ userId: 'missing', title: 'Invalid' })
    ).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    const user = await db.collection('users').create({
      name: 'Owner',
      email: 'ref@example.com',
      passwordHash: 'secret'
    })
    await db.collection('posts').create({ userId: user.id, title: 'Valid' })
    await expect(db.collection('users').delete(String(user.id))).rejects.toMatchObject({
      code: 'REFERENTIAL_INTEGRITY'
    })
    await db.close()
  })

  it('rejects a second writer and permits a read-only inspector', async () => {
    const root = await tempRoot('lock')
    const first = database(root)
    await first.boot()
    const second = database(root)
    await expect(second.boot()).rejects.toMatchObject({ code: 'LOCK_CONFLICT' })
    const reader = database(root, { readOnly: true })
    await reader.boot()
    expect((await reader.diagnostics()).lockStatus).toBe('not-required')
    await reader.close()
    await first.close()
  })

  it('ignores a corrupt incomplete log tail and reports recovery', async () => {
    const root = await tempRoot('tail')
    const db = database(root)
    await db.boot()
    await db.collection('users').create({
      name: 'Safe',
      email: 'safe@example.com',
      passwordHash: 'secret'
    })
    await db.close()
    const files = await readdir(join(root, 'collections', 'users'))
    const log = files.find((file) => file.startsWith('log-'))!
    await appendFile(join(root, 'collections', 'users', log), '{"v":1,"partial":')

    const reopened = database(root)
    await reopened.boot()
    expect(await reopened.collection('users').count()).toBe(1)
    expect((await reopened.diagnostics()).replayedOperations).toBeGreaterThan(0)
    await reopened.close()
  })

  it('ignores operations whose global transaction never committed', async () => {
    const root = await tempRoot('uncommitted')
    const db = database(root)
    await db.boot()
    await db.close()
    const txId = 'tx_uncommitted'
    await appendFile(
      join(root, 'journal.ndjson'),
      encodeLogRecord({
        sequence: 1,
        collection: '__journal__',
        txId,
        op: 'transaction-start',
        ts: Date.now()
      })
    )
    await appendFile(
      join(root, 'collections', 'users', 'log-000001.ndjson'),
      [
        encodeLogRecord({
          sequence: 2,
          collection: 'users',
          txId,
          op: 'transaction-start',
          ts: Date.now()
        }),
        encodeLogRecord({
          sequence: 3,
          collection: 'users',
          txId,
          op: 'insert',
          id: 'usr_uncommitted',
          data: {
            id: 'usr_uncommitted',
            name: 'Ignored',
            email: 'ignored@example.com',
            passwordHash: 'secret',
            role: 'user',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
          },
          ts: Date.now()
        }),
        encodeLogRecord({
          sequence: 4,
          collection: 'users',
          txId,
          op: 'transaction-commit',
          ts: Date.now()
        })
      ].join('')
    )
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
    expect(manifest.formatVersion).toBe(1)

    const reopened = database(root)
    await reopened.boot()
    expect(await reopened.collection('users').count()).toBe(0)
    await reopened.close()
  })

  it('rejects unindexed production filters by default and caps IN filters', async () => {
    const root = await tempRoot('strict')
    const db = createDatabase({
      path: root,
      schema,
      environment: 'production',
      query: { maxInFilterItems: 2 }
    })
    await db.boot()
    await db.collection('users').create({
      name: 'Strict',
      email: 'strict@example.com',
      passwordHash: 'secret'
    })
    await expect(
      db.collection('users').findMany({ where: { name: 'Strict' } })
    ).rejects.toMatchObject({ code: 'QUERY_NOT_INDEXED' })
    await expect(
      db.collection('users').findMany({ where: { role: { in: ['a', 'b', 'c'] } } })
    ).rejects.toMatchObject({ code: 'QUERY_LIMIT' })
    await db.close()
  })

  it('creates verified compacted snapshots and restores a safe backup', async () => {
    const root = await tempRoot('backup')
    const backup = `${root}-backup`
    roots.push(backup)
    const db = database(root)
    await db.boot()
    await db.collection('users').create({
      name: 'Backup',
      email: 'backup@example.com',
      passwordHash: 'secret'
    })
    await db.compact()
    const files = await readdir(join(root, 'collections', 'users'))
    expect(files.some((file) => file.startsWith('snapshot-'))).toBe(true)
    await db.backup(backup)
    await db.collection('users').create({
      name: 'After',
      email: 'after@example.com',
      passwordHash: 'secret'
    })
    expect(await db.collection('users').count()).toBe(2)
    await db.restore(backup)
    expect(await db.collection('users').count()).toBe(1)
    await db.close()
  })

  it('fails unsupported serverless writable boot clearly', async () => {
    const root = await tempRoot('serverless')
    const previous = process.env.VERCEL
    process.env.VERCEL = '1'
    try {
      await expect(database(root).boot()).rejects.toMatchObject({
        code: 'ENVIRONMENT_UNSUPPORTED'
      })
    } finally {
      if (previous === undefined) delete process.env.VERCEL
      else process.env.VERCEL = previous
    }
  })
})
