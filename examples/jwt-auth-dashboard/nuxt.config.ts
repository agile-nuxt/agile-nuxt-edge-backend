export default defineNuxtConfig({
  modules: ['@agile-nuxt/backend'],
  nitro: { preset: 'node-server' },
  backend: {
    auth: {
      enabled: true,
      accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
      refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
      cookieMode: true
    },
    db: { path: process.env.EDGE_DB_PATH || './storage/edge-db' },
    entities: {
      users: {
        fields: {
          id: 'id',
          email: 'text.unique',
          passwordHash: 'text.private',
          role: 'text.default:user',
          isActive: 'boolean.default:true',
          createdAt: 'datetime',
          updatedAt: 'datetime'
        },
        indexes: ['email', 'role'],
        unique: ['email'],
        timestamps: true,
        api: true,
        publicFields: ['id', 'email', 'role', 'isActive'],
        permissions: {
          list: ['admin'],
          read: ['admin', 'self'],
          create: ['admin'],
          update: ['admin', 'self'],
          delete: ['admin']
        }
      }
    }
  }
})
