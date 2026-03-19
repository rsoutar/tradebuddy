import { createFileRoute } from '@tanstack/react-router'
import { buildBackendUrl, createProxyResponse } from '../lib/backend-proxy'

export const Route = createFileRoute('/api/ai/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url)
        const conversationId = requestUrl.searchParams.get('conversation_id')?.trim()

        if (!conversationId) {
          return new Response(JSON.stringify({ detail: 'conversation_id is required' }), {
            status: 400,
            headers: {
              'content-type': 'application/json; charset=utf-8',
            },
          })
        }

        const backendResponse = await fetch(
          buildBackendUrl('/api/ai/history', {
            conversation_id: conversationId,
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
