import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Icon } from '@iconify/react'
import { MarketConnectionBadge } from '../components/market-connection-badge'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import type { DashboardState, MarketConnectionState, MarketState, StrategyKey } from '../lib/session'
import { createBot, depositPaperFunds, getDashboard } from '../lib/session'

const strategyLabels: Record<StrategyKey, string> = {
  grid: 'Grid Bot',
  rebalance: 'Rebalance Bot',
  'infinity-grid': 'Infinity Grid Bot',
}

const botCatalog: Array<{
  key: StrategyKey
  eyebrow: string
  description: string
  icon: string
  accent: string
  availableNow: boolean
}> = [
  {
    key: 'grid',
    eyebrow: 'Ready now',
    description: 'Define a price range, split it into levels, and let the ladder trade the chop.',
    icon: 'solar:widget-4-linear',
    accent:
      'border-emerald-400/30 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_70%)]',
    availableNow: true,
  },
  {
    key: 'rebalance',
    eyebrow: 'Ready now',
    description: 'Keep BTC allocation on target with scheduled drift checks and auto-adjustments.',
    icon: 'solar:refresh-circle-linear',
    accent:
      'border-amber-400/20 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_70%)]',
    availableNow: true,
  },
  {
    key: 'infinity-grid',
    eyebrow: 'Coming soon',
    description: 'Push the grid upward in trend mode and keep extending entries as the market climbs.',
    icon: 'solar:maximize-square-linear',
    accent:
      'border-sky-400/20 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_70%)]',
    availableNow: false,
  },
]

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  staleTime: 60_000,
  preloadStaleTime: 60_000,
  shouldReload: false,
  loader: () => getDashboard(),
  component: DashboardPage,
})

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value)
}

function formatPercent(value: number, digits = 2) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
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

  return dateTimeFormatter.format(date)
}

function toneClasses(tone: 'blue' | 'purple' | 'zinc') {
  if (tone === 'blue') {
    return {
      box: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
      icon: 'text-blue-400',
    }
  }

  if (tone === 'purple') {
    return {
      box: 'border-purple-500/20 bg-purple-500/10 text-purple-400',
      icon: 'text-purple-400',
    }
  }

  return {
    box: 'border-zinc-700 bg-zinc-900 text-zinc-500',
    icon: 'text-zinc-500',
  }
}

function strategyTone(strategy: StrategyKey) {
  if (strategy === 'grid') {
    return {
      tone: 'blue' as const,
      icon: 'solar:widget-4-linear',
    }
  }

  if (strategy === 'infinity-grid') {
    return {
      tone: 'purple' as const,
      icon: 'solar:maximize-square-linear',
    }
  }

  return {
    tone: 'zinc' as const,
    icon: 'solar:refresh-circle-linear',
  }
}

