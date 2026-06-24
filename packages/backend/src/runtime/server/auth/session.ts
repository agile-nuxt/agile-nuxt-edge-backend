import { createHash, randomBytes } from 'node:crypto'
import type { Collection } from '@agile-nuxt/edge-db'
import { durationMs } from './jwt.js'

export interface RefreshSession {
  [key: string]: unknown
  id: string
  userId: string
  refreshTokenHash: string
  expiresAt: string
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export function hashRefreshToken(token: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

export async function createRefreshSession(
  sessions: Collection<RefreshSession>,
  userId: string,
  secret: string,
  maxAge?: string | number
): Promise<{ token: string; session: RefreshSession }> {
  const token = randomBytes(48).toString('base64url')
  const session = await sessions.create({
    userId,
    refreshTokenHash: hashRefreshToken(token, secret),
    expiresAt: new Date(Date.now() + durationMs(maxAge, 30 * 86_400_000)).toISOString(),
    revokedAt: null
  })
  return { token, session }
}

export async function rotateRefreshSession(
  sessions: Collection<RefreshSession>,
  token: string,
  secret: string
): Promise<{ userId: string }> {
  const existing = await sessions.findFirst({
    where: { refreshTokenHash: hashRefreshToken(token, secret) }
  })
  if (!existing || existing.revokedAt || new Date(existing.expiresAt).getTime() <= Date.now()) {
    throw new Error('Refresh token is invalid or expired.')
  }
  await sessions.update(existing.id, { revokedAt: new Date().toISOString() })
  return { userId: existing.userId }
}
