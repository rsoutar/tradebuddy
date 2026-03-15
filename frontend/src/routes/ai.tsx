import { Icon } from '@iconify/react'
import { createFileRoute } from '@tanstack/react-router'
import { MarketConnectionBadge } from '../components/market-connection-badge'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getConnectionStatus } from '../lib/session'
import { Route as RootRoute } from './__root'

const prompts = [
  'Summarize the current BTC volatility regime for paper-trading decisions.',
  'Recommend spread settings for the grid bot when the range is widening.',
  'Compare the latest backtest against the active paper bot and flag risk drift.',
]

export const Route = createFileRoute('/ai')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  loader: () => getConnectionStatus(),
  component: AIPage,
})

function AIPage() {
  const viewer = RootRoute.useLoaderData()
  const connection = Route.useLoaderData()

  return (
    <ProtectedShell
      activeNavId="ai"
      viewer={viewer.user!}
      header={({ openMenu }) => (
        <>
          <div className="flex items-center gap-4">
            <ProtectedMenuButton onClick={openMenu} />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Research</p>
              <h1 className="text-lg font-medium tracking-tight text-zinc-100">AI analyst desk</h1>
            </div>
          </div>
          <MarketConnectionBadge connection={connection.connection} market={connection.market} />
        </>
      )}
    >
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Workflow</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight text-zinc-100">
          Use AI as a strategy analyst, not a replacement for the dashboard.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
          The control room still owns execution. This page gives you reusable prompt starters for
          regime analysis, spread calibration, and risk drift reviews while staying inside the same
          protected app shell as the dashboard.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {prompts.map((prompt, index) => (
          <article
            className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6 transition hover:border-zinc-700 hover:bg-zinc-900/60"
            key={prompt}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Prompt {index + 1}</p>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/70 text-zinc-400">
                <Icon icon="solar:stars-line-duotone" width={18} height={18} />
              </div>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-100">{prompt}</p>
          </article>
        ))}
      </section>
    </ProtectedShell>
  )
}
