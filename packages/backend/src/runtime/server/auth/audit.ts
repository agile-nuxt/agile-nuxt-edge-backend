export function authAudit(
  event: 'login_failure' | 'refresh_failure' | 'permission_denied',
  context: Record<string, unknown>
): void {
  console.warn(
    JSON.stringify({
      event: `auth.${event}`,
      level: 'warn',
      timestamp: new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(context).filter(([key]) => !/password|token|secret|cookie/i.test(key))
      )
    })
  )
}
