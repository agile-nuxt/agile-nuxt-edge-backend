import { defineBackendConfig } from '@agile-nuxt/backend/config'

export default defineBackendConfig({
  auth: false,

  db: {
    path: process.env.EDGE_DB_PATH || './storage/edge-db',
    schemaSync: {
      enabled: true,
      runOnBoot: true,
      mode: 'safe',
      strictIndexes: false
    }
  },

  websocket: {
    enabled: true,
    allowedEntities: ['products', 'customers'],
    maxSubscriptions: 10
  },

  entities: {
    products: {
      fields: {
        id: 'id',
        title: 'text',
        price: 'integer',
        status: 'text.default:active',
        description: 'text.nullable',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['status', 'createdAt'],
      timestamps: true,
      api: true,
      permissions: {
        list: 'public',
        read: 'public',
        create: 'public',
        update: 'public',
        delete: 'public'
      }
    },

    customers: {
      fields: {
        id: 'id',
        name: 'text',
        email: 'text.unique',
        phone: 'text.nullable',
        status: 'text.default:active',
        createdAt: 'datetime',
        updatedAt: 'datetime'
      },
      indexes: ['email', 'status', 'createdAt'],
      unique: ['email'],
      timestamps: true,
      api: true,
      permissions: {
        list: 'public',
        read: 'public',
        create: 'public',
        update: 'public',
        delete: 'public'
      }
    }
  }
})
