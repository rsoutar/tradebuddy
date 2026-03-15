import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Icon } from '@iconify/react'
import type { DashboardState, StrategyKey } from '../lib/session'
import {
  getDashboard,
  getViewer,
  logoutViewer,
  runBacktest,
  runPaperTrading,
} from '../lib/session'

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'solar:widget-5-linear', to: '/dashboard' },
  { id: 'bots', label: 'Active Bots', icon: 'solar:cpu-linear', to: '/bots', badge: '4' },
  { id: 'backtest', label: 'Backtesting', icon: 'solar:chart-square-linear' },
  { id: 'history', label: 'Trade History', icon: 'solar:history-linear' },
]

const connectionItems = [
  { id: 'exchanges', label: 'Exchanges', icon: 'solar:wallet-money-linear' },
  { id: 'api', label: 'API Keys', icon: 'solar:key-square-linear' },
]

const systemItems = [
  { id: 'logs', label: 'System Logs', icon: 'solar:document-text-linear' },
  { id: 'settings', label: 'Settings', icon: 'solar:settings-linear', to: '/onboarding' },
]

const strategyLabels: Record<StrategyKey, string> = {
  grid: 'Grid Bot',
  rebalance: 'Rebalance Bot',
  'infinity-grid': 'Infinity Grid',
}

const strategyPresentation: Record<
  StrategyKey,
  {
    id: string
    name: string
    pair: string
    exchange: string
    strategy: string
    uptime: string
    icon: string
    tone: 'blue' | 'purple' | 'zinc'
    pnl: number
    pnlPercent: number
  }
> = {
  grid: {
    id: 'trend-v1',
    name: 'Trend Follower V1',
    pair: 'BTC/USDT',
    exchange: 'Binance',
    strategy: 'EMA Crossover',
    uptime: '14d 2h',
    icon: 'solar:chart-line-linear',
    tone: 'blue',
    pnl: 342.1,
    pnlPercent: 1.2,
  },
  'infinity-grid': {
    id: 'grid-infinity',
    name: 'Grid Infinity',
    pair: 'ETH/USDT',
    exchange: 'Kraken',
    strategy: 'Grid Trading',
    uptime: '45d 10h',
    icon: 'solar:maximize-square-linear',
    tone: 'purple',
    pnl: 89.05,
    pnlPercent: 0.4,
  },
  rebalance: {
    id: 'sniper-sol',
    name: 'Sniper SOL',
    pair: 'SOL/USDT',
    exchange: 'Binance',
    strategy: 'Breakout',
    uptime: 'Stopped',
    icon: 'solar:bolt-linear',
    tone: 'zinc',
    pnl: 0,
    pnlPercent: 0,
  },
}

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
    const viewer = await getViewer()

    if (!viewer.authenticated) {
      // @ts-expect-error - Router type issue
      throw redirect({ to: '/' })
    }
  },
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

function SidebarItem({
  item,
  active = false,
  onClick,
}: {
  item: { label: string; icon: string; to?: string; badge?: string }
  active?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <Icon icon={item.icon} width={18} height={18} className="shrink-0" />
      <span>{item.label}</span>
      {item.badge ? (
        <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          {item.badge}
        </span>
      ) : null}
    </>
  )

  const classes = cx(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    active
      ? 'bg-zinc-800/50 text-zinc-100'
      : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-100',
  )

  if (item.to) {
    return (
      <Link className={classes} to={item.to} onClick={onClick}>
        {content}
      </Link>
    )
  }

  return (
    <button className={cx(classes, 'w-full text-left')} type="button" onClick={onClick}>
      {content}
    </button>
  )
}

