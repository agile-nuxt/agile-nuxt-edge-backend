import type { Database, FindQuery } from '@agile-nuxt/edge-db'
import { apiError } from './errors/apiError.js'
import { assertPermission } from './permissions/permissions.js'
import { sanitizeOutput, sanitizeWrite } from './security/fieldSecurity.js'
import type {
  BackendAction,
  BackendEntity,
  BackendUser,
  ResolvedBackendConfig
} from '../types.js'

export class BackendService {
  constructor(
    readonly db: Database,
    readonly config: ResolvedBackendConfig
  ) {}

  getEntity(name: string): BackendEntity {
    const entity = this.config.entities[name]
    if (!entity?.api) throw apiError(404, 'Entity not found.')
    return entity
  }

  private async recordForAction(
    entityName: string,
    id: string,
    action: BackendAction,
    user: BackendUser | null
  ): Promise<{ entity: BackendEntity; record: Record<string, unknown> }> {
    const entity = this.getEntity(entityName)
    const record = await this.db.collection(entityName).findById(id, { withDeleted: action === 'restore' })
    if (!record) throw apiError(404, 'Record not found.')
    await assertPermission(entityName, entity, action, user, record)
    return { entity, record }
  }

  async list(
    entityName: string,
    query: FindQuery,
    user: BackendUser | null
  ): Promise<unknown> {
    const entity = this.getEntity(entityName)
    await assertPermission(entityName, entity, 'list', user)
    const result = await this.db.collection(entityName).findMany({
      ...query,
      ...(entity.publicFields ? { select: entity.publicFields } : {})
    })
    return { ...result, data: result.data.map((record) => sanitizeOutput(entity, record)) }
  }

  async read(entityName: string, id: string, user: BackendUser | null): Promise<unknown> {
    const { entity, record } = await this.recordForAction(entityName, id, 'read', user)
    return sanitizeOutput(entity, record)
  }

  async create(
    entityName: string,
    input: Record<string, unknown>,
    user: BackendUser | null
  ): Promise<unknown> {
    const entity = this.getEntity(entityName)
    await assertPermission(entityName, entity, 'create', user)
    let data = sanitizeWrite(entityName, entity, input)
    if (entity.hooks?.beforeCreate) data = await entity.hooks.beforeCreate({ user, data })
    const record = await this.db.collection(entityName).create(data)
    await entity.hooks?.afterCreate?.({ user, record })
    return sanitizeOutput(entity, record)
  }

  async update(
    entityName: string,
    id: string,
    input: Record<string, unknown>,
    user: BackendUser | null
  ): Promise<unknown> {
    const { entity, record } = await this.recordForAction(entityName, id, 'update', user)
    let patch = sanitizeWrite(entityName, entity, input)
    if (entity.hooks?.beforeUpdate) {
      patch = await entity.hooks.beforeUpdate({ user, record, patch })
    }
    const updated = await this.db.collection(entityName).update(id, patch)
    await entity.hooks?.afterUpdate?.({ user, record: updated })
    return sanitizeOutput(entity, updated)
  }

  async remove(entityName: string, id: string, user: BackendUser | null): Promise<void> {
    const { entity, record } = await this.recordForAction(entityName, id, 'delete', user)
    await entity.hooks?.beforeDelete?.({ user, record })
    await this.db.collection(entityName).delete(id)
    await entity.hooks?.afterDelete?.({ user, record })
  }

  async restore(entityName: string, id: string, user: BackendUser | null): Promise<unknown> {
    const { entity } = await this.recordForAction(entityName, id, 'restore', user)
    const record = await this.db.collection(entityName).restore(id)
    return sanitizeOutput(entity, record)
  }
}
