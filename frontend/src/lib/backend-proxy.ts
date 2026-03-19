import { getBackendApiBaseUrl } from './session'

const PASSTHROUGH_HEADERS = ['content-type', 'cache-control'] as const

export function buildBackendUrl(
  pathname: string,
  searchParams?: Record<string, string | undefined>,
) {
  const url = new URL(pathname, getBackendApiBaseUrl())

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) {
        url.searchParams.set(key, value)
      }
    }
  }

  return url
}

export function createProxyResponse(response: Response) {
  const headers = new Headers()

  for (const headerName of PASSTHROUGH_HEADERS) {
    const headerValue = response.headers.get(headerName)
    if (headerValue) {
      headers.set(headerName, headerValue)
    }
  }

  if (
    response.headers.get('content-type')?.includes('text/event-stream') &&
    !headers.has('cache-control')
  ) {
    headers.set('cache-control', 'no-cache, no-transform')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
