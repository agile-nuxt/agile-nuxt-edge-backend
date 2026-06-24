import { defineEventHandler } from 'h3'
import { getCurrentUserFromRuntime } from '../../auth/currentUser.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  if (!runtime.config.auth) throw apiError(404, 'Auth is disabled.')
  const user = await getCurrentUserFromRuntime(event, runtime)
  if (!user) throw apiError(401, 'Authentication is required.')
  return user
})
