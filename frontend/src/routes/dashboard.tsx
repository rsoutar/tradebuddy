import { useState } from 'react'
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

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
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

  // Mock data for the redesigned dashboard
  const metricsData = {
    totalBalance: dashboard.capitalUsd,
    balanceChange: 2.4,
    profit24h: 842.50,
    trades24h: 14,
    activeBots: activeBots,
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

  const botStrategies = [
    { 
      id: 'trend-v1', 
      name: 'Trend Follower V1', 
      pair: 'BTC/USDT', 
      exchange: 'Binance', 
      strategy: 'EMA Crossover',
      uptime: '14d 2h',
      pnl: 342.10,
      pnlPercent: 1.2,
      status: 'running',
      icon: 'solar:chart-line-linear',
      color: 'blue'
    },
    { 
      id: 'grid-infinity', 
      name: 'Grid Infinity', 
      pair: 'ETH/USDT', 
      exchange: 'Kraken', 
      strategy: 'Grid Trading',
      uptime: '45d 10h',
      pnl: 89.05,
      pnlPercent: 0.4,
      status: 'running',
      icon: 'solar:maximize-square-linear',
      color: 'purple'
    },
    { 
      id: 'sniper-sol', 
      name: 'Sniper SOL', 
      pair: 'SOL/USDT', 
      exchange: 'Binance', 
      strategy: 'Breakout',
      uptime: 'Stopped',
      pnl: 0,
      pnlPercent: 0,
      status: 'stopped',
      icon: 'solar:bolt-linear',
      color: 'zinc'
    },
  ]

  const activityLog = [
    { 
      id: 1, 
      icon: 'solar:check-circle-linear', 
      color: 'emerald',
      title: 'Trend Follower V1', 
      action: 'BUY',
      detail: 'executed order for 0.045 BTC at $34,210.50',
      time: '2 mins ago'
    },
    { 
      id: 2, 
      icon: 'solar:info-circle-linear', 
      color: 'blue',
      title: 'Grid Infinity', 
      action: '',
      detail: 'placed limit sell at $1,850.00',
      time: '15 mins ago'
    },
    { 
      id: 3, 
      icon: 'solar:refresh-linear', 
      color: 'zinc',
      title: 'System', 
      action: '',
      detail: 'synced with Binance API successfully. Latency: 45ms',
      time: '1 hour ago'
    },
    { 
      id: 4, 
      icon: 'solar:danger-triangle-linear', 
      color: 'rose',
      title: 'Sniper SOL', 
      action: '',
      detail: 'stopped manually by user',
      time: '3 hours ago'
    },
    { 
      id: 5, 
      icon: 'solar:check-circle-linear', 
      color: 'emerald',
      title: 'Trend Follower V1', 
      action: 'SELL',
      detail: 'executed order for 0.045 BTC at $34,500.00',
      profit: 13.02,
      time: '5 hours ago'
    },
  ]

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

  const containerStyle: React.CSSProperties = {
    backgroundImage: 'radial-gradient(circle at 50% 0%, #18181b 0%, #09090b 100%)',
    height: '100vh',
    color: '#d4d4d8',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    display: 'flex',
    overflow: 'hidden',
  }

  const sidebarStyle: React.CSSProperties = {
    width: '256px',
    borderRight: '1px solid rgba(39, 39, 42, 0.6)',
    backgroundColor: 'rgba(9, 9, 11, 0.5)',
    backdropFilter: 'blur(24px)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20,
    flexShrink: 0,
  }

  const mainContentStyle: React.CSSProperties = {
    flex: '1 1 0%',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    backgroundColor: 'transparent',
  }

  return (
    <div style={containerStyle}>
      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 30,
          }}
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className="dashboard-sidebar" style={{
        ...sidebarStyle,
        position: isMenuOpen ? 'fixed' : 'relative',
        left: isMenuOpen ? 0 : undefined,
        height: '100vh',
        transform: isMenuOpen ? 'translateX(0)' : undefined,
        transition: 'transform 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          borderBottom: '1px solid rgba(39, 39, 42, 0.6)',
        }}>
          <span style={{
            color: '#fafafa',
            fontSize: '1.125rem',
            fontWeight: 500,
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
          }}>Nexus</span>
          <span style={{
            marginLeft: '8px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: '#27272a',
            color: '#a1a1aa',
            fontSize: '0.75rem',
            fontWeight: 400,
          }}>v2.4</span>
        </div>

        {/* Navigation */}
        <nav style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <p style={{
            padding: '0 12px',
            fontSize: '0.75rem',
            fontWeight: 400,
            color: '#71717a',
            marginBottom: '8px',
            marginTop: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>Platform</p>
          
          {navigationItems.map((item) => (
            item.to ? (
              <Link
                key={item.id}
                to={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: item.id === 'dashboard' ? '#fafafa' : '#a1a1aa',
                  backgroundColor: item.id === 'dashboard' ? 'rgba(39, 39, 42, 0.5)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  fontSize: '0.875rem',
                }}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon icon={item.icon} width={20} height={20} />
                <span>{item.label}</span>
                {item.badge && (
                  <span style={{
                    marginLeft: 'auto',
                    backgroundColor: '#27272a',
                    color: '#d4d4d8',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                  }}>{item.badge}</span>
                )}
              </Link>
            ) : (
              <button
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon icon={item.icon} width={20} height={20} />
                <span>{item.label}</span>
              </button>
            )
          ))}

          <p style={{
            padding: '0 12px',
            fontSize: '0.75rem',
            fontWeight: 400,
            color: '#71717a',
            marginBottom: '8px',
            marginTop: '32px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>Connections</p>
          
          {connectionItems.map((item) => (
            <button
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                color: '#a1a1aa',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.875rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon icon={item.icon} width={20} height={20} />
              <span>{item.label}</span>
            </button>
          ))}

          <p style={{
            padding: '0 12px',
            fontSize: '0.75rem',
            fontWeight: 400,
            color: '#71717a',
            marginBottom: '8px',
            marginTop: '32px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>System</p>
          
          {systemItems.map((item) => (
            item.to ? (
              <Link
                key={item.id}
                to={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  fontSize: '0.875rem',
                }}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon icon={item.icon} width={20} height={20} />
                <span>{item.label}</span>
              </Link>
            ) : (
              <button
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon icon={item.icon} width={20} height={20} />
                <span>{item.label}</span>
              </button>
            )
          ))}
        </nav>

        {/* User Profile */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid rgba(39, 39, 42, 0.6)',
        }}>
          <button
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              gap: '12px',
              padding: '8px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '9999px',
              backgroundColor: '#27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a1a1aa',
              border: '1px solid #3f3f46',
            }}>
              <Icon icon="solar:user-linear" width={18} height={18} />
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{
                fontSize: '0.875rem',
                fontWeight: 400,
                color: '#e4e4e7',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{loaderData.viewer.displayName}</p>
              <p style={{
                fontSize: '0.75rem',
                color: '#71717a',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>Pro Plan</p>
            </div>
            <Icon icon="solar:alt-arrow-up-linear" width={16} height={16} color="#71717a" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={mainContentStyle}>
        {/* Header */}
        <header style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid rgba(39, 39, 42, 0.6)',
          backgroundColor: 'rgba(9, 9, 11, 0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setIsMenuOpen(true)}
              className="mobile-menu-button"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                padding: '8px',
              }}
            >
              <Icon icon="solar:hamburger-menu-linear" width={24} height={24} />
            </button>
            <h1 style={{
              fontSize: '1.125rem',
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: '#fafafa',
              margin: 0,
            }}>Overview</h1>
            
            {/* Environment Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#18181b',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid #27272a',
            }}>
              <button style={{
                padding: '4px 12px',
                fontSize: '0.75rem',
                fontWeight: 400,
                borderRadius: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
              }}>Testnet</button>
              <button style={{
                padding: '4px 12px',
                fontSize: '0.75rem',
                fontWeight: 400,
                borderRadius: '4px',
                backgroundColor: '#27272a',
                border: '1px solid rgba(63, 63, 70, 0.5)',
                color: '#fafafa',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              }}>Live</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '9999px',
              border: '1px solid rgba(6, 78, 59, 0.3)',
              backgroundColor: 'rgba(6, 78, 59, 0.1)',
              color: '#10b981',
              fontSize: '0.75rem',
              fontWeight: 400,
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '9999px',
                backgroundColor: '#10b981',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }} />
              Binance API Connected
            </div>
            <button style={{
              position: 'relative',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '4px',
            }}>
              <Icon icon="solar:bell-linear" width={24} height={24} />
              {alertCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '9999px',
                  backgroundColor: '#f43f5e',
                }} />
              )}
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div style={{
          flex: '1 1 0%',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          overflowY: 'auto',
        }}>
          {/* Error Message */}
          {actionError && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: '#fb7185',
            }}>
              {actionError}
            </div>
          )}

          {/* Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px',
          }}>
            {/* Total Balance Card */}
            <div style={{
              backgroundColor: 'rgba(24, 24, 27, 0.4)',
              border: '1px solid rgba(39, 39, 42, 0.6)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                color: '#a1a1aa',
                marginBottom: '16px',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>Total Balance</span>
                <Icon icon="solar:wallet-linear" width={20} height={20} />
              </div>
              <div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 500,
                  letterSpacing: '-0.025em',
                  color: '#fafafa',
                }}>{formatCurrency(metricsData.totalBalance)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: '#34d399',
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    <Icon icon="solar:arrow-right-up-linear" width={12} height={12} style={{ marginRight: '2px' }} />
                    {formatPercent(metricsData.balanceChange)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 400 }}>vs last 24h</span>
                </div>
              </div>
            </div>

            {/* 24h Profit Card */}
            <div style={{
              backgroundColor: 'rgba(24, 24, 27, 0.4)',
              border: '1px solid rgba(39, 39, 42, 0.6)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                color: '#a1a1aa',
                marginBottom: '16px',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>24h Profit</span>
                <Icon icon="solar:graph-up-linear" width={20} height={20} />
              </div>
              <div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 500,
                  letterSpacing: '-0.025em',
                  color: '#34d399',
                }}>+{formatCurrency(metricsData.profit24h)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 400 }}>{metricsData.trades24h} trades executed</span>
                </div>
              </div>
            </div>

            {/* Active Bots Card */}
            <div style={{
              backgroundColor: 'rgba(24, 24, 27, 0.4)',
              border: '1px solid rgba(39, 39, 42, 0.6)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                color: '#a1a1aa',
                marginBottom: '16px',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>Active Bots</span>
                <Icon icon="solar:cpu-linear" width={20} height={20} />
              </div>
              <div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 500,
                  letterSpacing: '-0.025em',
                  color: '#fafafa',
                }}>
                  {metricsData.activeBots} <span style={{ fontSize: '1.125rem', color: '#52525b', fontWeight: 400 }}>/ {metricsData.totalBots}</span>
                </div>
                <div style={{ marginTop: '8px' }}>
                  <div style={{
                    width: '100%',
                    backgroundColor: '#27272a',
                    borderRadius: '9999px',
                    height: '6px',
                  }}>
                    <div style={{
                      backgroundColor: '#a1a1aa',
                      height: '6px',
                      borderRadius: '9999px',
                      width: `${(metricsData.activeBots / metricsData.totalBots) * 100}%`,
                    }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Win Rate Card */}
            <div style={{
              backgroundColor: 'rgba(24, 24, 27, 0.4)',
              border: '1px solid rgba(39, 39, 42, 0.6)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                color: '#a1a1aa',
                marginBottom: '16px',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>Win Rate (30d)</span>
                <Icon icon="solar:target-linear" width={20} height={20} />
              </div>
              <div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 500,
                  letterSpacing: '-0.025em',
                  color: '#fafafa',
                }}>{metricsData.winRate.toFixed(1)}%</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: '#fb7185',
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    backgroundColor: 'rgba(251, 113, 133, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    <Icon icon="solar:arrow-right-down-linear" width={12} height={12} style={{ marginRight: '2px' }} />
                    {Math.abs(metricsData.winRateChange).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 400 }}>vs previous 30d</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div style={{
            backgroundColor: 'rgba(24, 24, 27, 0.3)',
            border: '1px solid rgba(39, 39, 42, 0.5)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px',
              borderBottom: '1px solid rgba(39, 39, 42, 0.5)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}>
              <div>
                <h2 style={{
                  fontSize: '1rem',
                  fontWeight: 500,
                  color: '#fafafa',
                  letterSpacing: '-0.025em',
                  margin: 0,
                }}>Portfolio Performance</h2>
                <p style={{
                  fontSize: '0.75rem',
                  color: '#71717a',
                  margin: '4px 0 0',
                  fontWeight: 400,
                }}>Combined PnL across all active strategies</p>
              </div>
              {/* Timeframe Selector */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(24, 24, 27, 0.8)',
                borderRadius: '8px',
                padding: '2px',
                border: '1px solid #27272a',
                fontSize: '0.75rem',
                fontWeight: 400,
              }}>
                {['1H', '1D', '1W', '1M', 'ALL'].map((timeframe, idx) => (
                  <button
                    key={timeframe}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: idx === 2 ? '#27272a' : 'transparent',
                      border: idx === 2 ? '1px solid rgba(63, 63, 70, 0.5)' : 'none',
                      color: idx === 2 ? '#fafafa' : '#a1a1aa',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      boxShadow: idx === 2 ? '0 1px 2px rgba(0, 0, 0, 0.1)' : 'none',
                    }}
                  >
                    {timeframe}
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              height: '280px',
              position: 'relative',
            }}>
              {/* Y-Axis Labels */}
              <div style={{
                position: 'absolute',
                left: '20px',
                top: '20px',
                bottom: '48px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#52525b',
                fontWeight: 400,
                zIndex: 0,
              }}>
                <span>+$2k</span>
                <span>+$1k</span>
                <span>0</span>
                <span>-$1k</span>
              </div>
              
              {/* Horizontal Grid Lines */}
              <div style={{
                position: 'absolute',
                left: '56px',
                right: '20px',
                top: '24px',
                bottom: '48px',
                zIndex: 0,
                pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  borderTop: '1px dashed rgba(39, 39, 42, 0.3)',
                }} />
                <div style={{
                  position: 'absolute',
                  top: '33%',
                  left: 0,
                  right: 0,
                  borderTop: '1px dashed rgba(39, 39, 42, 0.3)',
                }} />
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  borderTop: '1px solid rgba(63, 63, 70, 0.5)',
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  borderTop: '1px dashed rgba(39, 39, 42, 0.3)',
                }} />
              </div>

              {/* Bar Chart */}
              <div style={{
                position: 'absolute',
                left: '56px',
                right: '20px',
                top: '24px',
                bottom: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '4px',
                zIndex: 10,
              }}>
                {chartData.map((data, idx) => (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      height: `${Math.min(Math.abs(data.value), 100)}%`,
                      backgroundColor: data.positive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
                      border: `1px solid ${data.positive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`,
                      borderRadius: '2px',
                      position: 'relative',
                      transform: data.value >= 0 ? 'translateY(-50%)' : 'translateY(50%)',
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                    }}
                    title={`${data.date}: ${data.positive ? '+' : ''}$${Math.abs(data.value * 10)}`}
                  />
                ))}
              </div>
              
              {/* X-Axis Labels */}
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '56px',
                right: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#52525b',
                fontWeight: 400,
              }}>
                <span>Nov 3</span>
                <span>Nov 6</span>
                <span>Nov 9</span>
                <span>Nov 12</span>
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: '32px',
          }}>
            {/* Active Strategies Table */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}>
                <h2 style={{
                  fontSize: '1rem',
                  fontWeight: 500,
                  color: '#fafafa',
                  letterSpacing: '-0.025em',
                  margin: 0,
                }}>Active Strategies</h2>
                <Link
                  to="/bots"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    backgroundColor: '#fafafa',
                    color: '#18181b',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <Icon icon="solar:add-circle-linear" width={16} height={16} />
                  New Bot
                </Link>
              </div>
              
              <div style={{
                backgroundColor: 'rgba(24, 24, 27, 0.3)',
                border: '1px solid rgba(39, 39, 42, 0.5)',
                borderRadius: '12px',
                overflow: 'hidden',
                flex: 1,
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    whiteSpace: 'nowrap',
                    borderCollapse: 'collapse',
                  }}>
                    <thead style={{
                      borderBottom: '1px solid rgba(39, 39, 42, 0.5)',
                      backgroundColor: 'rgba(24, 24, 27, 0.2)',
                      fontSize: '0.75rem',
                      color: '#71717a',
                      fontWeight: 400,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      <tr>
                        <th style={{ padding: '12px 20px' }}>Bot Name</th>
                        <th style={{ padding: '12px 20px' }}>Pair / Exchange</th>
                        <th style={{ padding: '12px 20px' }}>Strategy</th>
                        <th style={{ padding: '12px 20px', textAlign: 'right' }}>Unrealized PnL</th>
                        <th style={{ padding: '12px 20px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '12px 20px' }} />
                      </tr>
                    </thead>
                    <tbody style={{
                      borderTop: '1px solid rgba(39, 39, 42, 0.3)',
                    }}>
                      {botStrategies.map((bot) => (
                        <tr
                          key={bot.id}
                          style={{
                            transition: 'background-color 0.15s ease',
                            opacity: bot.status === 'stopped' ? 0.6 : 1,
                          }}
                        >
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                backgroundColor: bot.color === 'blue' ? 'rgba(59, 130, 246, 0.1)' : bot.color === 'purple' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(39, 39, 42, 1)',
                                border: `1px solid ${bot.color === 'blue' ? 'rgba(59, 130, 246, 0.2)' : bot.color === 'purple' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(63, 63, 70, 1)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: bot.color === 'blue' ? '#60a5fa' : bot.color === 'purple' ? '#c084fc' : '#71717a',
                              }}>
                                <Icon icon={bot.icon} width={18} height={18} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, color: bot.status === 'stopped' ? '#a1a1aa' : '#e4e4e7' }}>{bot.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#71717a' }}>Uptime: {bot.uptime}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 400, color: bot.status === 'stopped' ? '#71717a' : '#d4d4d8' }}>{bot.pair}</div>
                            <div style={{ fontSize: '0.75rem', color: '#71717a' }}>{bot.exchange}</div>
                          </td>
                          <td style={{ padding: '16px 20px', color: bot.status === 'stopped' ? '#71717a' : '#a1a1aa', fontWeight: 400, fontSize: '0.75rem' }}>
                            {bot.strategy}
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <div style={{ fontWeight: 500, color: bot.pnl >= 0 ? '#34d399' : '#fb7185' }}>
                              {bot.pnl >= 0 ? '+' : ''}{formatCurrency(bot.pnl)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: bot.pnl >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(251, 113, 133, 0.7)' }}>
                              {bot.pnl >= 0 ? '+' : ''}{bot.pnlPercent}%
                            </div>
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                            <label style={{
                              position: 'relative',
                              display: 'inline-flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                            }}>
                              <input
                                type="checkbox"
                                checked={bot.status === 'running'}
                                onChange={() => {}}
                                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                              />
                              <div style={{
                                width: '32px',
                                height: '16px',
                                backgroundColor: bot.status === 'running' ? '#d4d4d8' : '#27272a',
                                borderRadius: '9999px',
                                position: 'relative',
                                transition: 'background-color 0.15s ease',
                              }}>
                                <div style={{
                                  width: '12px',
                                  height: '12px',
                                  backgroundColor: bot.status === 'running' ? '#09090b' : '#71717a',
                                  borderRadius: '9999px',
                                  position: 'absolute',
                                  top: '2px',
                                  left: bot.status === 'running' ? '18px' : '2px',
                                  transition: 'all 0.15s ease',
                                  border: `1px solid ${bot.status === 'running' ? '#09090b' : '#71717a'}`,
                                }} />
                              </div>
                            </label>
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <button style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#71717a',
                              cursor: 'pointer',
                              padding: '4px',
                            }}>
                              <Icon icon="solar:menu-dots-linear" width={18} height={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  padding: '12px 20px',
                  borderTop: '1px solid rgba(39, 39, 42, 0.5)',
                  backgroundColor: 'rgba(24, 24, 27, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Link
                    to="/bots"
                    style={{
                      fontSize: '0.75rem',
                      color: '#a1a1aa',
                      textDecoration: 'none',
                      fontWeight: 400,
                      transition: 'color 0.15s ease',
                    }}
                  >
                    View All Strategies
                  </Link>
                </div>
              </div>
            </div>

            {/* System Event Log */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{
                fontSize: '1rem',
                fontWeight: 500,
                color: '#fafafa',
                letterSpacing: '-0.025em',
                margin: '0 0 16px',
              }}>System Event Log</h2>
              <div style={{
                backgroundColor: 'rgba(24, 24, 27, 0.3)',
                border: '1px solid rgba(39, 39, 42, 0.5)',
                borderRadius: '12px',
                padding: '20px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                height: '380px',
              }}>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  paddingRight: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                  position: 'relative',
                }}>
                  {/* Gradient fade at top */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    right: '8px',
                    top: 0,
                    height: '16px',
                    background: 'linear-gradient(to bottom, rgba(24, 24, 27, 0.3), transparent)',
                    pointerEvents: 'none',
                  }} />
                  
                  {activityLog.map((log) => (
                    <div key={log.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{
                        marginTop: '2px',
                        color: log.color === 'emerald' ? '#34d399' : log.color === 'blue' ? '#60a5fa' : log.color === 'rose' ? '#fb7185' : '#71717a',
                      }}>
                        <Icon icon={log.icon} width={20} height={20} />
                      </div>
                      <div>
                        <p style={{
                          color: '#d4d4d8',
                          lineHeight: 1.6,
                          margin: 0,
                        }}>
                          <span style={{ color: '#fafafa', fontWeight: 500 }}>{log.title}</span>
                          {' '}{log.action && <span style={{ color: log.action === 'BUY' ? '#34d399' : '#fb7185' }}>{log.action}</span>}{' '}
                          {log.detail}
                          {log.profit && (
                            <><br /><span style={{ fontSize: '0.75rem', color: '#34d399' }}>Profit: +${log.profit}</span></>
                          )}
                        </p>
                        <p style={{
                          fontSize: '0.75rem',
                          color: '#71717a',
                          margin: '2px 0 0',
                        }}>{log.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(39, 39, 42, 0.5)',
                }}>
                  {/* Search Input */}
                  <div style={{ position: 'relative' }}>
                    <Icon 
                      icon="solar:magnifer-linear" 
                      width={18} 
                      height={18} 
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#71717a',
                      }}
                    />
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      placeholder="Search logs..."
                      style={{
                        width: '100%',
                        backgroundColor: 'rgba(24, 24, 27, 0.5)',
                        border: '1px solid #27272a',
                        borderRadius: '6px',
                        padding: '6px 12px 6px 36px',
                        fontSize: '0.75rem',
                        color: '#e4e4e7',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '16px',
            backgroundColor: 'rgba(24, 24, 27, 0.4)',
            border: '1px solid rgba(39, 39, 42, 0.6)',
            borderRadius: '12px',
          }}>
            <button
              onClick={() => void handlePaperRun()}
              disabled={isRunningBot}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                color: '#1c1611',
                fontWeight: 600,
                cursor: isRunningBot ? 'progress' : 'pointer',
                opacity: isRunningBot ? 0.7 : 1,
                boxShadow: '0 8px 16px rgba(245, 158, 11, 0.25)',
                transition: 'all 0.15s ease',
              }}
            >
              {isRunningBot ? 'Running paper bot...' : `Start ${strategyLabels[selectedBot.key]}`}
            </button>
            <button
              onClick={() => void handleBacktest()}
              disabled={isBacktesting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#fff',
                fontWeight: 600,
                cursor: isBacktesting ? 'progress' : 'pointer',
                opacity: isBacktesting ? 0.7 : 1,
                boxShadow: '0 8px 16px rgba(5, 150, 105, 0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              {isBacktesting ? 'Backtesting...' : 'Run backtest'}
            </button>
            <button
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '8px',
                border: '1px solid rgba(39, 39, 42, 0.6)',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#d4d4d8',
                fontWeight: 600,
                cursor: isRefreshing ? 'progress' : 'pointer',
                opacity: isRefreshing ? 0.7 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  )
}
