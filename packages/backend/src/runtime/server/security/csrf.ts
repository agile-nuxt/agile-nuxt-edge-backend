import { getCookie, getHeader, type H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import { apiError } from '../errors/apiError.js'

export function assertCsrf(event: H3Event): void {
  const cookie = getCookie(event, 'edge_csrf')
  const header = getHeader(event, 'x-csrf-token')
  if (!cookie || !header) throw apiError(403, 'CSRF token is required.')
  const a = Buffer.from(cookie)
  const b = Buffer.from(header)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw apiError(403, 'CSRF token is invalid.')
  }
}
