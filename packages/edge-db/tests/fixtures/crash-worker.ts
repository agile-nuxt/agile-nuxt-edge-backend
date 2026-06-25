import { createDatabase, defineSchema } from '../../src/index.js'

const [, , path, stage] = process.argv
if (!path || !stage) throw new Error('Expected database path and crash stage.')

const schema = defineSchema({
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

const db = createDatabase(
  {
    path,
    schema,
    environment: 'test'
  },
  {
    onStorageStage(current) {
      if (current === stage) process.kill(process.pid, 'SIGKILL')
    }
  }
)

await db.boot()
await db.collection('records').create({ value: stage })
await db.close()
