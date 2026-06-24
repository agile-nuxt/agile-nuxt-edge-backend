import { $fetch } from 'ofetch'

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('edge_csrf='))
    ?.split('=')[1]
}

export function useBackend(baseURL = '/api/backend') {
  return $fetch.create({
    baseURL,
    credentials: 'include',
    onRequest({ options }) {
      const csrf = csrfToken()
      if (csrf) {
        const headers = new Headers(options.headers)
        headers.set('x-csrf-token', decodeURIComponent(csrf))
        options.headers = headers
      }
    }
  })
}
