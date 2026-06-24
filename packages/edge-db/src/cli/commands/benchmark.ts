import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../../core/createDatabase.js'
import { defineSchema } from '../../schema/defineSchema.js'

export async function benchmark(): Promise<unknown> {
  const root = await mkdtemp(join(tmpdir(), 'edge-db-benchmark-'))
  const schema = defineSchema({
    records: {
      fields: {
        id: 'id',
        indexed: 'text',
        scanned: 'text',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['indexed'],
      timestamps: true
    }
  })
  const db = createDatabase({
    path: root,
    schema,
    environment: 'test',
    snapshots: { everyOperations: 20_000 },
    query: { allowUnindexedQueries: true, maxLimit: 10_000 }
  })
  await db.boot()
  try {
    const collection = db.collection('records')
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      indexed: `group-${index % 10}`,
      scanned: `value-${index}`
    }))
    const insertStarted = performance.now()
    await collection.createMany(rows)
    const insertMs = performance.now() - insertStarted
    const indexedStarted = performance.now()
    await collection.findMany({ where: { indexed: 'group-5' }, limit: 100 })
    const indexedLookupMs = performance.now() - indexedStarted
    const scanStarted = performance.now()
    await collection.findMany({ where: { scanned: 'value-500' }, limit: 1 })
    const scanMs = performance.now() - scanStarted
    return {
      note: 'Local benchmark output; do not publish these values as universal claims.',
      records: 1_000,
      insertMs,
      indexedLookupMs,
      nonIndexedScanMs: scanMs
    }
  } finally {
    await db.close()
    await rm(root, { recursive: true, force: true })
  }
}
