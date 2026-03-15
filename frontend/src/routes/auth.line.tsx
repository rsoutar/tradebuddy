import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { completeLineLogin } from '../lib/session'

export const Route = createFileRoute('/auth/line')({
  validateSearch: (search) => ({
    code: typeof search.code === 'string' ? search.code : undefined,
    state: typeof search.state === 'string' ? search.state : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
    errorDescription:
      typeof search.error_description === 'string' ? search.error_description : undefined,
  }),
  component: LineCallbackPage,
})

function LineCallbackPage() {
  const search = Route.useSearch()
  const [message, setMessage] = useState('Confirming your LINE Login and preparing the dashboard...')

  useEffect(() => {
    let active = true

    async function finalizeLogin() {
      try {
        const result = await completeLineLogin({
          data: {
            code: search.code,
            state: search.state,
            error: search.error,
            errorDescription: search.errorDescription,
          },
        })

        if (!active) {
          return
        }

        window.location.assign(result.redirectTo)
      } catch (error) {
        const nextMessage =
          error instanceof Error ? error.message : 'LINE Login could not be completed.'

        if (!active) {
          return
        }

        setMessage(nextMessage)
        const url = new URL(window.location.origin)
        url.searchParams.set('authError', nextMessage)
        window.location.assign(url.toString())
      }
    }

    void finalizeLogin()

    return () => {
      active = false
    }
  }, [search.code, search.error, search.errorDescription, search.state])

  return (
    <div className="page auth-page">
      <section className="panel auth-panel">
        <p className="eyebrow">LINE Callback</p>
        <h2>Signing you in...</h2>
        <p className="lede">{message}</p>
      </section>
    </div>
  )
}
