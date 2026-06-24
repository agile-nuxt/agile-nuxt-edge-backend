import { defineEventHandler } from 'h3'
import { clearAuthCookies, readLimitedBody, refreshTokenFromRequest } from '../../auth/http.js'
import { hashRefreshToken, type RefreshSession } from '../../auth/session.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import { assertCsrf } from '../../security/csrf.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  const body = await readLimitedBody<{ refreshToken?: string }>(event, runtime)
  if (auth.cookieMode) assertCsrf(event)
  const token = refreshTokenFromRequest(event, body)
  if (token) {
    const sessions = runtime.db.collection<RefreshSession>('edgeAuthSessions')
    const session = await sessions.findFirst({
      where: { refreshTokenHash: hashRefreshToken(token, auth.refreshTokenSecret) }
    })
    if (session && !session.revokedAt) {
      await sessions.update(session.id, { revokedAt: new Date().toISOString() })
    }
  }
  clearAuthCookies(event)
  return { ok: true }
})
