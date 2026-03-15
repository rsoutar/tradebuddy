import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Icon } from '@iconify/react'
import type { DashboardState, StrategyKey } from '../lib/session'
import {
  depositPaperFunds,
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
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>(
    loaderData.dashboard.activeStrategy,
  )
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRunningBot, setIsRunningBot] = useState(false)
  const [isBacktesting, setIsBacktesting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositError, setDepositError] = useState<string>()
  const [isDepositing, setIsDepositing] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [searchValue, setSearchValue] = useState('')
  const viewerSubtitle =
    loaderData.viewer.statusMessage || `@${loaderData.viewer.userId.slice(0, 10)}`

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

        <div className="relative border-t border-zinc-800/60 p-4">
          {isProfileMenuOpen ? (
            <button
              aria-label="Close profile menu"
              className="fixed inset-0 z-20"
              type="button"
              onClick={() => setIsProfileMenuOpen(false)}
            />
          ) : null}

          {isProfileMenuOpen ? (
            <div className="absolute bottom-[calc(100%-0.5rem)] left-4 right-4 z-30 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
              <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-4">
                {loaderData.viewer.pictureUrl ? (
                  <img
                    alt={`${loaderData.viewer.displayName} avatar`}
                    className="h-11 w-11 rounded-xl object-cover ring-1 ring-zinc-700/70"
                    src={loaderData.viewer.pictureUrl}
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-100 ring-1 ring-zinc-700/70">
                    {loaderData.viewer.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {loaderData.viewer.displayName}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{viewerSubtitle}</p>
                </div>
              </div>

              <div className="p-2">
                {[
                  { label: 'Account', icon: 'solar:user-circle-linear' },
                  { label: 'Billing', icon: 'solar:wallet-money-linear' },
                  { label: 'Notifications', icon: 'solar:bell-linear' },
                ].map((item) => (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-100"
                    key={item.label}
                    type="button"
                    onClick={() => setIsProfileMenuOpen(false)}
                  >
                    <Icon icon={item.icon} width={17} height={17} className="text-zinc-500" />
                    <span>{item.label}</span>
                  </button>
                ))}

                <div className="my-2 border-t border-zinc-800/80" />

                <button
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-rose-500/10 hover:text-rose-200"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false)
                    void handleLogout()
                  }}
                >
                  <Icon icon="solar:logout-2-linear" width={17} height={17} className="text-zinc-500" />
                  <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
                </button>
              </div>
            </div>
          ) : null}

          <button
            aria-expanded={isProfileMenuOpen}
            className="relative z-30 flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
            disabled={isLoggingOut}
            type="button"
            onClick={() => {
              setIsProfileMenuOpen((current) => !current)
            }}
          >
            {loaderData.viewer.pictureUrl ? (
              <img
                alt={`${loaderData.viewer.displayName} avatar`}
                className="h-10 w-10 rounded-xl object-cover ring-1 ring-zinc-700/70"
                src={loaderData.viewer.pictureUrl}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-100 ring-1 ring-zinc-700/70">
                {loaderData.viewer.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-zinc-100">
                {loaderData.viewer.displayName}
              </p>
              <p className="truncate text-xs text-zinc-500">{viewerSubtitle}</p>
            </div>
            <Icon
              icon="solar:menu-dots-bold"
              width={18}
              height={18}
              className={cx(
                'shrink-0 text-zinc-500 transition-colors',
                isProfileMenuOpen && 'text-zinc-300',
              )}
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
        </div>
      </main>

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
    </div>
  )
}
