export default defineNuxtConfig({
  modules: ['@agile-nuxt/backend'],
  nitro: { preset: 'node-server' },
  backend: {
    auth: false,
    db: { path: './storage/edge-db' },
    entities: {
      contacts: {
        fields: {
          id: 'id',
          name: 'text',
          email: 'text.unique',
          status: 'text.default:lead',
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
          create: 'disabled',
          update: 'disabled',
          delete: 'disabled'
        }
      }
    }
  }
})
