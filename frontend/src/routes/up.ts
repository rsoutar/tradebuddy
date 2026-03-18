import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/up')({
  server: {
    handlers: {
      GET: async () =>
        new Response('ok', {
          status: 200,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'no-store',
          },
        }),
    },
  },
})
