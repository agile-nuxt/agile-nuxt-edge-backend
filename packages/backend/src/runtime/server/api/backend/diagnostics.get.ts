import { defineEventHandler } from 'h3'
import { getCurrentUserFromRuntime } from '../../auth/currentUser.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  if (!runtime.config.security?.diagnosticsEndpoint) throw apiError(404, 'Not found.')
  const user = await getCurrentUserFromRuntime(event, runtime)
  if (runtime.config.auth && user?.role !== 'admin') {
    throw apiError(403, 'Diagnostics require the admin role.')
  }
  return runtime.db.diagnostics()
})
