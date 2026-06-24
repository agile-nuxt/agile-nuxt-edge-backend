import { defineEventHandler, getRequestIP } from 'h3'
import { authAudit } from '../../auth/audit.js'
import { issueAuth, readLimitedBody } from '../../auth/http.js'
import { verifyPassword } from '../../auth/password.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import type { BackendUser } from '../../../types.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  runtime.loginRateLimiter.assertAllowed(`login:${ip}`)
  const body = await readLimitedBody<{ email?: string; password?: string }>(event, runtime)
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw apiError(400, 'Email and password are required.')
  }
  const user = await runtime.db.collection(auth.userEntity).findFirstInternal({
    where: { email: body.email.trim().toLocaleLowerCase() }
  })
  if (
    !user ||
    typeof user.passwordHash !== 'string' ||
    !(await verifyPassword(body.password, user.passwordHash)) ||
    user.isActive === false
  ) {
    authAudit('login_failure', { ip, email: body.email.trim().toLocaleLowerCase() })
    throw apiError(401, 'Invalid email or password.')
  }
  return issueAuth(event, runtime, user as BackendUser)
})
