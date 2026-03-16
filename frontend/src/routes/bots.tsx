import { Icon } from '@iconify/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { BotControlModal } from '../components/bot-control-modal'
import { MarketConnectionBadge } from '../components/market-connection-badge'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getBotActivity, getConnectionStatus, stopBot } from '../lib/session'
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
  loader: async () => ({
    activity: await getBotActivity(),
    connection: await getConnectionStatus(),
  }),
  component: BotsPage,
})

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

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
  onInspect,
}: {
  bot: BotRun
  mode: 'active' | 'previous'
  onInspect?: (bot: BotRun) => void
}) {
  const meta = strategyMeta[bot.strategy]
  const isActive = mode === 'active'
  const isStopping = isActive && bot.desiredStatus === 'stopped'
  const isInteractive = isActive && typeof onInspect === 'function'
  const rootClassName = cx(
    'rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6',
    isInteractive && 'w-full text-left transition hover:border-zinc-700 hover:bg-zinc-900/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40',
  )

  const statusChipClassName = isActive
    ? isStopping
      ? 'bg-amber-500/12 text-amber-300'
      : 'bg-emerald-500/12 text-emerald-300'
    : bot.status === 'crashed'
      ? 'bg-rose-500/12 text-rose-300'
      : 'bg-zinc-800 text-zinc-300'

  const statusLabel = isActive ? (isStopping ? 'Stop pending' : 'Active now') : bot.status === 'crashed' ? 'Crashed' : 'Stopped'

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${meta.chip}`}
            >
              {meta.label}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusChipClassName}`}
            >
              {statusLabel}
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Budget</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{formatCurrency(bot.budgetUsd)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Current equity</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">
            {formatCurrency(bot.currentEquityUsd)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Unrealized PnL</p>
          <p
            className={cx(
              'mt-2 text-sm font-medium',
              bot.unrealizedPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300',
            )}
          >
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
            {isActive ? (isStopping ? 'Requested stop' : 'Last trade') : 'Stopped'}
          </p>
          <p className="mt-2 text-zinc-100">
            {isActive
              ? isStopping
                ? formatTimeAgo(bot.updatedAt)
                : formatTimeAgo(bot.lastTradeAt)
              : formatDateTime(bot.stoppedAt)}
          </p>
        </div>
      </div>

      {isInteractive ? (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-400">
          <span>{isStopping ? 'Stop has been requested. Open controls to monitor it.' : 'Open NAV chart and controls.'}</span>
          <span className="inline-flex items-center gap-2 font-medium text-zinc-200">
            Inspect
            <Icon icon="solar:alt-arrow-right-linear" width={16} height={16} />
          </span>
        </div>
      ) : null}
    </>
  )

  if (isInteractive) {
    return (
      <button aria-haspopup="dialog" className={rootClassName} type="button" onClick={() => onInspect(bot)}>
        {cardContent}
      </button>
    )
  }

  return <article className={rootClassName}>{cardContent}</article>
}

function BotsPage() {
  const viewer = RootRoute.useLoaderData()
  const loaderData = Route.useLoaderData() as {
    activity: BotActivityState
    connection: Awaited<ReturnType<typeof getConnectionStatus>>
  }
  const [activity, setActivity] = useState(loaderData.activity)
  const [selectedBotId, setSelectedBotId] = useState<string>()
  const [isStoppingBot, setIsStoppingBot] = useState(false)
  const [stopFeedback, setStopFeedback] = useState<string>()
  const [stopError, setStopError] = useState<string>()

  const hasActiveBots = activity.activeBots.length > 0
  const allBots = useMemo(() => [...activity.activeBots, ...activity.previousBots], [activity.activeBots, activity.previousBots])
  const selectedBot = useMemo(() => allBots.find((bot) => bot.id === selectedBotId), [allBots, selectedBotId])

  async function handleStopBot() {
    if (!selectedBot) return

    try {
      setIsStoppingBot(true)
      setStopError(undefined)
      setStopFeedback(undefined)
      const nextActivity = await stopBot({
        // @ts-ignore
        data: { botId: selectedBot.id },
      })
      setActivity(nextActivity)
      setStopFeedback(
        `${selectedBot.name} received a stop request. The card will move to Previous Bots as soon as the worker exits cleanly.`,
      )
    } catch (error) {
      setStopError(error instanceof Error ? error.message : 'Unable to stop this bot right now.')
    } finally {
      setIsStoppingBot(false)
    }
  }

  return (
    <>
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
            <MarketConnectionBadge
              connection={loaderData.connection.connection}
              market={loaderData.connection.market}
            />
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
              Click any running bot to inspect its NAV view, keep the chart treatment aligned with
              backtesting, and stop the worker without leaving this page.
            </p>
            {stopFeedback ? (
              <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {stopFeedback}
              </div>
            ) : null}
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
                <BotCard bot={bot} key={bot.id} mode="active" onInspect={(nextBot) => {
                  setStopError(undefined)
                  setStopFeedback(undefined)
                  setSelectedBotId(nextBot.id)
                }} />
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

      <BotControlModal
        bot={selectedBot}
        error={stopError}
        feedback={stopFeedback}
        isStopping={isStoppingBot}
        onClose={() => setSelectedBotId(undefined)}
        onStop={handleStopBot}
      />
    </>
  )
}
