import { randomBytes } from 'node:crypto'
import {
  deleteCookie,
  getCookie,
  readBody,
  setCookie,
  type H3Event
} from 'h3'
import type { BackendRuntime } from '../instance.js'
import type { BackendUser } from '../../types.js'
import { apiError } from '../errors/apiError.js'
import { assertBodySize, assertParsedBodySize } from '../security/bodyLimit.js'
import { durationMs, signAccessToken } from './jwt.js'
import { createRefreshSession, type RefreshSession } from './session.js'

export async function readLimitedBody<T>(event: H3Event, runtime: BackendRuntime): Promise<T> {
  const limit = runtime.config.security?.maxBodySize ?? runtime.db.config.maxBodySize
  assertBodySize(event, limit)
  const body = await readBody<T>(event)
  assertParsedBodySize(body, limit)
  return body
}

export function refreshTokenFromRequest(
  event: H3Event,
  body?: { refreshToken?: string }
): string | undefined {
  return getCookie(event, 'edge_refresh') ?? body?.refreshToken
}

export async function issueAuth(
  event: H3Event,
  runtime: BackendRuntime,
  user: BackendUser
): Promise<Record<string, unknown>> {
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  const accessToken = signAccessToken(user, auth.accessTokenSecret, auth.accessTokenMaxAge)
  const sessions = runtime.db.collection<RefreshSession>('edgeAuthSessions')
  const refresh = await createRefreshSession(
    sessions,
    user.id,
    auth.refreshTokenSecret,
    auth.refreshTokenMaxAge
  )
  if (auth.cookieMode) {
    const cookieBase = {
      httpOnly: true,
      secure: auth.cookieSecure,
      sameSite: 'strict' as const,
      path: '/'
    }
    setCookie(event, 'edge_access', accessToken, {
      ...cookieBase,
      maxAge: Math.floor(durationMs(auth.accessTokenMaxAge, 900_000) / 1_000)
    })
    setCookie(event, 'edge_refresh', refresh.token, {
      ...cookieBase,
      maxAge: Math.floor(durationMs(auth.refreshTokenMaxAge, 30 * 86_400_000) / 1_000)
    })
    const csrfToken = randomBytes(24).toString('base64url')
    setCookie(event, 'edge_csrf', csrfToken, {
      httpOnly: false,
      secure: auth.cookieSecure,
      sameSite: 'strict',
      path: '/'
    })
    return { user }
  }
  return { user, accessToken, refreshToken: refresh.token }
}

export function clearAuthCookies(event: H3Event): void {
  for (const name of ['edge_access', 'edge_refresh', 'edge_csrf']) {
    deleteCookie(event, name, { path: '/' })
  }
}
