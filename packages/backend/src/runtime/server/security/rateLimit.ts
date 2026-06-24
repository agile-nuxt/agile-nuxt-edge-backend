import { apiError } from '../errors/apiError.js'

interface Bucket {
  count: number
  resetAt: number
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  assertAllowed(key: string): void {
    const now = Date.now()
    const current = this.buckets.get(key)
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs })
      return
    }
    current.count += 1
    if (current.count > this.maxRequests) {
      throw apiError(429, 'Too many requests.', { retryAfterMs: current.resetAt - now })
    }
  }
}
