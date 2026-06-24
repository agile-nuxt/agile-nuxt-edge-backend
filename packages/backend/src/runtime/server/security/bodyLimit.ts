import { getHeader, type H3Event } from 'h3'
import { apiError } from '../errors/apiError.js'

export function assertBodySize(event: H3Event, maxBodySize: number): void {
  const length = Number(getHeader(event, 'content-length') ?? 0)
  if (Number.isFinite(length) && length > maxBodySize) {
    throw apiError(413, `Request body exceeds ${maxBodySize} bytes.`)
  }
}

export function assertParsedBodySize(body: unknown, maxBodySize: number): void {
  if (Buffer.byteLength(JSON.stringify(body ?? null)) > maxBodySize) {
    throw apiError(413, `Request body exceeds ${maxBodySize} bytes.`)
  }
}
