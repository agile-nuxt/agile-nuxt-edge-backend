import { defineEventHandler } from 'h3'
import { authAudit } from '../../auth/audit.js'
import {
  issueAuth,
  readLimitedBody,
  refreshTokenFromRequest
} from '../../auth/http.js'
import { rotateRefreshSession } from '../../auth/session.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import { assertCsrf } from '../../security/csrf.js'
import type { BackendUser } from '../../../types.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  const body = await readLimitedBody<{ refreshToken?: string }>(event, runtime)
  if (auth.cookieMode) assertCsrf(event, runtime)
  const token = refreshTokenFromRequest(event, runtime, body)
  if (!token) throw apiError(401, 'Refresh token is required.')
  try {
    const rotated = await rotateRefreshSession(
      runtime.db,
      token,
      auth.refreshTokenSecret,
      auth.refreshTokenMaxAge
    )
    const user = await runtime.db.collection(auth.userEntity).findById(rotated.userId)
    if (!user || user.isActive === false) throw new Error('User is unavailable.')
    return issueAuth(event, runtime, user as BackendUser, { token: rotated.token })
  } catch (error) {
    authAudit('refresh_failure', {
      reason: error instanceof Error ? error.message : String(error)
    })
    throw apiError(401, 'Refresh token is invalid or expired.')
  }
})
