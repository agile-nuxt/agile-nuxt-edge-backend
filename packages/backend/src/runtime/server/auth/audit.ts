import { createHash } from 'node:crypto'

function safeContext(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !/password|token|secret|cookie/i.test(key))
      .map(([key, value]) => [
        key,
        /email|userId|ip/i.test(key) && value !== undefined
          ? `sha256:${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`
          : value
      ])
  )
}

export function authAudit(
  event: 'login_failure' | 'refresh_failure' | 'permission_denied',
  context: Record<string, unknown>
): void {
  console.warn(
    JSON.stringify({
      event: `auth.${event}`,
      level: 'warn',
      timestamp: new Date().toISOString(),
      ...safeContext(context)
    })
  )
}
