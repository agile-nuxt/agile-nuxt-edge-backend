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

export async function readLimitedJsonBody<T>(
  event: H3Event,
  maxBodySize: number
): Promise<T> {
  assertBodySize(event, maxBodySize)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of event.node.req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBodySize) {
      throw apiError(413, `Request body exceeds ${maxBodySize} bytes.`)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {} as T
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw apiError(400, 'Request body must contain valid JSON.')
  }
}