function MetricCard({
  label,
  value,
  icon,
  accent,
  change,
  footer,
  progress,
}: {
  label: string
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
        <span className="text-sm font-normal">{label}</span>
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
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>(
    loaderData.dashboard.activeStrategy,
  )
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRunningBot, setIsRunningBot] = useState(false)
  const [isBacktesting, setIsBacktesting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [searchValue, setSearchValue] = useState('')

  const selectedBot = dashboard.bots.find((bot) => bot.key === selectedStrategy) ?? dashboard.bots[0]
  const activeBots = dashboard.bots.filter((bot) => bot.status === 'paper-running').length
  const alertCount = dashboard.events.filter((event) => event.tone !== 'neutral').length

  const metricsData = {
    totalBalance: dashboard.capitalUsd,
    balanceChange: 2.4,
    profit24h: 842.5,
    trades24h: 14,
    activeBots,
    totalBots: dashboard.bots.length,
    winRate: 68.2,
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

  const botStrategies = dashboard.bots.map((bot) => {
    const presentation = strategyPresentation[bot.key]
    return {
      ...presentation,
      key: bot.key,
      status: bot.status === 'idle' ? 'stopped' : 'running',
    }
  })

  const activityLog = [
    {
      id: 1,
      icon: 'solar:check-circle-linear',
      color: 'emerald',
      title: 'Trend Follower V1',
      action: 'BUY',
      detail: 'executed order for 0.045 BTC at $34,210.50',
      time: '2 mins ago',
    },
    {
      id: 2,
      icon: 'solar:info-circle-linear',
      color: 'blue',
      title: 'Grid Infinity',
      action: '',
      detail: 'placed limit sell at $1,850.00',
      time: '15 mins ago',
    },
    {
      id: 3,
      icon: 'solar:refresh-linear',
      color: 'zinc',
      title: 'System',
      action: '',
      detail: 'synced with Binance API successfully. Latency: 45ms',
      time: '1 hour ago',
    },
    {
      id: 4,
      icon: 'solar:danger-triangle-linear',
      color: 'rose',
      title: 'Sniper SOL',
      action: '',
      detail: 'stopped manually by user',
      time: '3 hours ago',
    },
    {
      id: 5,
      icon: 'solar:check-circle-linear',
      color: 'emerald',
      title: 'Trend Follower V1',
      action: 'SELL',
      detail: 'executed order for 0.045 BTC at $34,500.00',
      profit: 13.02,
      time: '5 hours ago',
    },
  ]

  const filteredActivityLog = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    if (!needle) return activityLog

    return activityLog.filter((log) =>
      `${log.title} ${log.action} ${log.detail} ${log.time}`.toLowerCase().includes(needle),
    )
  }, [activityLog, searchValue])

  async function handlePaperRun() {
    try {
      setActionError(undefined)
      setIsRunningBot(true)
      const nextDashboard = await runPaperTrading({
        // @ts-ignore
        data: { strategy: selectedStrategy },
      })
      setDashboard(nextDashboard)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to start paper trading.')
    } finally {
      setIsRunningBot(false)
    }
  }

  async function handleBacktest() {
    try {
      setActionError(undefined)
      setIsBacktesting(true)
      const nextDashboard = await runBacktest({
        // @ts-ignore
        data: { strategy: selectedStrategy },
      })
      setDashboard(nextDashboard)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to run the backtest.')
    } finally {
      setIsBacktesting(false)
    }
  }

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      await logoutViewer()
      window.location.assign('/')
    } finally {
      setIsLoggingOut(false)
    }
  }

  async function handleRefresh() {
    try {
      setActionError(undefined)
      setIsRefreshing(true)
      const nextDashboard = await getDashboard()
      setDashboard(nextDashboard.dashboard)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to refresh the dashboard.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-300 font-sans antialiased selection:bg-zinc-800 selection:text-zinc-100"
      style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #18181b 0%, #09090b 100%)' }}
    >
      {isMenuOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          type="button"
          onClick={() => setIsMenuOpen(false)}
        />
      ) : null}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-zinc-800/60 bg-zinc-950/50 backdrop-blur-xl transition-transform duration-300 md:static md:z-20 md:translate-x-0',
          isMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center border-b border-zinc-800/60 px-6">
          <span className="text-lg font-medium uppercase tracking-tighter text-zinc-100">Nexus</span>
          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-normal text-zinc-400">
            v2.4
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 text-sm font-normal">
          <p className="mb-2 mt-4 px-3 text-xs font-normal uppercase tracking-widest text-zinc-500">
            Platform
          </p>
          {navigationItems.map((item) => (
            <SidebarItem
              active={item.id === 'dashboard'}
              item={item}
              key={item.id}
              onClick={() => setIsMenuOpen(false)}
            />
          ))}

          <p className="mb-2 mt-8 px-3 text-xs font-normal uppercase tracking-widest text-zinc-500">
            Connections
          </p>
          {connectionItems.map((item) => (
            <SidebarItem item={item} key={item.id} />
          ))}

          <p className="mb-2 mt-8 px-3 text-xs font-normal uppercase tracking-widest text-zinc-500">
            System
          </p>
          {systemItems.map((item) => (
            <SidebarItem item={item} key={item.id} onClick={() => setIsMenuOpen(false)} />
          ))}
        </nav>

        <div className="border-t border-zinc-800/60 p-4">
          <button
            className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-zinc-800/30"
            disabled={isLoggingOut}
            type="button"
            onClick={() => {
              void handleLogout()
            }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400">
              <Icon icon="solar:user-linear" width={16} height={16} />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-normal text-zinc-200">
                {isLoggingOut ? 'Logging out...' : loaderData.viewer.displayName}
              </p>
              <p className="truncate text-xs text-zinc-500">Pro Plan</p>
            </div>
            <Icon
              icon="solar:alt-arrow-up-linear"
              width={16}
              height={16}
              className="text-zinc-500"
            />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-transparent">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-zinc-800/60 bg-zinc-950/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              className="text-zinc-400 transition-colors hover:text-zinc-100 md:hidden"
              type="button"
              onClick={() => setIsMenuOpen(true)}
            >
              <Icon icon="solar:hamburger-menu-linear" width={22} height={22} />
            </button>
            <h1 className="hidden text-lg font-medium tracking-tight text-zinc-100 sm:block">
              Overview
            </h1>
            <div className="hidden items-center rounded-md border border-zinc-800 bg-zinc-900 p-0.5 sm:flex">
              <button
                className="rounded px-3 py-1 text-xs font-normal text-zinc-400 transition-colors hover:text-zinc-200"
                type="button"
              >
                Testnet
              </button>
              <button
                className="rounded border border-zinc-700/50 bg-zinc-800 px-3 py-1 text-xs font-normal text-zinc-100 shadow-sm"
                type="button"
              >
                Live
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-900/30 bg-emerald-900/10 px-3 py-1.5 text-xs font-normal text-emerald-500 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Binance API Connected
            </div>
            <button className="relative p-1 text-zinc-400 transition-colors hover:text-zinc-100" type="button">
              <Icon icon="solar:bell-linear" width={20} height={20} />
              {alertCount > 0 ? (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
              ) : null}
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto p-4 sm:p-6 lg:p-8">
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
              value={formatCurrency(metricsData.totalBalance)}
            />
            <MetricCard
              accent="positive"
              footer={<span className="text-xs font-normal text-zinc-500">{metricsData.trades24h} trades executed</span>}
              icon="solar:graph-up-linear"
              label="24h Profit"
              value={`+${formatCurrency(metricsData.profit24h)}`}
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
                <Link
                  className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-normal text-zinc-900 transition-colors hover:bg-zinc-200"
                  to="/bots"
                >
                  <Icon icon="solar:add-circle-linear" width={16} height={16} />
                  New Bot
                </Link>
              </div>

              <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900/30">
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead className="border-b border-zinc-800/50 bg-zinc-900/20 text-xs font-normal uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-5 py-3">Bot Name</th>
                        <th className="px-5 py-3">Pair / Exchange</th>
                        <th className="px-5 py-3">Strategy</th>
                        <th className="px-5 py-3 text-right">Unrealized PnL</th>
                        <th className="px-5 py-3 text-center">Status</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {botStrategies.map((bot) => {
                        const tone = toneClasses(bot.tone)
                        const isSelected = bot.key === selectedStrategy
                        return (
                          <tr
                            className={cx(
                              'border-t border-zinc-800/30 transition-colors',
                              bot.status === 'stopped' && 'opacity-60',
                              isSelected ? 'bg-zinc-900/40' : 'hover:bg-zinc-900/20',
                            )}
                            key={bot.id}
                          >
                            <td className="px-5 py-4">
                              <button
                                className="flex items-center gap-3 text-left"
                                type="button"
                                onClick={() => setSelectedStrategy(bot.key)}
                              >
                                <div
                                  className={cx(
                                    'flex h-8 w-8 items-center justify-center rounded-md border',
                                    tone.box,
                                  )}
                                >
                                  <Icon className={tone.icon} icon={bot.icon} width={16} height={16} />
                                </div>
                                <div>
                                  <div className="font-medium text-zinc-200">{bot.name}</div>
                                  <div className="text-xs text-zinc-500">Uptime: {bot.uptime}</div>
                                </div>
                              </button>
                            </td>
                            <td className="px-5 py-4">
                              <div className="text-zinc-300">{bot.pair}</div>
                              <div className="text-xs text-zinc-500">{bot.exchange}</div>
                            </td>
                            <td className="px-5 py-4 text-zinc-400">{bot.strategy}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="font-medium text-emerald-400">
                                {bot.pnl > 0 ? '+' : ''}
                                {formatCurrency(bot.pnl)}
                              </div>
                              <div className="text-xs text-emerald-400/80">
                                {bot.pnlPercent > 0 ? '+' : ''}
                                {bot.pnlPercent}%
                              </div>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <button
                                aria-checked={bot.status === 'running'}
                                aria-label={`${bot.name} status`}
                                className={cx(
                                  'relative inline-flex h-5 w-9 rounded-full transition-colors',
                                  bot.status === 'running' ? 'bg-zinc-200' : 'bg-zinc-800',
                                )}
                                role="switch"
                                type="button"
                              >
                                <span
                                  className={cx(
                                    'absolute top-0.5 h-4 w-4 rounded-full border transition-all',
                                    bot.status === 'running'
                                      ? 'left-[18px] border-zinc-950 bg-zinc-950'
                                      : 'left-0.5 border-zinc-600 bg-zinc-500',
                                  )}
                                />
                              </button>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button className="p-1 text-zinc-500 transition-colors hover:text-zinc-300" type="button">
                                <Icon icon="solar:menu-dots-linear" width={18} height={18} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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
                            <span className="font-medium text-zinc-100">{log.title}</span>{' '}
                            {log.action ? (
                              <span className={log.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                                {log.action}
                              </span>
                            ) : null}{' '}
                            {log.detail}
                            {log.profit ? (
                              <>
                                <br />
                                <span className="text-xs text-emerald-400">Profit: +${log.profit}</span>
                              </>
                            ) : null}
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

          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="mb-4 flex flex-col gap-3 border-b border-zinc-800/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-medium tracking-tight text-zinc-100">Control Deck</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Selected strategy: {selectedBot ? strategyLabels[selectedBot.key] : 'Unavailable'} ·
                  last paper run {formatTimeAgo(dashboard.lastPaperRunAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboard.bots.map((bot) => (
                  <button
                    className={cx(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      bot.key === selectedStrategy
                        ? 'border-zinc-700 bg-zinc-100 text-zinc-900'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                    )}
                    key={bot.key}
                    type="button"
                    onClick={() => setSelectedStrategy(bot.key)}
                  >
                    {strategyLabels[bot.key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr_auto] lg:items-center">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Paper PnL</p>
                  <p className="mt-2 text-lg font-medium text-emerald-400">
                    +{selectedBot ? selectedBot.paperPnlPct.toFixed(2) : '0.00'}%
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Win Rate</p>
                  <p className="mt-2 text-lg font-medium text-zinc-100">
                    {selectedBot ? selectedBot.winRatePct.toFixed(1) : '0.0'}%
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Allocation</p>
                  <p className="mt-2 text-lg font-medium text-zinc-100">
                    {selectedBot ? selectedBot.allocationPct : 0}%
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 lg:justify-end">
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-400 px-5 text-sm font-semibold text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.2)] transition hover:bg-amber-300 disabled:cursor-progress disabled:opacity-70"
                  disabled={isRunningBot}
                  type="button"
                  onClick={() => {
                    void handlePaperRun()
                  }}
                >
                  {isRunningBot
                    ? 'Running paper bot...'
                    : `Start ${selectedBot ? strategyLabels[selectedBot.key] : 'Strategy'}`}
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(16,185,129,0.18)] transition hover:bg-emerald-400 disabled:cursor-progress disabled:opacity-70"
                  disabled={isBacktesting}
                  type="button"
                  onClick={() => {
                    void handleBacktest()
                  }}
                >
                  {isBacktesting ? 'Backtesting...' : 'Run backtest'}
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 bg-white/5 px-5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-progress disabled:opacity-70"
                  disabled={isRefreshing}
                  type="button"
                  onClick={() => {
                    void handleRefresh()
                  }}
                >
                  {isRefreshing ? 'Refreshing...' : 'Refresh data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
