import type { H3Event, EventHandler, EventHandlerRequest } from 'h3'
import { defineEventHandler } from 'h3'
import { apiError } from './errors/apiError.js'
import { getCurrentUserFromRuntime } from './auth/currentUser.js'
import { getBackendRuntime } from './instance.js'
import { assertPermission } from './permissions/permissions.js'
import type { BackendAction, BackendUser } from '../types.js'
import type { BackendRealtimeEvent } from '../types.js'

export async function useBackendDb() {
  return (await getBackendRuntime()).db
}

export async function publishBackendEvent(event: BackendRealtimeEvent): Promise<void> {
  await (await getBackendRuntime()).realtime.publish(event)
}

export async function getCurrentUser(event: H3Event): Promise<BackendUser | null> {
  return getCurrentUserFromRuntime(event, await getBackendRuntime())
}

export async function requireAuth(event: H3Event): Promise<BackendUser> {
  const user = await getCurrentUser(event)
  if (!user) throw apiError(401, 'Authentication is required.')
  return user
}

export async function requirePermission(
  event: H3Event,
  entityName: string,
  action: BackendAction,
  record?: Record<string, unknown>
): Promise<void> {
  const runtime = await getBackendRuntime()
  const entity = runtime.service.getEntity(entityName)
  const user = await getCurrentUserFromRuntime(event, runtime)
  await assertPermission(entityName, entity, action, user, record)
}

export function defineBackendHandler<T extends EventHandlerRequest, D>(
  handler: EventHandler<T, D>
): EventHandler<T, D> {
  return defineEventHandler(handler)
}
