import { useState } from 'nuxt/app'
import { $fetch } from 'ofetch'
import { useBackend } from './useBackend.js'
import type { BackendUser } from '../../types.js'

export function useBackendAuth(baseURL = '/api/auth') {
  const user = useState<BackendUser | null>('agile-backend-user', () => null)
  const api = useBackend(baseURL)
  return {
    user,
    async register(input: Record<string, unknown> & { email: string; password: string }) {
      const result = await api<{ user: BackendUser }>('/register', { method: 'POST', body: input })
      user.value = result.user
      return result
    },
    async login(input: { email: string; password: string }) {
      const result = await api<{ user: BackendUser }>('/login', { method: 'POST', body: input })
      user.value = result.user
      return result
    },
    async refresh(refreshToken?: string) {
      const result = await api<{ user: BackendUser }>('/refresh', {
        method: 'POST',
        body: refreshToken ? { refreshToken } : {}
      })
      user.value = result.user
      return result
    },
    async me() {
      user.value = await $fetch<BackendUser>(`${baseURL}/me`, { credentials: 'include' })
      return user.value
    },
    async logout(refreshToken?: string) {
      await api('/logout', {
        method: 'POST',
        body: refreshToken ? { refreshToken } : {}
      })
      user.value = null
    }
  }
}
