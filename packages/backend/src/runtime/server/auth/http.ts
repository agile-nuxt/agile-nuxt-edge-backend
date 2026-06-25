import { randomBytes } from 'node:crypto'
import {
  deleteCookie,
  getCookie,
  setCookie,
  type H3Event
} from 'h3'
import type { BackendRuntime } from '../instance.js'
import type { BackendUser } from '../../types.js'
import { apiError } from '../errors/apiError.js'
import { readLimitedJsonBody } from '../security/bodyLimit.js'
import { durationMs, signAccessToken } from './jwt.js'
import { createRefreshSession, type RefreshSession } from './session.js'

export async function readLimitedBody<T>(event: H3Event, runtime: BackendRuntime): Promise<T> {
  const limit = runtime.config.security?.maxBodySize ?? runtime.db.config.maxBodySize
  return readLimitedJsonBody<T>(event, limit)
}

export function authCookieNames(runtime: BackendRuntime): {
  access: string
  refresh: string
  csrf: string
} {
  const names = runtime.config.auth ? runtime.config.auth.cookieNames : undefined
  return {
    access: names?.access ?? 'edge_access',
    refresh: names?.refresh ?? 'edge_refresh',
    csrf: names?.csrf ?? 'edge_csrf'
  }
}

export function refreshTokenFromRequest(
  event: H3Event,
  runtime: BackendRuntime,
  body?: { refreshToken?: string }
): string | undefined {
  return getCookie(event, authCookieNames(runtime).refresh) ?? body?.refreshToken
}

export async function issueAuth(
  event: H3Event,
  runtime: BackendRuntime,
  user: BackendUser,
  existingRefresh?: { token: string }
): Promise<Record<string, unknown>> {
  const auth = runtime.config.auth
  if (!auth) throw apiError(404, 'Auth is disabled.')
  const accessToken = signAccessToken(user, auth.accessTokenSecret, auth.accessTokenMaxAge)
  const refresh =
    existingRefresh ??
    (await createRefreshSession(
      runtime.db.collection<RefreshSession>('edgeAuthSessions'),
      user.id,
      auth.refreshTokenSecret,
      auth.refreshTokenMaxAge
    ))
  if (auth.cookieMode) {
    const names = authCookieNames(runtime)
    const cookieBase = {
      httpOnly: true,
      secure: auth.cookieSecure,
      sameSite: 'strict' as const,
      path: auth.cookiePath ?? '/',
      ...(auth.cookieDomain ? { domain: auth.cookieDomain } : {})
    }
    setCookie(event, names.access, accessToken, {
      ...cookieBase,
      maxAge: Math.floor(durationMs(auth.accessTokenMaxAge, 900_000) / 1_000)
    })
    setCookie(event, names.refresh, refresh.token, {
      ...cookieBase,
      maxAge: Math.floor(durationMs(auth.refreshTokenMaxAge, 30 * 86_400_000) / 1_000)
    })
    const csrfToken = randomBytes(24).toString('base64url')
    setCookie(event, names.csrf, csrfToken, {
      httpOnly: false,
      secure: auth.cookieSecure,
      sameSite: 'strict',
      path: auth.cookiePath ?? '/',
      ...(auth.cookieDomain ? { domain: auth.cookieDomain } : {})
    })
    return { user }
  }
  return { user, accessToken, refreshToken: refresh.token }
}

export function clearAuthCookies(event: H3Event, runtime?: BackendRuntime): void {
  const names = runtime
    ? Object.values(authCookieNames(runtime))
    : ['edge_access', 'edge_refresh', 'edge_csrf']
  const auth = runtime?.config.auth
  for (const name of names) {
    deleteCookie(event, name, {
      path: auth ? auth.cookiePath ?? '/' : '/',
      ...(auth && auth.cookieDomain ? { domain: auth.cookieDomain } : {})
    })
  }
}
