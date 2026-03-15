import { createFileRoute, isRedirect, redirect } from '@tanstack/react-router'
import { beginLineLogin } from '../lib/session'

export const Route = createFileRoute('/auth/line/start')({
  beforeLoad: async () => {
    try {
      const result = await beginLineLogin({ data: { intendedPath: '/dashboard' } })

      if (result.mode === 'oauth') {
        throw redirect({ href: result.authorizeUrl })
      }

      throw redirect({ to: result.redirectTo })
    } catch (error) {
      if (isRedirect(error)) {
        throw error
      }

      throw redirect({
        to: '/',
        search: {
          authError:
            error instanceof Error ? error.message : 'Unable to start LINE Login right now.',
        },
      })
    }
  },
  component: AuthStartFallback,
})

function AuthStartFallback() {
  return null
}
