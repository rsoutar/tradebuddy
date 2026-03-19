import { createFileRoute } from '@tanstack/react-router'
import { useSession } from '@tanstack/react-start/server'
import { buildBackendUrl, createProxyResponse } from '../lib/backend-proxy'
import { getSessionConfig, type SessionData } from '../lib/session'

export const Route = createFileRoute('/api/ai/conversations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await useSession<SessionData>(getSessionConfig())
        const backendResponse = await fetch(
          buildBackendUrl('/api/ai/conversations', {
            user_id: session.data.user?.userId ?? 'demo-user',
          }),
          {
            headers: {
              accept: request.headers.get('accept') ?? 'application/json',
            },
            signal: request.signal,
          },
        )

        return createProxyResponse(backendResponse)
      },
    },
  },
})
