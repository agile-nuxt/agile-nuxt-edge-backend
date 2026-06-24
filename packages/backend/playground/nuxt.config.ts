export default defineNuxtConfig({
  modules: ['../src/module'],
  nitro: {
    preset: 'node-server'
  },
  backend: {
    auth: false,
    db: {
      path: './storage/playground-edge-db',
      environment: 'development'
    },
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
})
