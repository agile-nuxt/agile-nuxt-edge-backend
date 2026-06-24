import {
  defineEventHandler,
  getMethod,
  getRequestIP,
  getRequestURL,
  readBody,
  type H3Event
} from 'h3'
import type { FindQuery } from '@agile-nuxt/edge-db'
import { getCurrentUserFromRuntime } from '../../auth/currentUser.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import { assertBodySize, assertParsedBodySize } from '../../security/bodyLimit.js'
import { assertCsrf } from '../../security/csrf.js'

async function body(event: H3Event, limit: number): Promise<Record<string, unknown>> {
  assertBodySize(event, limit)
  const value = await readBody<Record<string, unknown>>(event)
  assertParsedBodySize(value, limit)
  return value ?? {}
}

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const method = getMethod(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  runtime.rateLimiter.assertAllowed(`${ip}:${method}`)
  if (runtime.config.auth && runtime.config.auth.cookieMode && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    assertCsrf(event)
  }
  const maxBodySize = runtime.config.security?.maxBodySize ?? runtime.db.config.maxBodySize
  const requestPath = getRequestURL(event).pathname
  const path = requestPath
    .slice(runtime.config.routePrefix.length)
    .split('/')
    .filter(Boolean)
  const [entity, second, third] = path
  if (!entity) throw apiError(404, 'Entity not found.')
  const user = await getCurrentUserFromRuntime(event, runtime)

  if (method === 'GET' && !second) {
    const query = event.node.req.url ? new URL(event.node.req.url, 'http://localhost').searchParams : undefined
    const parsed: FindQuery = {
      ...(query?.get('where') ? { where: JSON.parse(query.get('where')!) } : {}),
      ...(query?.get('orderBy') ? { orderBy: JSON.parse(query.get('orderBy')!) } : {}),
      ...(query?.get('limit') ? { limit: Number(query.get('limit')) } : {}),
      ...(query?.get('cursor') ? { cursor: query.get('cursor')! } : {})
    }
    return runtime.service.list(entity, parsed, user)
  }
  if (method === 'POST' && second === 'query') {
    return runtime.service.list(entity, (await body(event, maxBodySize)) as FindQuery, user)
  }
  if (method === 'POST' && !second) {
    return runtime.service.create(entity, await body(event, maxBodySize), user)
  }
  if (method === 'GET' && second) {
    return runtime.service.read(entity, second, user)
  }
  if (method === 'PATCH' && second) {
    return runtime.service.update(entity, second, await body(event, maxBodySize), user)
  }
  if (method === 'DELETE' && second) {
    await runtime.service.remove(entity, second, user)
    return { ok: true }
  }
  if (method === 'POST' && second && third === 'restore') {
    return runtime.service.restore(entity, second, user)
  }
  throw apiError(405, 'Method not allowed.')
})
