import { defineWebSocketHandler } from 'h3'
import { getUserFromAccessToken } from '../../auth/currentUser.js'
import { authCookieNames } from '../../auth/http.js'
import { getBackendRuntime } from '../../instance.js'
import { assertPermission } from '../../permissions/permissions.js'
import type { BackendRealtimeEvent, BackendUser } from '../../../types.js'

interface PeerContext {
  user: BackendUser | null
  subscriptions: Set<string>
  unsubscribe?: () => void
}

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

function send(peer: { send(data: unknown): unknown }, value: unknown): void {
  peer.send(JSON.stringify(value))
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const runtime = await getBackendRuntime()
    if (runtime.config.websocket === false || runtime.config.websocket?.enabled === false) {
      return new Response('WebSocket support is disabled.', { status: 404 })
    }
    const origin = request.headers.get('origin')
    const allowedOrigins = runtime.config.websocket?.allowedOrigins
    if (origin) {
      const requestUrl = new URL(request.url)
      const protocol =
        requestUrl.protocol === 'wss:'
          ? 'https:'
          : requestUrl.protocol === 'ws:'
            ? 'http:'
            : requestUrl.protocol
      const sameOrigin = origin === `${protocol}//${requestUrl.host}`
      if (!(allowedOrigins?.includes(origin) || (!allowedOrigins && sameOrigin))) {
        return new Response('WebSocket origin is not allowed.', { status: 403 })
      }
    }

    const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    const cookieToken = cookieValue(
      request.headers.get('cookie'),
      authCookieNames(runtime).access
    )
    const user = await getUserFromAccessToken(bearer ?? cookieToken, runtime)
    const authRequired =
      runtime.config.websocket?.authRequired ?? Boolean(runtime.config.auth)
    if (authRequired && !user) {
      return new Response('Authentication is required.', { status: 401 })
    }
    request.context.user = user
    request.context.subscriptions = new Set<string>()
  },

  async open(peer) {
    const runtime = await getBackendRuntime()
    const context = peer.context as unknown as PeerContext
    context.unsubscribe = runtime.realtime.subscribe((event: BackendRealtimeEvent) => {
      if (context.subscriptions.has(event.entity)) send(peer, event)
    })
    send(peer, {
      type: 'ready',
      authenticated: Boolean(context.user)
    })
  },

  async message(peer, message) {
    const runtime = await getBackendRuntime()
    const context = peer.context as unknown as PeerContext
    const websocket = runtime.config.websocket
    const raw = message.text()
    if (Buffer.byteLength(raw) > 65_536) {
      send(peer, { type: 'error', code: 'MESSAGE_TOO_LARGE' })
      return
    }
    let command: { type?: string; entity?: string }
    try {
      command = JSON.parse(raw) as { type?: string; entity?: string }
    } catch {
      send(peer, { type: 'error', code: 'INVALID_JSON' })
      return
    }
    if (command.type === 'ping') {
      send(peer, { type: 'pong', timestamp: new Date().toISOString() })
      return
    }
    if (!command.entity || !['subscribe', 'unsubscribe'].includes(command.type ?? '')) {
      send(peer, { type: 'error', code: 'INVALID_COMMAND' })
      return
    }
    if (command.type === 'unsubscribe') {
      context.subscriptions.delete(command.entity)
      send(peer, { type: 'unsubscribed', entity: command.entity })
      return
    }

    const allowedEntities =
      websocket && typeof websocket === 'object'
        ? websocket.allowedEntities
        : undefined
    if (allowedEntities && !allowedEntities.includes(command.entity)) {
      send(peer, { type: 'error', code: 'ENTITY_NOT_ALLOWED' })
      return
    }
    const maxSubscriptions =
      websocket && typeof websocket === 'object'
        ? websocket.maxSubscriptions ?? 20
        : 20
    if (
      !context.subscriptions.has(command.entity) &&
      context.subscriptions.size >= maxSubscriptions
    ) {
      send(peer, { type: 'error', code: 'SUBSCRIPTION_LIMIT' })
      return
    }
    try {
      const entity = runtime.service.getEntity(command.entity)
      await assertPermission(command.entity, entity, 'list', context.user)
      context.subscriptions.add(command.entity)
      send(peer, { type: 'subscribed', entity: command.entity })
    } catch (error) {
      send(peer, {
        type: 'error',
        code: 'SUBSCRIPTION_DENIED',
        message: error instanceof Error ? error.message : 'Subscription denied.'
      })
    }
  },

  close(peer) {
    const context = peer.context as unknown as PeerContext
    context.unsubscribe?.()
    context.subscriptions.clear()
  }
})
