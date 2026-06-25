import {
  defineEventHandler,
  getMethod,
  getRequestIP,
  getRequestURL,
  type H3Event
} from 'h3'
import type { FindQuery } from '@agile-nuxt/edge-db'
import { getCurrentUserFromRuntime } from '../../auth/currentUser.js'
import { apiError } from '../../errors/apiError.js'
import { getBackendRuntime } from '../../instance.js'
import { readLimitedJsonBody } from '../../security/bodyLimit.js'
import { assertCsrf } from '../../security/csrf.js'
import { parseQueryJson, validateFindQueryShape } from '../../security/query.js'

async function body(event: H3Event, limit: number): Promise<Record<string, unknown>> {
  return readLimitedJsonBody<Record<string, unknown>>(event, limit)
}

export default defineEventHandler(async (event) => {
  const runtime = await getBackendRuntime()
  const method = getMethod(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  await runtime.rateLimiter.assertAllowed(`${ip}:${method}`, event)
  if (runtime.config.auth && runtime.config.auth.cookieMode && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    assertCsrf(event, runtime)
  }
  const maxBodySize = runtime.config.security?.maxBodySize ?? runtime.db.config.maxBodySize
  const requestPath = getRequestURL(event).pathname
  const rawUrl = event.node.req.url ?? requestPath
  const maxQueryStringSize = runtime.config.security?.maxQueryStringSize ?? 8_192
  if (Buffer.byteLength(rawUrl) > maxQueryStringSize) {
    throw apiError(414, `Request URL exceeds ${maxQueryStringSize} bytes.`)
  }
  const path = requestPath
    .slice(runtime.config.routePrefix.length)
    .split('/')
    .filter(Boolean)
  const [entity, second, third] = path
  if (!entity) throw apiError(404, 'Entity not found.')
  const user = await getCurrentUserFromRuntime(event, runtime)

  if (method === 'GET' && !second) {
    const query = event.node.req.url ? new URL(event.node.req.url, 'http://localhost').searchParams : undefined
    const parsed: FindQuery = validateFindQueryShape({
      ...(query?.get('where') ? { where: parseQueryJson(query.get('where'), 'where') } : {}),
      ...(query?.get('orderBy')
        ? { orderBy: parseQueryJson(query.get('orderBy'), 'orderBy') }
        : {}),
      ...(query?.get('limit') ? { limit: Number(query.get('limit')) } : {}),
      ...(query?.get('cursor') ? { cursor: query.get('cursor')! } : {})
    })
    return runtime.service.list(entity, parsed, user)
  }
  if (method === 'POST' && second === 'query') {
    return runtime.service.list(
      entity,
      validateFindQueryShape(await body(event, maxBodySize)),
      user
    )
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
