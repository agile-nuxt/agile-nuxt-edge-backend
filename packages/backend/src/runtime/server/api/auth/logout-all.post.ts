import { defineEventHandler } from 'h3'
import { clearAuthCookies } from '../../auth/http.js'
import { getCurrentUserFromRuntime } from '../../auth/currentUser.js'
import { revokeAllUserSessions } from '../../auth/session.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import { assertCsrf } from '../../security/csrf.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  if (auth.cookieMode) assertCsrf(event, runtime)
  const user = await getCurrentUserFromRuntime(event, runtime)
  if (!user) throw apiError(401, 'Authentication is required.')
  const revoked = await revokeAllUserSessions(runtime.db, user.id)
  clearAuthCookies(event, runtime)
  return { ok: true, revoked }
})
