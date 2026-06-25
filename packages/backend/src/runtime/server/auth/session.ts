import { createHash, randomBytes } from 'node:crypto'
import type { Collection, Database } from '@agile-nuxt/edge-db'
import { durationMs } from './jwt.js'

export interface RefreshSession {
  [key: string]: unknown
  id: string
  userId: string
  familyId: string
  refreshTokenHash: string
  replacedByHash: string | null
  expiresAt: string
  revokedAt: string | null
  reuseDetectedAt: string | null
  createdAt: string
  updatedAt: string
}

export function hashRefreshToken(token: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

function newRefreshToken(): string {
  return randomBytes(48).toString('base64url')
}

export async function createRefreshSession(
  sessions: Collection<RefreshSession>,
  userId: string,
  secret: string,
  maxAge?: string | number,
  familyId = randomBytes(18).toString('base64url')
): Promise<{ token: string; session: RefreshSession }> {
  const token = newRefreshToken()
  const session = await sessions.create({
    userId,
    familyId,
    refreshTokenHash: hashRefreshToken(token, secret),
    replacedByHash: null,
    expiresAt: new Date(Date.now() + durationMs(maxAge, 30 * 86_400_000)).toISOString(),
    revokedAt: null,
    reuseDetectedAt: null
  })
  return { token, session }
}

async function revokeFamily(
  sessions: Collection<RefreshSession>,
  familyId: string,
  reuseDetected: boolean
): Promise<void> {
  const now = new Date().toISOString()
  let cursor: string | undefined
  do {
    const family = await sessions.findMany({
      where: { familyId },
      withDeleted: true,
      ...(cursor ? { cursor } : {})
    })
    for (const session of family.data) {
      await sessions.update(session.id, {
        revokedAt: session.revokedAt ?? now,
        ...(reuseDetected ? { reuseDetectedAt: now } : {})
      })
    }
    cursor = family.nextCursor
  } while (cursor)
}

export async function rotateRefreshSession(
  db: Database,
  token: string,
  secret: string,
  maxAge?: string | number
): Promise<{ userId: string; token: string; familyId: string }> {
  const tokenHash = hashRefreshToken(token, secret)
  const nextToken = newRefreshToken()
  const nextHash = hashRefreshToken(nextToken, secret)
  const result = await db.transaction(async (tx) => {
    const sessions = tx.collection<RefreshSession>('edgeAuthSessions')
    const existing = await sessions.findFirstInternal({
      where: { refreshTokenHash: tokenHash }
    })
    if (!existing || new Date(existing.expiresAt).getTime() <= Date.now()) {
      throw new Error('Refresh token is invalid or expired.')
    }
    if (existing.revokedAt) {
      await revokeFamily(sessions, existing.familyId, true)
      return {
        reused: true as const,
        userId: existing.userId,
        familyId: existing.familyId
      }
    }

    const now = new Date().toISOString()
    await sessions.update(existing.id, {
      revokedAt: now,
      replacedByHash: nextHash
    })
    await sessions.create({
      userId: existing.userId,
      familyId: existing.familyId,
      refreshTokenHash: nextHash,
      replacedByHash: null,
      expiresAt: new Date(Date.now() + durationMs(maxAge, 30 * 86_400_000)).toISOString(),
      revokedAt: null,
      reuseDetectedAt: null
    })
    return {
      reused: false as const,
      userId: existing.userId,
      token: nextToken,
      familyId: existing.familyId
    }
  })
  if (result.reused) {
    throw new Error('Refresh token reuse detected; the session family was revoked.')
  }
  return result
}

export async function revokeRefreshFamily(
  db: Database,
  familyId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await revokeFamily(tx.collection<RefreshSession>('edgeAuthSessions'), familyId, false)
  })
}

export async function revokeAllUserSessions(db: Database, userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const sessions = tx.collection<RefreshSession>('edgeAuthSessions')
    const now = new Date().toISOString()
    let revoked = 0
    let cursor: string | undefined
    do {
      const active = await sessions.findMany({
        where: { userId },
        withDeleted: true,
        ...(cursor ? { cursor } : {})
      })
      for (const session of active.data) {
        if (session.revokedAt) continue
        await sessions.update(session.id, { revokedAt: now })
        revoked += 1
      }
      cursor = active.nextCursor
    } while (cursor)
    return revoked
  })
}
