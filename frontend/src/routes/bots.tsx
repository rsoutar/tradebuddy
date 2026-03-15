import { Icon } from '@iconify/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getBotActivity } from '../lib/session'
import type { BotActivityState, BotRun, StrategyKey } from '../lib/session'
import { Route as RootRoute } from './__root'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const strategyMeta: Record<
  StrategyKey,
  { icon: string; label: string; tone: string; chip: string; ring: string }
> = {
  grid: {
    icon: 'solar:widget-4-linear',
    label: 'Sideways',
    tone: 'text-emerald-300',
    chip: 'bg-emerald-500/12 text-emerald-300',
    ring: 'border-emerald-500/25 bg-emerald-500/10',
  },
  rebalance: {
    icon: 'solar:refresh-circle-linear',
    label: 'Steady',
    tone: 'text-amber-300',
    chip: 'bg-amber-500/12 text-amber-300',
    ring: 'border-amber-500/25 bg-amber-500/10',
  },
  'infinity-grid': {
    icon: 'solar:maximize-square-linear',
    label: 'Trend',
    tone: 'text-sky-300',
    chip: 'bg-sky-500/12 text-sky-300',
    ring: 'border-sky-500/25 bg-sky-500/10',
  },
}

export const Route = createFileRoute('/bots')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  staleTime: 60_000,
  preloadStaleTime: 60_000,
  shouldReload: false,
  loader: () => getBotActivity(),
  component: BotsPage,
})

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function formatDateTime(value?: string) {
  if (!value) return 'No timestamp yet'
  return dateTimeFormatter.format(new Date(value))
}

function formatPercent(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatTimeAgo(timestamp?: string) {
  if (!timestamp) return 'Never'

  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

  return formatDateTime(timestamp)
}

function BotCard({
  bot,
  mode,
}: {
  bot: BotRun
  mode: 'active' | 'previous'
}) {
  const meta = strategyMeta[bot.strategy]
  const isActive = mode === 'active'

  return (
    <article className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${meta.chip}`}
            >
              {meta.label}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                isActive
                  ? 'bg-emerald-500/12 text-emerald-300'
                  : bot.status === 'crashed'
                    ? 'bg-rose-500/12 text-rose-300'
                    : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {isActive ? 'Active now' : bot.status === 'crashed' ? 'Crashed' : 'Stopped'}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-medium tracking-tight text-zinc-100">{bot.name}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{bot.configSummary}</p>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${meta.ring}`}
        >
          <Icon className={meta.tone} icon={meta.icon} width={22} height={22} />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pair</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">
            {bot.symbol} • {bot.exchange}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Trades</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{bot.tradeCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Notional</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{formatCurrency(bot.totalNotionalUsd)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Unrealized PnL</p>
          <p className={`mt-2 text-sm font-medium ${bot.unrealizedPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {bot.unrealizedPnlUsd >= 0 ? '+' : ''}
            {formatCurrency(bot.unrealizedPnlUsd)} ({formatPercent(bot.unrealizedPnlPct)})
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Started</p>
          <p className="mt-2 text-zinc-100">{formatDateTime(bot.startedAt)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            {isActive ? 'Last trade' : 'Stopped'}
          </p>
          <p className="mt-2 text-zinc-100">
            {isActive ? formatTimeAgo(bot.lastTradeAt) : formatDateTime(bot.stoppedAt)}
          </p>
        </div>
      </div>
    </article>
  )
}

function BotsPage() {
  const viewer = RootRoute.useLoaderData()
  const activity = Route.useLoaderData() as BotActivityState
  const hasActiveBots = activity.activeBots.length > 0

  return (
    <ProtectedShell
      activeNavId="bots"
      viewer={viewer.user!}
      header={({ openMenu }) => (
        <>
          <div className="flex items-center gap-4">
            <ProtectedMenuButton onClick={openMenu} />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Strategies</p>
              <h1 className="text-lg font-medium tracking-tight text-zinc-100">Active Bots</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-sky-900/30 bg-sky-900/10 px-3 py-1.5 text-xs text-sky-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Bot lifecycle
          </div>
        </>
      )}
    >
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Current Status</p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-zinc-100">
            {hasActiveBots
              ? `${activity.summary.activeBotCount} active bot${activity.summary.activeBotCount === 1 ? '' : 's'} running now.`
              : 'No bot is active right now.'}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
            This page now shows every currently running bot and keeps a separate section for older
            stopped runs, so you can scan live activity without losing historical context.
          </p>
          {!hasActiveBots ? (
            <div className="mt-6">
              <Link
                className="inline-flex items-center rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                to="/dashboard"
              >
                Start a bot from the dashboard
              </Link>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Run Summary</p>
          <div className="mt-5 space-y-3 text-sm text-zinc-400">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <span>Active bots</span>
              <strong className="text-zinc-100">{activity.summary.activeBotCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <span>Previous bots</span>
              <strong className="text-zinc-100">{activity.summary.previousBotCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <span>Total bot runs</span>
              <strong className="text-zinc-100">{activity.summary.totalBots}</strong>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Last started</p>
              <p className="mt-2 text-sm text-zinc-100">{formatDateTime(activity.summary.lastStartedAt)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Active Bots</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">Currently running</h2>
          </div>
        </div>

        {hasActiveBots ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activity.activeBots.map((bot) => (
              <BotCard bot={bot} key={bot.id} mode="active" />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-500">
              <Icon icon="solar:cpu-bolt-linear" width={24} height={24} />
            </div>
            <h3 className="mt-5 text-2xl font-medium tracking-tight text-zinc-100">No active bot</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Launch a new bot from the dashboard and it will appear here as the current active run.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Previous Bots</p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">Earlier active runs</h2>
        </div>

        {activity.previousBots.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activity.previousBots.map((bot) => (
              <BotCard bot={bot} key={bot.id} mode="previous" />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
            <p className="text-sm leading-6 text-zinc-500">
              Previous bots will appear here after a newer bot takes over.
            </p>
          </div>
        )}
      </section>
    </ProtectedShell>
  )
}
