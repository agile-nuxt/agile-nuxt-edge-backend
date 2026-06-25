import { getCookie, getHeader, type H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import { apiError } from '../errors/apiError.js'
import type { BackendRuntime } from '../factory.js'
import { authCookieNames } from '../auth/http.js'

export function assertCsrf(event: H3Event, runtime?: BackendRuntime): void {
  const cookie = getCookie(event, runtime ? authCookieNames(runtime).csrf : 'edge_csrf')
  const header = getHeader(event, 'x-csrf-token')
  if (!cookie || !header) throw apiError(403, 'CSRF token is required.')
  const a = Buffer.from(cookie)
  const b = Buffer.from(header)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw apiError(403, 'CSRF token is invalid.')
  }
}
