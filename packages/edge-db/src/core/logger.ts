export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEvent {
  event: string
  level: LogLevel
  message: string
  timestamp: string
  [key: string]: unknown
}

export type Logger = (event: LogEvent) => void

const SECRET_KEYS = /password|secret|token|authorization|cookie/i

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[REDACTED]' : redact(item)])
    )
  }
  return value
}

export function createLogger(logger?: Logger, debug = false): Logger {
  return (input) => {
    if (input.level === 'debug' && !debug) {
      return
    }
    const event = redact(input) as LogEvent
    if (logger) {
      logger(event)
      return
    }
    const output = JSON.stringify(event)
    if (event.level === 'error') {
      console.error(output)
    } else if (event.level === 'warn') {
      console.warn(output)
    } else if (debug) {
      console.info(output)
    }
  }
}

export function logEvent(
  logger: Logger,
  level: LogLevel,
  event: string,
  message: string,
  context: Record<string, unknown> = {}
): void {
  logger({
    ...context,
    event,
    level,
    message,
    timestamp: new Date().toISOString()
  })
}
