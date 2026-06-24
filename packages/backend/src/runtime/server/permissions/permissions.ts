import { apiError } from '../errors/apiError.js'
import type {
  BackendAction,
  BackendEntity,
  BackendUser,
  PermissionRule
} from '../../types.js'
import { authAudit } from '../auth/audit.js'

function deny(
  statusCode: 401 | 403,
  message: string,
  entityName: string,
  action: BackendAction,
  user: BackendUser | null
): never {
  authAudit('permission_denied', {
    entity: entityName,
    action,
    userId: user?.id,
    role: user?.role,
    statusCode
  })
  throw apiError(statusCode, message)
}

export async function assertPermission(
  entityName: string,
  entity: BackendEntity,
  action: BackendAction,
  user: BackendUser | null,
  record?: Record<string, unknown>
): Promise<void> {
  const rule: PermissionRule = entity.permissions?.[action] ?? 'disabled'
  if (rule === 'disabled') {
    deny(403, `Action "${action}" is disabled for "${entityName}".`, entityName, action, user)
  }
  if (rule === 'public') return
  if (!user) deny(401, 'Authentication is required.', entityName, action, user)
  if (rule === 'self') {
    if (record && (record.id === user.id || record.userId === user.id)) return
    deny(403, 'This action is limited to the record owner.', entityName, action, user)
  }
  if (Array.isArray(rule)) {
    if (user.role && rule.includes(user.role)) return
    if (rule.includes('self') && record && (record.id === user.id || record.userId === user.id)) return
    deny(403, 'Your role cannot perform this action.', entityName, action, user)
  }
  if (typeof rule === 'function') {
    if (await rule({ user, entity: entityName, action, ...(record ? { record } : {}) })) return
    deny(403, 'Permission policy denied this action.', entityName, action, user)
  }
  deny(403, 'Permission denied.', entityName, action, user)
}