function MetricCard({
  label,
  labelAction,
  value,
  icon,
  accent,
  change,
  footer,
  progress,
}: {
  label: string
  labelAction?: ReactNode
  value: ReactNode
  icon: string
  accent?: 'positive' | 'negative'
  change?: React.ReactNode
  footer?: React.ReactNode
  progress?: number
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-start justify-between text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-sm font-normal">{label}</span>
          {labelAction}
        </div>
        <Icon icon={icon} width={18} height={18} />
      </div>
      <div>
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
        {change ? <div className="mt-2 flex items-center gap-2">{change}</div> : null}
        {footer ? <div className="mt-2">{footer}</div> : null}
        {typeof progress === 'number' ? (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-zinc-400"
                style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DashboardPage() {
  const loaderData = Route.useLoaderData()
  const [dashboard, setDashboard] = useState<DashboardState>(loaderData.dashboard)
  const [market, setMarket] = useState<MarketState>(loaderData.market)
  const [connection, setConnection] = useState<MarketConnectionState>(loaderData.connection)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
  const [isCreateBotModalOpen, setIsCreateBotModalOpen] = useState(false)
  const [selectedBotType, setSelectedBotType] = useState<StrategyKey>('grid')
  const [isCreatingBot, setIsCreatingBot] = useState(false)
  const [createBotError, setCreateBotError] = useState<string>()
  const [gridLowerPrice, setGridLowerPrice] = useState('')
  const [gridUpperPrice, setGridUpperPrice] = useState('')
  const [gridCount, setGridCount] = useState('8')
  const [gridSpacing, setGridSpacing] = useState('2')
  const [isGridStopLossEnabled, setIsGridStopLossEnabled] = useState(false)
  const [gridStopLoss, setGridStopLoss] = useState('10')
  const [rebalanceTargetRatio, setRebalanceTargetRatio] = useState('50')
  const [rebalanceThreshold, setRebalanceThreshold] = useState('5')
  const [rebalanceInterval, setRebalanceInterval] = useState('60')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositError, setDepositError] = useState<string>()
  const [isDepositing, setIsDepositing] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [searchValue, setSearchValue] = useState('')

  const activeBots = dashboard.activeStrategies.length
  const alertCount = dashboard.events.filter((event) => event.tone !== 'neutral').length
  const totalUnrealizedPnl = dashboard.activeStrategies.reduce(
    (sum, strategy) => sum + strategy.unrealizedPnlUsd,
    0,
  )
  const totalTradeCount = dashboard.activeStrategies.reduce(
    (sum, strategy) => sum + strategy.tradeCount,
    0,
  )
  const averageWinRate =
    dashboard.bots.reduce((sum, bot) => sum + bot.winRatePct, 0) / Math.max(dashboard.bots.length, 1)

  const metricsData = {
    totalBalance: dashboard.capitalUsd,
    balanceChange: 2.4,
    profit24h: totalUnrealizedPnl,
    trades24h: totalTradeCount,
    activeBots,
    totalBots: Object.keys(strategyLabels).length,
    winRate: averageWinRate,
    winRateChange: -1.2,
  }

  const chartData = [
    { date: 'Nov 3', value: 30, positive: true },
    { date: 'Nov 4', value: 45, positive: true },
    { date: 'Nov 5', value: -15, positive: false },
    { date: 'Nov 6', value: 20, positive: true },
    { date: 'Nov 7', value: 60, positive: true },
    { date: 'Nov 8', value: 55, positive: true },
    { date: 'Nov 9', value: -25, positive: false },
    { date: 'Nov 10', value: 40, positive: true },
    { date: 'Nov 11', value: 70, positive: true },
    { date: 'Nov 12', value: 85, positive: true },
  ]

  const activityLog = useMemo(
    () =>
      dashboard.events.map((event) => ({
        id: event.id,
        icon:
          event.tone === 'positive'
            ? 'solar:check-circle-linear'
            : event.tone === 'warning'
              ? 'solar:danger-triangle-linear'
              : 'solar:info-circle-linear',
        color:
          event.tone === 'positive'
            ? 'emerald'
            : event.tone === 'warning'
              ? 'rose'
              : 'blue',
        title: event.title,
        detail: event.detail,
        time: event.timeLabel,
      })),
    [dashboard.events],
  )

  const filteredActivityLog = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    if (!needle) return activityLog

    return activityLog.filter((log) =>
      `${log.title} ${log.detail} ${log.time}`.toLowerCase().includes(needle),
    )
  }, [activityLog, searchValue])

  async function handleRefresh() {
    try {
      setActionError(undefined)
      setIsRefreshing(true)
      const nextDashboard = await getDashboard()
      setDashboard(nextDashboard.dashboard)
      setMarket(nextDashboard.market)
      setConnection(nextDashboard.connection)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to refresh the dashboard.')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleDepositSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const amountValue = Number.parseFloat(depositAmount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setDepositError('Enter a deposit amount greater than $0.')
      return
    }

    try {
      setActionError(undefined)
      setDepositError(undefined)
      setIsDepositing(true)
      const nextDashboard = await depositPaperFunds({
        // @ts-ignore
        data: { amountUsd: amountValue },
      })
      setDashboard(nextDashboard)
      setDepositAmount('')
      setIsDepositModalOpen(false)
    } catch (error) {
      setDepositError(error instanceof Error ? error.message : 'Unable to deposit funds right now.')
    } finally {
      setIsDepositing(false)
    }
  }

  async function handleCreateBotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setActionError(undefined)
      setCreateBotError(undefined)
      setIsCreatingBot(true)
      let nextDashboard: DashboardState
      if (selectedBotType === 'grid') {
        const lowerPrice = Number.parseFloat(gridLowerPrice)
        const upperPrice = Number.parseFloat(gridUpperPrice)
        const gridLevelCount = Number.parseInt(gridCount, 10)
        const spacingPct = Number.parseFloat(gridSpacing)
        const stopLossPct = isGridStopLossEnabled ? Number.parseFloat(gridStopLoss) : undefined

        if (!Number.isFinite(lowerPrice) || !Number.isFinite(upperPrice)) {
          setCreateBotError('Enter both lower and upper prices for the grid range.')
          return
        }

        if (upperPrice <= lowerPrice) {
          setCreateBotError('Upper price must be greater than the lower price.')
          return
        }

        if (!Number.isInteger(gridLevelCount) || gridLevelCount < 2) {
          setCreateBotError('Grid levels must be a whole number greater than or equal to 2.')
          return
        }

        if (!Number.isFinite(spacingPct) || spacingPct <= 0) {
          setCreateBotError('Grid spacing must be greater than 0.')
          return
        }

        if (
          isGridStopLossEnabled
          && (!Number.isFinite(stopLossPct) || (stopLossPct ?? 0) <= 0)
        ) {
          setCreateBotError('Stop-loss percentage must be greater than 0.')
          return
        }

        nextDashboard = await createBot({
          // @ts-ignore
          data: {
            strategy: 'grid',
            gridConfig: {
              lowerPrice,
              upperPrice,
              gridCount: gridLevelCount,
              spacingPct,
              stopLossEnabled: isGridStopLossEnabled,
              stopLossPct,
            },
          },
        })
      } else if (selectedBotType === 'rebalance') {
        const targetRatioPct = Number.parseFloat(rebalanceTargetRatio)
        const thresholdPct = Number.parseFloat(rebalanceThreshold)
        const intervalMinutes = Number.parseInt(rebalanceInterval, 10)

        if (!Number.isFinite(targetRatioPct) || targetRatioPct < 0 || targetRatioPct > 100) {
          setCreateBotError('Target BTC allocation must be between 0% and 100%.')
          return
        }

        if (!Number.isFinite(thresholdPct) || thresholdPct <= 0) {
          setCreateBotError('Drift threshold must be greater than 0%.')
          return
        }

        if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
          setCreateBotError('Rebalance interval must be a whole number of minutes greater than 0.')
          return
        }

        nextDashboard = await createBot({
          // @ts-ignore
          data: {
            strategy: 'rebalance',
            rebalanceConfig: {
              targetBtcRatio: targetRatioPct / 100,
              rebalanceThresholdPct: thresholdPct,
              intervalMinutes,
            },
          },
        })
      } else {
        setCreateBotError('Infinity Grid is not wired into the live create flow yet.')
        return
      }

      setDashboard(nextDashboard)
      setIsCreateBotModalOpen(false)
      setGridLowerPrice('')
      setGridUpperPrice('')
      setGridCount('8')
      setGridSpacing('2')
      setIsGridStopLossEnabled(false)
      setGridStopLoss('10')
      setRebalanceTargetRatio('50')
      setRebalanceThreshold('5')
      setRebalanceInterval('60')
    } catch (error) {
      setCreateBotError(error instanceof Error ? error.message : 'Unable to create the bot right now.')
    } finally {
      setIsCreatingBot(false)
    }
  }

  return (
    <>
      <ProtectedShell
        activeNavId="dashboard"
        viewer={loaderData.viewer}
        header={({ openMenu }) => (
          <>
            <div className="flex items-center gap-4">
              <ProtectedMenuButton onClick={openMenu} />
              <h1 className="hidden text-lg font-medium tracking-tight text-zinc-100 sm:block">
                Overview
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <MarketConnectionBadge connection={connection} market={market} />
              <button className="relative p-1 text-zinc-400 transition-colors hover:text-zinc-100" type="button">
                <Icon icon="solar:bell-linear" width={20} height={20} />
                {alertCount > 0 ? (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                ) : null}
              </button>
            </div>
          </>
        )}
      >
          {actionError ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {actionError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              change={
                <>
                  <span className="flex items-center rounded bg-emerald-400/10 px-1.5 py-0.5 text-xs font-normal text-emerald-400">
                    <Icon icon="solar:arrow-right-up-linear" width={12} height={12} className="mr-0.5" />
                    {formatPercent(metricsData.balanceChange)}
                  </span>
                  <span className="text-xs font-normal text-zinc-500">vs last 24h</span>
                </>
              }
              icon="solar:wallet-linear"
              label="Total Balance"
              labelAction={
                <button
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-100 shadow-sm transition hover:border-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  type="button"
                  onClick={() => {
                    setDepositError(undefined)
                    setIsDepositModalOpen(true)
                  }}
                >
                  <Icon icon="solar:add-circle-linear" width={12} height={12} />
                  Deposit
                </button>
              }
              value={formatCurrency(metricsData.totalBalance)}
            />
            <MetricCard
              accent={metricsData.profit24h >= 0 ? 'positive' : 'negative'}
              footer={<span className="text-xs font-normal text-zinc-500">{metricsData.trades24h} trades executed</span>}
              icon="solar:graph-up-linear"
              label="24h Profit"
              value={`${metricsData.profit24h > 0 ? '+' : ''}${formatCurrency(metricsData.profit24h)}`}
            />
            <MetricCard
              footer={
                <div className="text-2xl font-medium tracking-tight text-zinc-100">
                  {metricsData.activeBots}{' '}
                  <span className="text-lg font-normal text-zinc-600">/ {metricsData.totalBots}</span>
                </div>
              }
              icon="solar:cpu-linear"
              label="Active Bots"
              progress={(metricsData.activeBots / metricsData.totalBots) * 100}
              value={null}
            />
            <MetricCard
              change={
                <>
                  <span className="flex items-center rounded bg-rose-400/10 px-1.5 py-0.5 text-xs font-normal text-rose-400">
                    <Icon
                      icon="solar:arrow-right-down-linear"
                      width={12}
                      height={12}
                      className="mr-0.5"
                    />
                    {Math.abs(metricsData.winRateChange).toFixed(1)}%
                  </span>
                  <span className="text-xs font-normal text-zinc-500">vs previous 30d</span>
                </>
              }
              icon="solar:target-linear"
              label="Win Rate (30d)"
              value={`${metricsData.winRate.toFixed(1)}%`}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900/30">
            <div className="flex flex-col justify-between gap-4 border-b border-zinc-800/50 p-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-medium tracking-tight text-zinc-100">
                  Portfolio Performance
                </h2>
                <p className="mt-1 text-xs font-normal text-zinc-500">
                  Combined PnL across all active strategies
                </p>
              </div>
              <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs font-normal">
                {['1H', '1D', '1W', '1M', 'ALL'].map((timeframe, idx) => (
                  <button
                    className={cx(
                      'rounded-md px-3 py-1.5 transition-colors',
                      idx === 2
                        ? 'border border-zinc-700/50 bg-zinc-800 text-zinc-100 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200',
                    )}
                    key={timeframe}
                    type="button"
                  >
                    {timeframe}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative h-64 p-5">
              <div className="absolute bottom-8 left-5 top-5 z-0 flex flex-col justify-between text-xs font-normal text-zinc-600">
                <span>+$2k</span>
                <span>+$1k</span>
                <span>0</span>
                <span>-$1k</span>
              </div>

              <div className="pointer-events-none absolute bottom-10 left-14 right-5 top-6 z-0 flex flex-col justify-between">
                <div className="w-full border-t border-dashed border-zinc-800/30" />
                <div className="w-full border-t border-dashed border-zinc-800/30" />
                <div className="w-full border-t border-zinc-700/50" />
                <div className="w-full border-t border-dashed border-zinc-800/30" />
              </div>

              <div className="relative z-10 ml-12 mt-2 flex h-full items-end justify-between gap-1 pb-6 sm:gap-2">
                {chartData.map((data) => (
                  <div
                    className={cx(
                      'group relative w-full cursor-crosshair rounded-t-sm border transition-colors',
                      data.positive
                        ? 'border-emerald-500/30 bg-emerald-500/20 hover:bg-emerald-500/40'
                        : 'mt-auto self-start border-rose-500/30 bg-rose-500/20 hover:bg-rose-500/40',
                    )}
                    key={data.date}
                    style={
                      data.positive
                        ? { height: `${data.value}%` }
                        : {
                            height: `${Math.abs(data.value)}%`,
                            transform: 'translateY(100%) scaleY(-1)',
                            transformOrigin: 'top',
                          }
                    }
                    title={`${data.date}: ${data.positive ? '+' : '-'}${formatCompactCurrency(
                      Math.abs(data.value) * 20,
                    )}`}
                  >
                    {data.date === 'Nov 12' ? (
                      <div className="pointer-events-none absolute -top-10 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 opacity-0 transition-opacity group-hover:block group-hover:opacity-100">
                        Nov 12: +$1,120
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="absolute bottom-0 left-0 right-5 ml-12 flex justify-between pb-2 text-xs font-normal text-zinc-600">
                <span>Nov 3</span>
                <span>Nov 6</span>
                <span>Nov 9</span>
                <span>Nov 12</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="flex flex-col lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-medium tracking-tight text-zinc-100">Active Strategies</h2>
                <button
                  className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-normal text-zinc-900 transition-colors hover:bg-zinc-200"
                  type="button"
                  onClick={() => {
                    setCreateBotError(undefined)
                    setSelectedBotType('grid')
                    setIsCreateBotModalOpen(true)
                  }}
                >
                  <Icon icon="solar:add-circle-linear" width={16} height={16} />
                  New Bot
                </button>
              </div>

              <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900/30">
                {dashboard.activeStrategies.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                      <thead className="border-b border-zinc-800/50 bg-zinc-900/20 text-xs font-normal uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-5 py-3">Bot Name</th>
                          <th className="px-5 py-3">Pair / Exchange</th>
                          <th className="px-5 py-3">Strategy</th>
                          <th className="px-5 py-3 text-right">Unrealized PnL</th>
                          <th className="px-5 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.activeStrategies.map((bot) => {
                          const palette = strategyTone(bot.strategy)
                          const tone = toneClasses(palette.tone)
                          const isPositive = bot.unrealizedPnlUsd >= 0
                          return (
                            <tr
                              className="border-t border-zinc-800/30 transition-colors hover:bg-zinc-900/20"
                              key={bot.id}
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cx(
                                      'flex h-8 w-8 items-center justify-center rounded-md border',
                                      tone.box,
                                    )}
                                  >
                                    <Icon className={tone.icon} icon={palette.icon} width={16} height={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-medium text-zinc-200">{bot.name}</div>
                                    <div className="truncate text-xs text-zinc-500">
                                      Started {formatTimeAgo(bot.createdAt)} • {bot.tradeCount} trade
                                      {bot.tradeCount === 1 ? '' : 's'} recorded
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="text-zinc-300">{bot.symbol}</div>
                                <div className="text-xs text-zinc-500">{bot.exchange}</div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="text-zinc-300">{bot.strategyLabel}</div>
                                <div className="max-w-xs truncate text-xs text-zinc-500">
                                  {bot.configSummary}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div
                                  className={cx(
                                    'font-medium',
                                    isPositive ? 'text-emerald-400' : 'text-rose-400',
                                  )}
                                >
                                  {bot.unrealizedPnlUsd > 0 ? '+' : ''}
                                  {formatCurrency(bot.unrealizedPnlUsd)}
                                </div>
                                <div
                                  className={cx(
                                    'text-xs',
                                    isPositive ? 'text-emerald-400/80' : 'text-rose-400/80',
                                  )}
                                >
                                  {formatPercent(bot.unrealizedPnlPct)}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                  Running
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400">
                      <Icon icon="solar:cpu-bolt-linear" width={26} height={26} />
                    </div>
                    <div className="max-w-md">
                      <h3 className="text-lg font-medium text-zinc-100">No active strategies yet</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-500">
                        Launch your first Grid Bot from the dashboard. We will persist the bot
                        config and every planned trade in SQLite as soon as you start it.
                      </p>
                    </div>
                    <button
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-300/50 hover:bg-emerald-400/15"
                      type="button"
                      onClick={() => {
                        setCreateBotError(undefined)
                        setSelectedBotType('grid')
                        setIsCreateBotModalOpen(true)
                      }}
                    >
                      <Icon icon="solar:add-circle-linear" width={16} height={16} />
                      Create your first bot
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-center border-t border-zinc-800/50 bg-zinc-900/10 px-5 py-3">
                  <Link className="text-xs font-normal text-zinc-400 transition-colors hover:text-zinc-200" to="/bots">
                    View All Strategies
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <h2 className="mb-4 text-base font-medium tracking-tight text-zinc-100">System Event Log</h2>
              <div className="flex h-full min-h-[24rem] flex-col rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                <div className="relative flex-1 space-y-4 overflow-y-auto pr-2 text-sm font-normal">
                  <div className="pointer-events-none absolute left-0 right-2 top-0 h-4 bg-gradient-to-b from-zinc-900/80 to-transparent" />
                  {filteredActivityLog.length ? (
                    filteredActivityLog.map((log) => (
                      <div className="group flex items-start gap-3" key={log.id}>
                        <div
                          className={cx(
                            'mt-0.5',
                            log.color === 'emerald'
                              ? 'text-emerald-400'
                              : log.color === 'blue'
                                ? 'text-blue-400'
                                : log.color === 'rose'
                                  ? 'text-rose-400'
                                  : 'text-zinc-500',
                          )}
                        >
                          <Icon icon={log.icon} width={18} height={18} />
                        </div>
                        <div>
                          <p className="leading-relaxed text-zinc-300">
                            <span className="font-medium text-zinc-100">{log.title}</span>
                            <br />
                            <span>{log.detail}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">{log.time}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">No logs match your search.</p>
                  )}
                </div>

                <div className="mt-4 border-t border-zinc-800/50 pt-4">
                  <div className="relative">
                    <Icon
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                      icon="solar:magnifer-linear"
                      width={16}
                      height={16}
                    />
                    <input
                      aria-label="Search logs"
                      className="w-full rounded-md border border-zinc-800 bg-zinc-900/50 py-1.5 pl-9 pr-3 text-xs text-zinc-200 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                      placeholder="Search logs..."
                      type="text"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
      </ProtectedShell>

      {isCreateBotModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
          <button
            aria-label="Close new bot modal"
            className="absolute inset-0"
            type="button"
            onClick={() => {
              if (isCreatingBot) return
              setIsCreateBotModalOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.95fr]">
              <div className="border-b border-zinc-800/80 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_56%)] p-6 lg:border-b-0 lg:border-r">
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-400/80">
                  Strategy Launcher
                </p>
                <h2 className="mt-2 text-3xl font-medium tracking-tight text-zinc-100">
                  Which bot do you want to create?
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                  Pick a strategy card first. Grid and Rebalance are both wired end to end: the
                  dashboard posts the config to the backend, creates the active strategy, and
                  stores the generated paper trades in SQLite immediately.
                </p>

                <div className="mt-6 grid gap-4">
                  {botCatalog.map((bot) => {
                    const isSelected = bot.key === selectedBotType
                    return (
                      <button
                        className={cx(
                          'rounded-2xl border px-5 py-5 text-left transition',
                          bot.accent,
                          isSelected
                            ? 'border-zinc-100/20 shadow-[0_0_0_1px_rgba(244,244,245,0.14)]'
                            : 'border-zinc-800 hover:border-zinc-700',
                          !bot.availableNow && 'opacity-80',
                        )}
                        key={bot.key}
                        type="button"
                        onClick={() => {
                          setCreateBotError(undefined)
                          setSelectedBotType(bot.key)
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                              {bot.eyebrow}
                            </p>
                            <h3 className="mt-2 text-xl font-medium text-zinc-100">
                              {strategyLabels[bot.key]}
                            </h3>
                          </div>
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/60 text-zinc-100">
                            <Icon icon={bot.icon} width={20} height={20} />
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">{bot.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="p-6">
                {selectedBotType === 'grid' ? (
                  <form className="space-y-5" onSubmit={handleCreateBotSubmit}>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
                        Grid Bot Parameters
                      </p>
                      <h3 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">
                        Configure the range and ladder
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        These values define the BTC/USDT paper grid that will be started and
                        recorded as an active strategy.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">Lower price</span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50"
                          inputMode="decimal"
                          placeholder="84000"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={gridLowerPrice}
                          onChange={(event) => setGridLowerPrice(event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">Upper price</span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50"
                          inputMode="decimal"
                          placeholder="92000"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={gridUpperPrice}
                          onChange={(event) => setGridUpperPrice(event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">Grid levels</span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50"
                          inputMode="numeric"
                          type="number"
                          min="2"
                          step="1"
                          value={gridCount}
                          onChange={(event) => setGridCount(event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">Spacing (%)</span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50"
                          inputMode="decimal"
                          type="number"
                          min="0.01"
                          step="0.1"
                          value={gridSpacing}
                          onChange={(event) => setGridSpacing(event.target.value)}
                        />
                      </label>
                      <div className="sm:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-zinc-200">Stop loss</p>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">
                              Turn this on only if you want the grid to warn when price breaks below
                              your defined safety threshold.
                            </p>
                          </div>
                          <button
                            aria-checked={isGridStopLossEnabled}
                            aria-label="Toggle stop loss"
                            className={cx(
                              'relative inline-flex h-7 w-12 rounded-full transition-colors',
                              isGridStopLossEnabled ? 'bg-emerald-400' : 'bg-zinc-800',
                            )}
                            role="switch"
                            type="button"
                            onClick={() => setIsGridStopLossEnabled((current) => !current)}
                          >
                            <span
                              className={cx(
                                'absolute top-1 h-5 w-5 rounded-full transition-all',
                                isGridStopLossEnabled
                                  ? 'left-6 bg-zinc-950'
                                  : 'left-1 bg-zinc-500',
                              )}
                            />
                          </button>
                        </div>

                        {isGridStopLossEnabled ? (
                          <label className="mt-4 block">
                            <span className="mb-2 block text-sm font-medium text-zinc-300">
                              Stop loss (%)
                            </span>
                            <input
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50"
                              inputMode="decimal"
                              type="number"
                              min="0.01"
                              step="0.1"
                              value={gridStopLoss}
                              onChange={(event) => setGridStopLoss(event.target.value)}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-6 text-zinc-400">
                      Starting this bot creates a live dashboard entry and stores each planned grid
                      order in the paper-trading SQLite ledger.
                    </div>

                    {createBotError ? (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {createBotError}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                        disabled={isCreatingBot}
                        type="button"
                        onClick={() => setIsCreateBotModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
                        disabled={isCreatingBot}
                        type="submit"
                      >
                        {isCreatingBot ? 'Starting bot...' : 'Start bot'}
                      </button>
                    </div>
                  </form>
                ) : selectedBotType === 'rebalance' ? (
                  <form className="space-y-5" onSubmit={handleCreateBotSubmit}>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
                        Rebalance Parameters
                      </p>
                      <h3 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">
                        Keep allocation centered
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        The bot will monitor BTC exposure against your target mix and plan a paper
                        trade whenever drift breaches the threshold.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">
                          Target BTC allocation (%)
                        </span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/50"
                          inputMode="decimal"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={rebalanceTargetRatio}
                          onChange={(event) => setRebalanceTargetRatio(event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">
                          Drift threshold (%)
                        </span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/50"
                          inputMode="decimal"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={rebalanceThreshold}
                          onChange={(event) => setRebalanceThreshold(event.target.value)}
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-sm font-medium text-zinc-300">
                          Check interval (minutes)
                        </span>
                        <input
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/50"
                          inputMode="numeric"
                          type="number"
                          min="1"
                          step="1"
                          value={rebalanceInterval}
                          onChange={(event) => setRebalanceInterval(event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-6 text-zinc-400">
                      Starting this bot creates a live dashboard entry and stores the opening
                      rebalance paper trade in the same SQLite ledger used by the grid flow.
                    </div>

                    {createBotError ? (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {createBotError}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                        disabled={isCreatingBot}
                        type="button"
                        onClick={() => setIsCreateBotModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-300/60"
                        disabled={isCreatingBot}
                        type="submit"
                      >
                        {isCreatingBot ? 'Starting bot...' : 'Start bot'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex h-full min-h-96 flex-col justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-400">
                      <Icon icon="solar:clock-circle-linear" width={24} height={24} />
                    </div>
                    <h3 className="mt-5 text-2xl font-medium tracking-tight text-zinc-100">
                      {strategyLabels[selectedBotType]} is next in line
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      The selection card is here already, but the parameter form and backend start
                      flow are only wired for Grid Bot in this pass.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isDepositModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
          <button
            aria-label="Close deposit modal"
            className="absolute inset-0"
            type="button"
            onClick={() => {
              if (isDepositing) return
              setIsDepositModalOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
            <div className="border-b border-zinc-800/80 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_55%)] px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-400/80">
                Paper Wallet
              </p>
              <h2 className="mt-2 text-2xl font-medium tracking-tight text-zinc-100">
                Deposit USD
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                New paper-trading users start with $100. Add more virtual capital whenever you
                need it.
              </p>
            </div>

            <form className="space-y-5 px-6 py-6" onSubmit={handleDepositSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Amount in USD</span>
                <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/80 px-4">
                  <span className="text-lg text-zinc-500">$</span>
                  <input
                    className="w-full bg-transparent px-3 py-4 text-lg text-zinc-100 outline-none placeholder:text-zinc-600"
                    inputMode="decimal"
                    placeholder="100.00"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                  />
                </div>
              </label>

              {depositError ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {depositError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                  disabled={isDepositing}
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
                  disabled={isDepositing}
                  type="submit"
                >
                  {isDepositing ? 'Depositing...' : 'Deposit funds'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
