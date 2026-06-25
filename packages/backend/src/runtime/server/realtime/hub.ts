import type {
  BackendRealtimeAdapter,
  BackendRealtimeEvent
} from '../../types.js'

export type RealtimeListener = (
  event: BackendRealtimeEvent
) => void | Promise<void>

export class BackendRealtimeHub {
  private readonly listeners = new Set<RealtimeListener>()
  private unsubscribeAdapter: (() => void | Promise<void>) | undefined

  constructor(private readonly adapter?: BackendRealtimeAdapter) {}

  async start(): Promise<void> {
    if (!this.adapter) return
    const unsubscribe = await this.adapter.subscribe((event) => this.dispatch(event))
    if (unsubscribe) this.unsubscribeAdapter = unsubscribe
  }

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async publish(event: BackendRealtimeEvent): Promise<void> {
    const results = await Promise.allSettled([
      this.dispatch(event),
      ...(this.adapter ? [Promise.resolve(this.adapter.publish(event))] : [])
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn(
          JSON.stringify({
            event: 'realtime.publish_failure',
            level: 'warn',
            timestamp: new Date().toISOString(),
            adapter: this.adapter?.name ?? 'local',
            reason:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
          })
        )
      }
    }
  }

  private async dispatch(event: BackendRealtimeEvent): Promise<void> {
    await Promise.allSettled([...this.listeners].map((listener) => listener(event)))
  }

  async close(): Promise<void> {
    await this.unsubscribeAdapter?.()
    this.unsubscribeAdapter = undefined
    this.listeners.clear()
  }
}
