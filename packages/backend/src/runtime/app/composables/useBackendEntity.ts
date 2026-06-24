import type { FindQuery, QueryResult } from '@agile-nuxt/edge-db'
import { useBackend } from './useBackend.js'

export function useBackendEntity<TRecord extends Record<string, unknown> = Record<string, unknown>>(
  entity: string,
  baseURL = '/api/backend'
) {
  const api = useBackend(baseURL)
  return {
    list: (query: FindQuery = {}) =>
      api<QueryResult<TRecord>>(`/${entity}/query`, { method: 'POST', body: query }),
    read: (id: string) => api<TRecord>(`/${entity}/${id}`),
    create: (data: Partial<TRecord>) =>
      api<TRecord>(`/${entity}`, { method: 'POST', body: data }),
    update: (id: string, patch: Partial<TRecord>) =>
      api<TRecord>(`/${entity}/${id}`, { method: 'PATCH', body: patch }),
    remove: (id: string) => api<{ ok: true }>(`/${entity}/${id}`, { method: 'DELETE' }),
    restore: (id: string) => api<TRecord>(`/${entity}/${id}/restore`, { method: 'POST' })
  }
}
