import { getCookie, getHeader, type H3Event } from 'h3'
import { verifyAccessToken } from './jwt.js'
import type { BackendRuntime } from '../instance.js'
import type { BackendUser } from '../../types.js'

export async function getCurrentUserFromRuntime(
  event: H3Event,
  runtime: BackendRuntime
): Promise<BackendUser | null> {
  const auth = runtime.config.auth
  if (!auth) return null
  const bearer = getHeader(event, 'authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  const token = bearer ?? getCookie(event, 'edge_access')
  if (!token) return null
  try {
    const payload = verifyAccessToken(token, auth.accessTokenSecret)
    const record = await runtime.db.collection(auth.userEntity).findById(payload.sub)
    if (!record || record.isActive === false) return null
    return record as BackendUser
  } catch {
    return null
  }
}
