import { createFileRoute } from '@tanstack/react-router'
import { useSession } from '@tanstack/react-start/server'
import { buildBackendUrl, createProxyResponse } from '../lib/backend-proxy'
import { getSessionConfig, type SessionData } from '../lib/session'

type ChatRequestBody = {
  message?: string
  conversation_id?: string | null
}

export const Route = createFileRoute('/api/ai/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = (await request.json()) as ChatRequestBody
        const message = payload.message?.trim()

        if (!message) {
          return new Response(JSON.stringify({ detail: 'message is required' }), {
            status: 400,
            headers: {
              'content-type': 'application/json; charset=utf-8',
            },
          })
        }

        const session = await useSession<SessionData>(getSessionConfig())
        const backendResponse = await fetch(buildBackendUrl('/api/ai/chat'), {
          method: 'POST',
          headers: {
            accept: request.headers.get('accept') ?? 'text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message,
            conversation_id: payload.conversation_id ?? null,
            user_id: session.data.user?.userId ?? 'demo-user',
          }),
          signal: request.signal,
        })

        return createProxyResponse(backendResponse)
      },
    },
  },
})
