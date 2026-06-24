export default defineNuxtConfig({
  modules: ['@agile-nuxt/backend'],
  nitro: { preset: 'node-server' },
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
})
