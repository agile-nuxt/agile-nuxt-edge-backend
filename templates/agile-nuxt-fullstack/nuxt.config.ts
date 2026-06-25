export default defineNuxtConfig({
  ...(process.env.NUXT_BUILD_DIR ? { buildDir: process.env.NUXT_BUILD_DIR } : {}),
  compatibilityDate: '2026-06-24',
  experimental: {
    chromeDevtoolsProjectSettings: false
  },
  modules: ['@agile-nuxt/backend'],

  nitro: {
    preset: 'node-server'
  },

  css: ['~/assets/css/main.css'],

  backend: {
    configFile: './server/backend.config.ts'
  }
})
