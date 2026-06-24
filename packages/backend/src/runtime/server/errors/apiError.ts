import { createError } from 'h3'

export function apiError(
  statusCode: number,
  statusMessage: string,
  data?: Record<string, unknown>
): ReturnType<typeof createError> {
  return createError({
    statusCode,
    statusMessage,
    ...(process.env.NODE_ENV !== 'production' && data ? { data } : {})
  })
}
