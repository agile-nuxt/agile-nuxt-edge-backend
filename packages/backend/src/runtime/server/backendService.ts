import type { Database, FindQuery, IncludeQuery } from '@agile-nuxt/edge-db'
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
    const { include, ...baseQuery } = query
    const result = await this.db.collection(entityName).findMany({
      ...baseQuery
    })
    const data = include
      ? await this.resolveIncludes(entityName, entity, result.data, include, user)
      : result.data.map((record: Record<string, unknown>) => sanitizeOutput(entity, record))
    return { ...result, data }
  }

  private async resolveIncludes(
    entityName: string,
    entity: BackendEntity,
    records: Record<string, unknown>[],
    include: IncludeQuery,
    user: BackendUser | null
  ): Promise<Record<string, unknown>[]> {
    const allowed = new Set(entity.includes ?? [])
    for (const relationName of Object.keys(include)) {
      if (!allowed.has(relationName)) {
        throw apiError(400, `Include "${entityName}.${relationName}" is not exposed.`)
      }
    }

    return Promise.all(
      records.map(async (record) => {
        const output = sanitizeOutput(entity, record)
        for (const [relationName, options] of Object.entries(include)) {
          const relation = entity.relations?.[relationName]
          if (!relation) throw apiError(400, `Unknown relation "${entityName}.${relationName}".`)
          const target = this.getEntity(relation.collection)
          const targetCollection = this.db.collection(relation.collection)
          const foreignField = relation.foreignField ?? 'id'
          const localValue = record[relation.localField]
          const selected = options === true ? undefined : options.select
          const limit = options === true ? undefined : options.limit

          if (relation.type === 'belongsTo') {
            const related = await targetCollection.findFirstInternal({
              where: { [foreignField]: localValue }
            })
            output[relationName] =
              related && (await this.canReadIncluded(relation.collection, target, related, user))
                ? this.selectIncluded(target, related, selected)
                : null
          } else {
            const related = await targetCollection.findMany({
              where: { [foreignField]: localValue },
              ...(limit ? { limit } : {})
            })
            const visible: Record<string, unknown>[] = []
            for (const candidate of related.data) {
              const internal =
                (await targetCollection.findByIdInternal(String(candidate.id))) ?? candidate
              if (
                await this.canReadIncluded(
                  relation.collection,
                  target,
                  internal,
                  user
                )
              ) {
                visible.push(this.selectIncluded(target, internal, selected))
              }
            }
            output[relationName] = visible
          }
        }
        return output
      })
    )
  }

  private async canReadIncluded(
    entityName: string,
    entity: BackendEntity,
    record: Record<string, unknown>,
    user: BackendUser | null
  ): Promise<boolean> {
    try {
      await assertPermission(entityName, entity, 'read', user, record)
      return true
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 401 || statusCode === 403) return false
      throw error
    }
  }

  private selectIncluded(
    entity: BackendEntity,
    record: Record<string, unknown>,
    select?: string[]
  ): Record<string, unknown> {
    const sanitized = sanitizeOutput(entity, record)
    if (!select) return sanitized
    for (const field of select) {
      if (!(field in entity.fields)) throw apiError(400, `Unknown included field "${field}".`)
      if (!(field in sanitized)) {
        throw apiError(400, `Included field "${field}" is not publicly readable.`)
      }
    }
    return Object.fromEntries(select.map((field) => [field, sanitized[field]]))
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
