export default defineNuxtConfig({
  ...(process.env.NUXT_BUILD_DIR ? { buildDir: process.env.NUXT_BUILD_DIR } : {}),
  compatibilityDate: '2026-06-24',
  modules: ['@agile-nuxt/backend'],

  nitro: {
    preset: 'node-server'
  },

  css: ['~/assets/css/main.css'],

  backend: {
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

    /*
     * To enable JWT auth, replace `auth: false` with:
     *
     * auth: {
     *   enabled: true,
     *   strategy: 'jwt',
     *   userEntity: 'users',
     *   accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
     *   refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
     *   accessTokenMaxAge: '15m',
     *   refreshTokenMaxAge: '30d'
     * }
     *
     * Then add a users entity with email, passwordHash, role, and isActive fields.
     */
  }
})
