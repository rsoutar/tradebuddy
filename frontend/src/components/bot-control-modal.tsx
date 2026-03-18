import { Icon } from '@iconify/react'
import { lazy, Suspense, useEffect, useMemo } from 'react'
import type { ActiveStrategy, BotRun } from '../lib/session'
import { useTheme } from '../lib/theme'
import type { BacktestEquityPoint } from './backtest-equity-chart'

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

const BacktestEquityChart = lazy(async () => {
  const module = await import('./backtest-equity-chart')
  return { default: module.BacktestEquityChart }
})

type ControllableBot = ActiveStrategy | BotRun

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${currencyFormatter.format(Math.abs(value))}`
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

function buildEstimatedNavSeries(bot: ControllableBot): BacktestEquityPoint[] {
  const deployedCapital = Math.max(bot.budgetUsd, 0)
  const currentNav = Math.max(bot.currentEquityUsd, 0)
  const currentTimestamp = bot.updatedAt ?? bot.lastTradeAt ?? bot.startedAt
  const points: BacktestEquityPoint[] = [
    {
      label: 'Start',
      timestamp: bot.startedAt,
      equity: deployedCapital,
    },
  ]

  if (bot.lastTradeAt && bot.lastTradeAt !== bot.startedAt && bot.lastTradeAt !== currentTimestamp) {
    points.push({
      label: 'Last trade',
      timestamp: bot.lastTradeAt,
      equity: Math.max(deployedCapital + bot.unrealizedPnlUsd * 0.6, 0),
    })
  }

  if (currentTimestamp !== bot.startedAt || currentNav !== deployedCapital) {
    points.push({
      label: bot.desiredStatus === 'stopped' && bot.status === 'paper-running' ? 'Stopping' : 'Now',
      timestamp: currentTimestamp,
      equity: currentNav,
    })
  }

  if (points.length === 1) {
    points.push({
      label: 'Now',
      timestamp: currentTimestamp,
      equity: currentNav,
    })
  }

  return points
}

function getCrashReason(bot?: ControllableBot) {
  if (!bot || bot.status !== 'crashed') return undefined
  return bot.lastError?.trim() || 'No crash reason was recorded for this run.'
}

export function BotControlModal({
  bot,
  isStopping,
  feedback,
  error,
  onClose,
  onStop,
}: {
  bot?: ControllableBot
  isStopping: boolean
  feedback?: string
  error?: string
  onClose: () => void
  onStop: () => void
}) {
  const { effectiveTheme } = useTheme()
  const isLightTheme = effectiveTheme === 'light'
  const navData = useMemo(() => (bot ? buildEstimatedNavSeries(bot) : []), [bot])
  const estimatedCurrentNav = navData[navData.length - 1]?.equity ?? 0
  const crashReason = getCrashReason(bot)

  useEffect(() => {
    if (!bot) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isStopping) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bot, isStopping, onClose])

  if (!bot) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <button
        aria-label="Close bot controls"
        className="absolute inset-0"
        type="button"
        onClick={() => {
          if (isStopping) return
          onClose()
        }}
      />
      <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-zinc-800/80 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_58%)] p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-400/80">
                  Live NAV
                </p>
                <h2 className="mt-2 text-3xl font-medium tracking-tight text-zinc-100">
                  {bot.name}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  This view reuses the backtesting chart so the bot control flow stays visually
                  consistent. The curve below is based on executed trades only, so a fresh bot
                  stays flat until the first order actually fills.
                </p>
              </div>
              <button
                aria-label="Close bot controls"
                className="rounded-full border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
                type="button"
                onClick={onClose}
              >
                <Icon icon="solar:close-circle-linear" width={22} height={22} />
              </button>
            </div>

            <div className="mt-6 rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-5">
              <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Live NAV</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-zinc-100">
                    {formatCurrency(estimatedCurrentNav)}
                  </p>
                </div>
                <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Budget</p>
                    <p className="mt-2 font-medium text-zinc-100">{formatCurrency(bot.budgetUsd)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Unrealized</p>
                    <p
                      className={cx(
                        'mt-2 font-medium',
                        bot.unrealizedPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300',
                      )}
                    >
                      {formatSignedCurrency(bot.unrealizedPnlUsd)} ({formatPercent(bot.unrealizedPnlPct)})
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Started</p>
                    <p className="mt-2 font-medium text-zinc-100">{formatDateTime(bot.startedAt)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <Suspense
                  fallback={
                    <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
                      Loading NAV chart...
                    </div>
                  }
                >
                  <BacktestEquityChart className="h-72" data={navData} isLightTheme={isLightTheme} />
                </Suspense>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Control Panel</p>
              <h3 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">
                {bot.desiredStatus === 'stopped' && bot.status === 'paper-running'
                  ? 'Stop requested'
                  : bot.status === 'paper-running'
                    ? 'Manage running bot'
                    : 'Bot is no longer running'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Review the bot&apos;s latest trading footprint and stop it from the same modal when
                you need to intervene quickly.
              </p>
              {!bot.tradeCount ? (
                <div className="mt-5 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-400">
                  No executed trades yet. Position value and PnL will appear after the first fill.
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Current equity</p>
                  <p className="mt-2 text-sm font-medium text-zinc-100">
                    {formatCurrency(bot.currentEquityUsd)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Status</p>
                  <p className="mt-2 text-sm font-medium text-zinc-100">
                    {bot.status === 'paper-running'
                      ? bot.desiredStatus === 'stopped'
                        ? 'Stopping after worker acknowledgement'
                        : 'Running'
                      : bot.status === 'crashed'
                        ? 'Crashed'
                        : 'Stopped'}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Executed trades</p>
                  <p className="mt-2 text-sm font-medium text-zinc-100">{bot.tradeCount}</p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Last heartbeat</p>
                  <p className="mt-2 text-sm font-medium text-zinc-100">{formatDateTime(bot.updatedAt)}</p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Last trade</p>
                  <p className="mt-2 text-sm font-medium text-zinc-100">{formatTimeAgo(bot.lastTradeAt)}</p>
                </div>
              </div>

              {crashReason ? (
                <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-rose-200/80">Crash reason</p>
                  <p className="mt-2 break-words text-sm leading-6 text-rose-100">{crashReason}</p>
                </div>
              ) : null}

              {error ? (
                <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {error}
                </div>
              ) : null}

              {feedback ? (
                <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {feedback}
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                  disabled={isStopping}
                  type="button"
                  onClick={onClose}
                >
                  Close
                </button>
                <button
                  className="rounded-xl bg-rose-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:bg-rose-400/60"
                  disabled={isStopping || bot.status !== 'paper-running' || bot.desiredStatus === 'stopped'}
                  type="button"
                  onClick={onStop}
                >
                  {isStopping
                    ? 'Sending stop...'
                    : bot.desiredStatus === 'stopped'
                      ? 'Stop requested'
                      : 'Stop bot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
