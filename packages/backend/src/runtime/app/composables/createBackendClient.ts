import type { FindQuery, QueryResult } from '@agile-nuxt/edge-db'
import type {
  BackendConfig,
  InferBackendCreate,
  InferBackendRecord,
  InferBackendUpdate
} from '../../types.js'
import { useBackend } from './useBackend.js'

export function createBackendClient<TConfig extends BackendConfig>(
  baseURL = '/api/backend'
) {
  const api = useBackend(baseURL)
  return {
    entity<TEntity extends Extract<keyof TConfig['entities'], string>>(entity: TEntity) {
      type RecordType = InferBackendRecord<TConfig, TEntity>
      return {
        list: (query: FindQuery<RecordType> = {}) =>
          api<QueryResult<RecordType>>(`/${entity}/query`, {
            method: 'POST',
            body: query
          }),
        read: (id: string) => api<RecordType>(`/${entity}/${id}`),
        create: (data: InferBackendCreate<TConfig, TEntity>) =>
          api<RecordType>(`/${entity}`, { method: 'POST', body: data }),
        update: (id: string, patch: InferBackendUpdate<TConfig, TEntity>) =>
          api<RecordType>(`/${entity}/${id}`, {
            method: 'PATCH',
            body: patch
          }),
        remove: (id: string) =>
          api<{ ok: true }>(`/${entity}/${id}`, { method: 'DELETE' }),
        restore: (id: string) =>
          api<RecordType>(`/${entity}/${id}/restore`, { method: 'POST' })
      }
    }
  }
}
