import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBackendRuntime } from '../src/runtime/server/factory.js'
import { BackendService } from '../src/runtime/server/backendService.js'
import { hashPassword, verifyPassword } from '../src/runtime/server/auth/password.js'
import {
  signAccessToken,
  verifyAccessToken
} from '../src/runtime/server/auth/jwt.js'
import {
  createRefreshSession,
  hashRefreshToken,
  rotateRefreshSession,
  type RefreshSession
} from '../src/runtime/server/auth/session.js'
import { RateLimiter } from '../src/runtime/server/security/rateLimit.js'
import {
  parseQueryJson,
  validateFindQueryShape
} from '../src/runtime/server/security/query.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function runtime() {
  const path = await mkdtemp(join(tmpdir(), 'backend-test-'))
  roots.push(path)
  return createBackendRuntime({
    auth: {
      enabled: true,
      accessTokenSecret: 'a'.repeat(48),
      refreshTokenSecret: 'b'.repeat(48),
      cookieMode: true
    },
    db: {
      path,
      environment: 'test',
      query: { allowUnindexedQueries: true }
    },
    entities: {
      users: {
        fields: {
          id: 'id',
          email: 'text.unique',
          passwordHash: 'text.private',
          role: 'text.default:user',
          isActive: 'boolean.default:true',
          createdAt: 'datetime',
          updatedAt: 'datetime'
        },
        indexes: ['email', 'role'],
        unique: ['email'],
        timestamps: true,
        api: true,
        publicFields: ['id', 'email', 'role', 'isActive'],
        permissions: {
          list: ['admin'],
          read: ['admin', 'self'],
          create: ['admin'],
          update: ['admin', 'self'],
          delete: ['admin']
        }
      },
      products: {
        fields: {
          id: 'id',
          title: 'text',
          status: 'text.default:active',
          ownerId: 'text.nullable',
          internalNote: 'text.private',
          createdAt: 'datetime',
          updatedAt: 'datetime'
        },
        indexes: ['status', 'ownerId'],
        timestamps: true,
        api: true,
        includes: ['owner'],
        relations: {
          owner: {
            type: 'belongsTo',
            collection: 'users',
            localField: 'ownerId'
          }
        },
        permissions: {
          list: 'public',
          read: 'public',
          create: 'disabled',
          update: ['admin'],
          delete: ['admin']
        }
      }
    }
  })
}

describe('backend security', () => {
  it('hashes passwords and signs expiring access tokens with strong secrets', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toContain('correct horse')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('wrong password', hash)).toBe(false)
    const token = signAccessToken({ id: 'usr_1', role: 'admin' }, 's'.repeat(48), '15m')
    expect(verifyAccessToken(token, 's'.repeat(48))).toMatchObject({
      sub: 'usr_1',
      role: 'admin',
      type: 'access'
    })
    expect(() => signAccessToken({ id: 'usr_1' }, 'short')).toThrow('32 bytes')
  })

  it('stores hashed refresh tokens and invalidates the old token on rotation', async () => {
    const app = await runtime()
    try {
      const user = await app.db.collection('users').create({
        email: 'refresh@example.com',
        passwordHash: await hashPassword('long enough password')
      })
      const sessions = app.db.collection<RefreshSession>('edgeAuthSessions')
      const created = await createRefreshSession(sessions, String(user.id), 'r'.repeat(48), '30d')
      const raw = await sessions.findByIdInternal(created.session.id)
      expect(raw?.refreshTokenHash).toBe(hashRefreshToken(created.token, 'r'.repeat(48)))
      expect(raw?.refreshTokenHash).not.toBe(created.token)
      const rotated = await rotateRefreshSession(app.db, created.token, 'r'.repeat(48))
      await expect(
        rotateRefreshSession(app.db, created.token, 'r'.repeat(48))
      ).rejects.toThrow('reuse detected')
      const family = await sessions.findMany({ where: { familyId: rotated.familyId } })
      expect(family.data.every((session) => Boolean(session.revokedAt))).toBe(true)
      expect(family.data.some((session) => Boolean(session.reuseDetectedAt))).toBe(true)
    } finally {
      await app.db.close()
    }
  })

  it('defaults writes to disabled and enforces roles, private fields, and public output', async () => {
    const app = await runtime()
    try {
      const service: BackendService = app.service
      await expect(
        service.create('products', { title: 'Denied', internalNote: 'secret' }, null)
      ).rejects.toMatchObject({ statusCode: 403 })
      const product = await app.db.collection('products').create({
        title: 'Visible',
        internalNote: 'hidden'
      })
      const listed = (await service.list('products', { where: { status: 'active' } }, null)) as {
        data: Record<string, unknown>[]
      }
      expect(listed.data[0]).not.toHaveProperty('internalNote')
      await expect(
        service.update('products', String(product.id), { internalNote: 'leak' }, {
          id: 'admin',
          role: 'admin'
        })
      ).rejects.toMatchObject({ statusCode: 400 })
      await expect(service.list('users', {}, null)).rejects.toMatchObject({ statusCode: 401 })
    } finally {
      await app.db.close()
    }
  })

  it('rate limits repeated keys', async () => {
    const limiter = new RateLimiter(2, 60_000)
    await limiter.assertAllowed('ip')
    await limiter.assertAllowed('ip')
    await expect(limiter.assertAllowed('ip')).rejects.toThrow()
  })

  it('rejects malformed and unknown query shapes', () => {
    expect(() => parseQueryJson('{broken', 'where')).toThrow()
    expect(() => validateFindQueryShape({ offset: 10 })).toThrow()
    expect(() => validateFindQueryShape({ include: { owner: { nested: true } } })).toThrow()
    expect(validateFindQueryShape({ where: { status: 'active' }, limit: 10 })).toEqual({
      where: { status: 'active' },
      limit: 10
    })
  })

  it('applies target permissions and public fields to relation includes', async () => {
    const app = await runtime()
    try {
      const owner = await app.db.collection('users').create({
        email: 'owner@example.com',
        passwordHash: await hashPassword('long enough password')
      })
      await app.db.collection('products').create({
        title: 'Related',
        ownerId: owner.id,
        internalNote: 'hidden'
      })
      const anonymous = (await app.service.list(
        'products',
        { include: { owner: true } },
        null
      )) as { data: Array<Record<string, unknown>> }
      expect(anonymous.data[0]?.owner).toBeNull()

      const admin = (await app.service.list(
        'products',
        { include: { owner: true } },
        { id: 'admin', role: 'admin' }
      )) as { data: Array<Record<string, unknown>> }
      expect(admin.data[0]?.owner).toMatchObject({
        id: owner.id,
        email: 'owner@example.com'
      })
      expect(admin.data[0]?.owner).not.toHaveProperty('passwordHash')
    } finally {
      await app.db.close()
    }
  })
})
