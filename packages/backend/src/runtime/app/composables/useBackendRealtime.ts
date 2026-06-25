import { useState } from 'nuxt/app'
import type { BackendRealtimeEvent } from '../../types.js'

type RealtimeMessage =
  | BackendRealtimeEvent
  | { type: string; entity?: string; code?: string; message?: string }

export function useBackendRealtime(path = '/api/backend/ws') {
  const connected = useState('agile-backend-ws-connected', () => false)
  const lastEvent = useState<RealtimeMessage | null>('agile-backend-ws-event', () => null)
  const listeners = new Set<(event: RealtimeMessage) => void>()
  let socket: WebSocket | undefined

  function connect(): WebSocket {
    if (typeof window === 'undefined') {
      throw new Error('WebSocket connections can only be opened in the browser.')
    }
    if (socket && socket.readyState <= WebSocket.OPEN) return socket
    const url = new URL(path, window.location.href)
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(url)
    socket.addEventListener('open', () => {
      connected.value = true
    })
    socket.addEventListener('close', () => {
      connected.value = false
      socket = undefined
    })
    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as RealtimeMessage
        lastEvent.value = parsed
        listeners.forEach((listener) => listener(parsed))
      } catch {
        // Ignore non-JSON server frames.
      }
    })
    return socket
  }

  function send(command: Record<string, unknown>): void {
    const active = connect()
    const payload = JSON.stringify(command)
    if (active.readyState === WebSocket.OPEN) active.send(payload)
    else active.addEventListener('open', () => active.send(payload), { once: true })
  }

  return {
    connected,
    lastEvent,
    connect,
    subscribe(entity: string) {
      send({ type: 'subscribe', entity })
    },
    unsubscribe(entity: string) {
      send({ type: 'unsubscribe', entity })
    },
    onEvent(listener: (event: RealtimeMessage) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      socket?.close(1000, 'Client closed.')
      socket = undefined
      connected.value = false
    }
  }
}
