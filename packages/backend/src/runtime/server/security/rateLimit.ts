import { setHeader, type H3Event } from 'h3'
import type {
  RateLimitAdapter,
  RateLimitConsumeOptions,
  RateLimitDecision
} from '../../types.js'
import { apiError } from '../errors/apiError.js'

interface Bucket {
  count: number
  resetAt: number
}

export class InMemoryRateLimitAdapter implements RateLimitAdapter {
  readonly name = 'memory'
  private readonly buckets = new Map<string, Bucket>()
  private operations = 0

  constructor(private readonly maxBuckets = 10_000) {}

  consume(key: string, options: RateLimitConsumeOptions): RateLimitDecision {
    const now = Date.now()
    this.operations += 1
    if (this.operations % 100 === 0 || this.buckets.size >= this.maxBuckets) {
      this.prune(now)
    }
    if (this.buckets.size >= this.maxBuckets && !this.buckets.has(key)) {
      const oldest = this.buckets.keys().next().value as string | undefined
      if (oldest) this.buckets.delete(oldest)
    }

    const current = this.buckets.get(key)
    if (!current || current.resetAt <= now) {
      const resetAt = now + options.windowMs
      this.buckets.set(key, { count: 1, resetAt })
      return {
        allowed: true,
        remaining: Math.max(0, options.maxRequests - 1),
        resetAt
      }
    }
    current.count += 1
    return {
      allowed: current.count <= options.maxRequests,
      remaining: Math.max(0, options.maxRequests - current.count),
      resetAt: current.resetAt
    }
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }

  get size(): number {
    return this.buckets.size
  }
}

export class RateLimiter {
  readonly adapter: RateLimitAdapter

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    adapter?: RateLimitAdapter,
    maxBuckets?: number
  ) {
    this.adapter = adapter ?? new InMemoryRateLimitAdapter(maxBuckets)
  }

  async consume(key: string): Promise<RateLimitDecision> {
    return this.adapter.consume(key, {
      maxRequests: this.maxRequests,
      windowMs: this.windowMs
    })
  }

  async assertAllowed(key: string, event?: H3Event): Promise<RateLimitDecision> {
    const decision = await this.consume(key)
    if (event) {
      setHeader(event, 'X-RateLimit-Remaining', String(decision.remaining))
      setHeader(event, 'X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1_000)))
    }
    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1_000))
      if (event) setHeader(event, 'Retry-After', retryAfterSeconds)
      throw apiError(429, 'Too many requests.', {
        retryAfterMs: Math.max(0, decision.resetAt - Date.now())
      })
    }
    return decision
  }
}
