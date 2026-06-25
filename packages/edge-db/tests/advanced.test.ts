import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDatabase,
  defineSchema,
  verifyBackup,
  type DatabaseChangeEvent,
  type DatabaseCoordinator,
  type DatabaseLease,
  type DatabaseLeaseRequest
} from '../src/index.js'

const roots: string[] = []

async function tempRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `edge-db-advanced-${name}-`))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const baseSchema = defineSchema({
  records: {
    fields: {
      id: 'id',
      value: 'text',
      createdAt: 'datetime',
      updatedAt: 'datetime'
    },
    indexes: ['value'],
    timestamps: true
  }
})

class SharedCoordinator implements DatabaseCoordinator {
  readonly name = 'test-distributed-lease'
  private owner: string | undefined
  private readonly listeners = new Set<(event: DatabaseChangeEvent) => void | Promise<void>>()

  async acquireWriterLease(request: DatabaseLeaseRequest): Promise<DatabaseLease> {
    if (this.owner) throw new Error(`Lease is held by ${this.owner}.`)
    this.owner = request.ownerId
    let active = true
    return {
      id: request.ownerId,
      assertOwned: () => {
        if (!active || this.owner !== request.ownerId) throw new Error('Lease lost.')
      },
      release: () => {
        active = false
        if (this.owner === request.ownerId) this.owner = undefined
      }
    }
  }

  async publish(event: DatabaseChangeEvent): Promise<void> {
    await Promise.all([...this.listeners].map((listener) => listener(event)))
  }

  subscribe(
    _path: string,
    listener: (event: DatabaseChangeEvent) => void | Promise<void>
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

describe('advanced durability and coordination', () => {
  it('repairs an incomplete tail before appending subsequent writes', async () => {
    const root = await tempRoot('repair')
    const db = createDatabase({ path: root, schema: baseSchema, environment: 'test' })
    await db.boot()
    await db.collection('records').create({ value: 'first' })
    await db.close()

    const logPath = join(root, 'collections', 'records', 'log-000001.ndjson')
    await appendFile(logPath, '{"partial":')
    const reopened = createDatabase({ path: root, schema: baseSchema, environment: 'test' })
    await reopened.boot()
    expect((await reopened.diagnostics()).repairedTailBytes).toBeGreaterThan(0)
    await reopened.collection('records').create({ value: 'second' })
    await reopened.close()

    const final = createDatabase({ path: root, schema: baseSchema, environment: 'test' })
    await final.boot()
    expect(await final.collection('records').count()).toBe(2)
    await final.close()
  })

  it('detects tampering through the backup checksum inventory', async () => {
    const root = await tempRoot('backup')
    const backup = `${root}-backup`
    roots.push(backup)
    const db = createDatabase({ path: root, schema: baseSchema, environment: 'test' })
    await db.boot()
    await db.collection('records').create({ value: 'safe' })
    await db.backup(backup)
    await db.close()

    const schemaPath = join(backup, 'collections', 'records', 'schema.json')
    await writeFile(schemaPath, `${(await readFile(schemaPath, 'utf8')).trim()}\n `)
    await expect(verifyBackup(backup)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })

  it('plans and applies explicit required-field migrations', async () => {
    const root = await tempRoot('migration')
    const initial = defineSchema({
      profiles: {
        fields: { id: 'id', name: 'text' }
      }
    })
    const first = createDatabase({ path: root, schema: initial, environment: 'test' })
    await first.boot()
    await first.collection('profiles').create({ name: 'Ada' })
    await first.close()

    const desired = defineSchema({
      profiles: {
        fields: { id: 'id', name: 'text', slug: 'text' },
        indexes: ['slug']
      }
    })
    const withoutMigration = createDatabase({
      path: root,
      schema: desired,
      environment: 'test'
    })
    const plan = await withoutMigration.planSchemaChanges()
    expect(plan.requiresMigration).toBe(true)
    await expect(withoutMigration.boot()).rejects.toMatchObject({
      code: 'MIGRATION_REQUIRED'
    })

    const migrated = createDatabase({
      path: root,
      schema: desired,
      environment: 'test',
      schemaSync: {
        migrations: {
          profiles: (record) => ({
            ...record,
            slug: String(record.name).toLocaleLowerCase()
          })
        }
      }
    })
    await migrated.boot()
    expect(await migrated.collection('profiles').findFirst({ where: { slug: 'ada' } }))
      .toMatchObject({ name: 'Ada', slug: 'ada' })
    await migrated.close()
  })

  it('resolves bounded declared relations without arbitrary joins', async () => {
    const root = await tempRoot('includes')
    const schema = defineSchema({
      users: {
        fields: { id: 'id', name: 'text' }
      },
      posts: {
        fields: {
          id: 'id',
          userId: 'text',
          title: 'text'
        },
        indexes: ['userId'],
        relations: {
          author: {
            type: 'belongsTo',
            collection: 'users',
            localField: 'userId'
          }
        }
      }
    })
    const db = createDatabase({ path: root, schema, environment: 'test' })
    await db.boot()
    const user = await db.collection('users').create({ name: 'Owner' })
    await db.collection('posts').create({ userId: user.id, title: 'Post' })
    const post = await db.collection('posts').findFirst({
      include: { author: { select: ['id', 'name'] } }
    })
    expect((post as Record<string, unknown> | null)?.author).toMatchObject({
      id: user.id,
      name: 'Owner'
    })
    await db.close()
  })

  it('supports an external writer lease and coordinated read-only refresh', async () => {
    const root = await tempRoot('coordination')
    const coordinator = new SharedCoordinator()
    const writer = createDatabase({
      path: root,
      schema: baseSchema,
      environment: 'test',
      coordination: { adapter: coordinator, ownerId: 'writer-a' }
    })
    await writer.boot()
    const competing = createDatabase({
      path: root,
      schema: baseSchema,
      environment: 'test',
      coordination: { adapter: coordinator, ownerId: 'writer-b' }
    })
    await expect(competing.boot()).rejects.toThrow('Lease is held')

    const reader = createDatabase({
      path: root,
      schema: baseSchema,
      environment: 'test',
      readOnly: true,
      coordination: {
        adapter: coordinator,
        ownerId: 'reader',
        autoRefreshReadOnly: true
      }
    })
    await reader.boot()
    await writer.collection('records').create({ value: 'published' })
    expect(await reader.collection('records').count()).toBe(1)
    expect((await writer.diagnostics()).coordination.adapter).toBe('test-distributed-lease')
    await reader.close()
    await writer.close()
  })

  for (const [stage, expected] of [
    ['journal-start', 0],
    ['collection-append', 0],
    ['journal-commit', 1],
    ['manifest-write', 1]
  ] as const) {
    it(`recovers after a process crash at ${stage}`, async () => {
      const root = await tempRoot(`crash-${stage}`)
      const initial = createDatabase({ path: root, schema: baseSchema, environment: 'test' })
      await initial.boot()
      await initial.close()
      const result = spawnSync(
        join(process.cwd(), '../../node_modules/.bin/tsx'),
        [join(process.cwd(), 'tests/fixtures/crash-worker.ts'), root, stage],
        { encoding: 'utf8' }
      )
      expect(result.signal === 'SIGKILL' || result.status === 137).toBe(true)

      const recovered = createDatabase({
        path: root,
        schema: baseSchema,
        environment: 'test'
      })
      await recovered.boot()
      expect(await recovered.collection('records').count()).toBe(expected)
      await recovered.collection('records').create({ value: 'after-recovery' })
      expect(await recovered.collection('records').count()).toBe(expected + 1)
      await recovered.close()
    })
  }
})
