import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { createFileRoute } from '@tanstack/react-router'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getTradeHistory } from '../lib/session'
import type { PaperTrade, StrategyKey, TradeHistoryState } from '../lib/session'
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

export const Route = createFileRoute('/history')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  staleTime: 60_000,
  preloadStaleTime: 60_000,
  shouldReload: false,
  loader: () => getTradeHistory(),
  component: TradeHistoryPage,
})

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function formatDateTime(timestamp?: string) {
  if (!timestamp) return 'No trades yet'
  return dateTimeFormatter.format(new Date(timestamp))
}

function formatAmount(value: number) {
  return value.toFixed(value < 1 ? 6 : 4)
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

function summarizeConfig(trade: PaperTrade) {
  if (trade.strategy !== 'grid') return trade.strategyLabel

  const lowerPrice = Number(trade.config.lower_price)
  const upperPrice = Number(trade.config.upper_price)
  const gridCount = Number(trade.config.grid_count)
  const stopLossEnabled = Boolean(trade.config.stop_loss_enabled)
  const stopLossPct = Number(trade.config.stop_loss_pct)

  const stopLossLabel =
    stopLossEnabled && Number.isFinite(stopLossPct)
      ? `Stop loss ${stopLossPct.toFixed(1)}%`
      : 'Stop loss off'

  return `${gridCount} levels • ${formatCurrency(lowerPrice)}-${formatCurrency(upperPrice)} • ${stopLossLabel}`
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string
  value: string
  detail: string
  icon: string
  accent?: 'positive' | 'negative'
}) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center justify-between text-zinc-400">
        <span className="text-sm">{label}</span>
        <Icon icon={icon} width={18} height={18} />
      </div>
      <div
        className={cx(
          'text-2xl font-medium tracking-tight',
          accent === 'positive'
            ? 'text-emerald-400'
            : accent === 'negative'
              ? 'text-rose-400'
              : 'text-zinc-100',
        )}
      >
        {value}
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{detail}</p>
    </div>
  )
}

