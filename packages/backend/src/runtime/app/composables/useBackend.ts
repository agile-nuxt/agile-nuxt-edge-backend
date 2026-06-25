import { $fetch } from 'ofetch'

function csrfToken(cookieName: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${cookieName}=`))
    ?.split('=')[1]
}

export function useBackend(baseURL = '/api/backend', csrfCookieName = 'edge_csrf') {
  return $fetch.create({
    baseURL,
    credentials: 'include',
    onRequest({ options }) {
      const csrf = csrfToken(csrfCookieName)
      if (csrf) {
        const headers = new Headers(options.headers)
        headers.set('x-csrf-token', decodeURIComponent(csrf))
        options.headers = headers
      }
    }
  })
}
