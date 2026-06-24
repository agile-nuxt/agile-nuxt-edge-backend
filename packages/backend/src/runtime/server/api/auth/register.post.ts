import { defineEventHandler, getRequestIP } from 'h3'
import { hashPassword } from '../../auth/password.js'
import { issueAuth, readLimitedBody } from '../../auth/http.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import type { BackendUser } from '../../../types.js'

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  if (!auth.allowRegistration) throw apiError(403, 'Registration is disabled.')
  runtime.loginRateLimiter.assertAllowed(`register:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`)
  const body = await readLimitedBody<Record<string, unknown> & { email?: string; password?: string }>(
    event,
    runtime
  )
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw apiError(400, 'Email and password are required.')
  }
  const { password, ...profile } = body
  const user = await runtime.db.collection(auth.userEntity).create({
    ...profile,
    email: body.email.trim().toLocaleLowerCase(),
    passwordHash: await hashPassword(password)
  })
  return issueAuth(event, runtime, user as BackendUser)
})