function TradeHistoryPage() {
  const history = Route.useLoaderData() as TradeHistoryState
  const viewer = RootRoute.useLoaderData()
  const [searchValue, setSearchValue] = useState('')
  const [strategyFilter, setStrategyFilter] = useState<'all' | StrategyKey>('all')
  const [sideFilter, setSideFilter] = useState<'all' | 'buy' | 'sell'>('all')
  const [botFilter, setBotFilter] = useState<'all' | string>('all')

  const strategyOptions = useMemo(
    () => Array.from(new Set(history.trades.map((trade) => trade.strategy))),
    [history.trades],
  )
  const botOptions = useMemo(
    () => Array.from(new Set(history.trades.map((trade) => trade.botName))),
    [history.trades],
  )

  const filteredTrades = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    return history.trades.filter((trade) => {
      if (strategyFilter !== 'all' && trade.strategy !== strategyFilter) return false
      if (sideFilter !== 'all' && trade.side !== sideFilter) return false
      if (botFilter !== 'all' && trade.botName !== botFilter) return false
      if (!needle) return true

      return `${trade.botName} ${trade.strategyLabel} ${trade.rationale} ${trade.symbol} ${trade.side} ${trade.status}`
        .toLowerCase()
        .includes(needle)
    })
  }, [botFilter, history.trades, searchValue, sideFilter, strategyFilter])

  return (
    <ProtectedShell
      activeNavId="history"
      viewer={viewer.user!}
      header={({ openMenu }) => (
        <>
          <div className="flex items-center gap-4">
            <ProtectedMenuButton onClick={openMenu} />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Trade History</p>
              <h1 className="text-lg font-medium tracking-tight text-zinc-100">
                Paper trade ledger
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-900/30 bg-emerald-900/10 px-3 py-1.5 text-xs text-emerald-500 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            SQLite-backed ledger
          </div>
        </>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Ledger Overview</p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-zinc-100">
            Verify every planned grid order before trusting the behavior.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
            This table is read directly from `paper_trades` in SQLite, so you can inspect the
            ladder, side distribution, size progression, and the exact rationale attached to each
            generated trade row.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Latest Activity</p>
          <div className="mt-3 text-3xl font-medium tracking-tight text-zinc-100">
            {formatDateTime(history.summary.latestTradeAt)}
          </div>
          <div className="mt-5 space-y-3 text-sm text-zinc-400">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <span>Active bots with trades</span>
              <strong className="text-zinc-100">{history.summary.activeBotCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <span>Paper runs launched</span>
              <strong className="text-zinc-100">{history.summary.paperRunCount}</strong>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <span>Planned trade rows</span>
              <strong className="text-zinc-100">{history.summary.plannedTrades}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          detail="Every paper trade row stored for the signed-in account."
          icon="solar:document-text-linear"
          label="Total Trades"
          value={String(history.summary.totalTrades)}
        />
        <SummaryCard
          detail="Combined USD notional across the planned order ledger."
          icon="solar:wallet-money-linear"
          label="Total Notional"
          value={formatCurrency(history.summary.totalNotionalUsd)}
        />
        <SummaryCard
          detail="Quick balance check for the generated ladder structure."
          icon="solar:sort-by-alphabet-linear"
          label="Buy / Sell Split"
          value={`${history.summary.buyTrades} / ${history.summary.sellTrades}`}
        />
        <SummaryCard
          accent={filteredTrades.length ? 'positive' : 'negative'}
          detail="Rows visible after applying the active audit filters."
          icon="solar:filter-linear"
          label="Filtered Rows"
          value={String(filteredTrades.length)}
        />
      </div>

      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Filters</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">
              Audit the ladder by bot, side, or rationale
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm text-zinc-500">
              Search
              <input
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                placeholder="Bot name, rationale, symbol..."
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-zinc-500">
              Strategy
              <select
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-zinc-100 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                value={strategyFilter}
                onChange={(event) => setStrategyFilter(event.target.value as 'all' | StrategyKey)}
              >
                <option value="all">All strategies</option>
                {strategyOptions.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-zinc-500">
              Side
              <select
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-zinc-100 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                value={sideFilter}
                onChange={(event) => setSideFilter(event.target.value as 'all' | 'buy' | 'sell')}
              >
                <option value="all">All sides</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-zinc-500">
              Bot
              <select
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-zinc-100 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                value={botFilter}
                onChange={(event) => setBotFilter(event.target.value)}
              >
                <option value="all">All bots</option>
                {botOptions.map((bot) => (
                  <option key={bot} value={bot}>
                    {bot}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950/40">
          {filteredTrades.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full whitespace-nowrap text-left text-sm">
                <thead className="border-b border-zinc-800/50 bg-zinc-900/20 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Bot / Config</th>
                    <th className="px-5 py-3">Side</th>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Notional</th>
                    <th className="px-5 py-3">Rationale</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade, index) => (
                    <tr
                      className={cx(
                        'border-t border-zinc-800/30 align-top',
                        index % 2 === 0 ? 'bg-zinc-950/40' : 'bg-zinc-900/20',
                      )}
                      key={trade.id}
                    >
                      <td className="px-5 py-4 text-zinc-500">
                        <div>{formatDateTime(trade.createdAt)}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-600">
                          {formatTimeAgo(trade.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-zinc-100">{trade.botName}</div>
                        <div className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">
                          {summarizeConfig(trade)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cx(
                            'inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                            trade.side === 'buy'
                              ? 'bg-emerald-500/12 text-emerald-300'
                              : 'bg-rose-500/12 text-rose-300',
                          )}
                        >
                          {trade.side}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-zinc-400">
                        <div className="font-medium text-zinc-100">{trade.strategyLabel}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-600">
                          {trade.orderType} • {trade.symbol}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-medium text-zinc-100">
                        {formatCurrency(trade.price)}
                      </td>
                      <td className="px-5 py-4 text-zinc-400">{formatAmount(trade.amount)}</td>
                      <td className="px-5 py-4 font-medium text-zinc-100">
                        {formatCurrency(trade.notionalUsd)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="max-w-md whitespace-normal leading-6 text-zinc-400">
                          {trade.rationale}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                          {trade.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-500">
                <Icon icon="solar:history-linear" width={24} height={24} />
              </div>
              <h3 className="mt-5 text-2xl font-medium tracking-tight text-zinc-100">
                No trades match the current filters
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Clear the filters or start another paper bot from the dashboard to generate more
                paper-trade rows.
              </p>
            </div>
          )}
        </div>
      </div>
    </ProtectedShell>
  )
}
