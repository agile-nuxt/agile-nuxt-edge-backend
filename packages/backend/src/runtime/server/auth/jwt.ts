import { createHmac, timingSafeEqual } from 'node:crypto'

interface TokenPayload {
  sub: string
  type: 'access'
  iat: number
  exp: number
  role?: string
  email?: string
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function durationToSeconds(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return value
  if (!value) return fallback
  const match = /^(\d+)(s|m|h|d)$/.exec(value)
  if (!match) throw new Error(`Invalid token duration "${value}".`)
  const amount = Number(match[1])
  return amount * ({ s: 1, m: 60, h: 3_600, d: 86_400 }[match[2]!] ?? 1)
}

export function assertStrongSecret(secret: string, name: string): void {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error(`${name} must contain at least 32 bytes.`)
  }
}

export function signAccessToken(
  user: { id: string; role?: string; email?: string },
  secret: string,
  maxAge?: string | number
): string {
  assertStrongSecret(secret, 'accessTokenSecret')
  const now = Math.floor(Date.now() / 1_000)
  const payload: TokenPayload = {
    sub: user.id,
    type: 'access',
    iat: now,
    exp: now + durationToSeconds(maxAge, 900),
    ...(user.role ? { role: user.role } : {}),
    ...(user.email ? { email: user.email } : {})
  }
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode(payload)
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifyAccessToken(token: string, secret: string): TokenPayload {
  assertStrongSecret(secret, 'accessTokenSecret')
  const [header, body, signature] = token.split('.')
  if (!header || !body || !signature) throw new Error('Malformed access token.')
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid access token signature.')
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
  if (payload.type !== 'access' || payload.exp <= Math.floor(Date.now() / 1_000)) {
    throw new Error('Access token has expired.')
  }
  return payload
}

export function durationMs(value: string | number | undefined, fallback: number): number {
  return durationToSeconds(value, fallback / 1_000) * 1_000
}
