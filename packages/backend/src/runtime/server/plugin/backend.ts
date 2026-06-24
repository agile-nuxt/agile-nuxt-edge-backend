import { defineNitroPlugin } from 'nitropack/runtime'
import { closeBackendRuntime, getBackendRuntime } from '../instance.js'

export default defineNitroPlugin(async (nitroApp) => {
  await getBackendRuntime()
  nitroApp.hooks.hook('close', closeBackendRuntime)
})
