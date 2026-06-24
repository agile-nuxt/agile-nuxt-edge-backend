export default defineNuxtConfig({
  modules: ['@agile-nuxt/backend'],
  nitro: { preset: 'node-server' },
  backend: {
    auth: false,
    db: { path: './storage/edge-db' },
    entities: {
      appointments: {
        fields: {
          id: 'id',
          clientId: 'text',
          staffId: 'text',
          date: 'text',
          time: 'text',
          status: 'text.default:pending',
          createdAt: 'datetime',
          updatedAt: 'datetime'
        },
        indexes: ['clientId', 'staffId', 'status', ['staffId', 'date', 'time']],
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
