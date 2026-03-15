import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import type { DashboardState, StrategyKey } from '../lib/session'
import {
  getDashboard,
  getViewer,
  runBacktest,
  runPaperTrading,
} from '../lib/session'

const strategyLabels: Record<StrategyKey, string> = {
  grid: 'Grid Bot',
  rebalance: 'Rebalance Bot',
  'infinity-grid': 'Infinity Grid',
}

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const viewer = await getViewer()

    if (!viewer.authenticated) {
      throw redirect({ to: '/' })
    }
  },
  loader: () => getDashboard(),
  component: DashboardPage,
})

function DashboardPage() {
  const loaderData = Route.useLoaderData()
  const [dashboard, setDashboard] = useState<DashboardState>(loaderData.dashboard)
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>(
    loaderData.dashboard.activeStrategy,
  )
  const [isRunningBot, setIsRunningBot] = useState(false)
  const [isBacktesting, setIsBacktesting] = useState(false)
  const [actionError, setActionError] = useState<string>()

  const totalPaperPnl =
    dashboard.bots.reduce((sum, bot) => sum + bot.paperPnlPct, 0) / dashboard.bots.length
  const averageWinRate =
    dashboard.bots.reduce((sum, bot) => sum + bot.winRatePct, 0) / dashboard.bots.length
  const selectedBot = dashboard.bots.find((bot) => bot.key === selectedStrategy) ?? dashboard.bots[0]

  async function handlePaperRun() {
    try {
      setActionError(undefined)
      setIsRunningBot(true)
      const nextDashboard = await runPaperTrading({ data: { strategy: selectedStrategy } })
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
      const nextDashboard = await runBacktest({ data: { strategy: selectedStrategy } })
      setDashboard(nextDashboard)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to run the backtest.')
    } finally {
      setIsBacktesting(false)
    }
  }

  return (
    <div className="page">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <p className="eyebrow">Dashboard</p>
          <h2>{loaderData.viewer.displayName}&apos;s trading command center.</h2>
          <p className="lede">
            Launch paper trading, replay backtests, and watch the bot metrics move without leaving
            the dashboard.
          </p>
          {actionError ? <p className="inline-alert">{actionError}</p> : null}
        </div>
        <div className="account-card">
          <div className="account-card-head">
            <div>
              <p className="eyebrow">Signed in via LINE</p>
              <strong>{loaderData.viewer.displayName}</strong>
            </div>
            {loaderData.viewer.pictureUrl ? (
              <img
                className="profile-avatar"
                src={loaderData.viewer.pictureUrl}
                alt={loaderData.viewer.displayName}
              />
            ) : (
              <div className="profile-avatar profile-avatar-fallback">
                {loaderData.viewer.displayName.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="account-meta">
            <div>
              <span>Simulation capital</span>
              <strong>${dashboard.capitalUsd.toLocaleString()}</strong>
            </div>
            <div>
              <span>Paper runs</span>
              <strong>{dashboard.paperRunCount}</strong>
            </div>
            <div>
              <span>Active strategy</span>
              <strong>{strategyLabels[dashboard.activeStrategy]}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="content-grid metrics-grid">
        <article className="metric-card">
          <span>Average paper PnL</span>
          <strong>{totalPaperPnl.toFixed(2)}%</strong>
          <small>Across all configured paper-trading bots</small>
        </article>
        <article className="metric-card">
          <span>Average win rate</span>
          <strong>{averageWinRate.toFixed(1)}%</strong>
          <small>Model hit-rate from the latest evaluation window</small>
        </article>
        <article className="metric-card">
          <span>Backtest status</span>
          <strong>{dashboard.lastBacktest ? 'Fresh result' : 'Waiting to run'}</strong>
          <small>
            {dashboard.lastBacktest
              ? `${strategyLabels[dashboard.lastBacktest.strategy]} · ${dashboard.lastBacktest.periodLabel}`
              : 'Pick a strategy and run a new backtest'}
          </small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel control-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Controls</p>
              <h3>Run the bot or backtest it.</h3>
            </div>
            <span className="pill-tag">{selectedBot.mode}</span>
          </div>
          <p className="panel-copy">{selectedBot.summary}</p>

          <div className="strategy-selector" role="list">
            {dashboard.bots.map((bot) => (
              <button
                key={bot.key}
                type="button"
                className={`strategy-button${selectedStrategy === bot.key ? ' selected' : ''}`}
                onClick={() => {
                  setSelectedStrategy(bot.key)
                }}
              >
                <span>{bot.name}</span>
                <strong>{bot.paperPnlPct.toFixed(2)}%</strong>
              </button>
            ))}
          </div>

          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void handlePaperRun()
              }}
              disabled={isRunningBot}
            >
              {isRunningBot ? 'Running paper bot...' : 'Run paper trading'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void handleBacktest()
              }}
              disabled={isBacktesting}
            >
              {isBacktesting ? 'Backtesting...' : 'Run backtest'}
            </button>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span>Status</span>
              <strong>{selectedBot.status.replace('-', ' ')}</strong>
            </div>
            <div className="detail-card">
              <span>Sharpe ratio</span>
              <strong>{selectedBot.sharpeRatio.toFixed(2)}</strong>
            </div>
            <div className="detail-card">
              <span>Last signal</span>
              <strong>{selectedBot.lastSignal}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Bot Metrics</p>
              <h3>Strategy scorecard</h3>
            </div>
          </div>
          <div className="table-card">
            <div className="table-head">
              <span>Bot</span>
              <span>PnL</span>
              <span>Win rate</span>
              <span>Drawdown</span>
            </div>
            {dashboard.bots.map((bot) => (
              <div className="table-row" key={bot.key}>
                <span>{bot.name}</span>
                <strong>{bot.paperPnlPct.toFixed(2)}%</strong>
                <span>{bot.winRatePct.toFixed(1)}%</span>
                <span>{bot.maxDrawdownPct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Latest Backtest</p>
              <h3>Performance snapshot</h3>
            </div>
          </div>
          {dashboard.lastBacktest ? (
            <div className="backtest-grid">
              <div className="backtest-hero">
                <span>{strategyLabels[dashboard.lastBacktest.strategy]}</span>
                <strong>{dashboard.lastBacktest.roiPct.toFixed(2)}% ROI</strong>
                <small>{dashboard.lastBacktest.periodLabel}</small>
              </div>
              <div className="detail-grid">
                <div className="detail-card">
                  <span>Annualized</span>
                  <strong>{dashboard.lastBacktest.annualizedPct.toFixed(2)}%</strong>
                </div>
                <div className="detail-card">
                  <span>Profit factor</span>
                  <strong>{dashboard.lastBacktest.profitFactor.toFixed(2)}</strong>
                </div>
                <div className="detail-card">
                  <span>Trades</span>
                  <strong>{dashboard.lastBacktest.trades}</strong>
                </div>
                <div className="detail-card">
                  <span>Max drawdown</span>
                  <strong>{dashboard.lastBacktest.maxDrawdownPct.toFixed(2)}%</strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="panel-copy">Run a backtest to populate the performance summary.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Bot Activity</p>
              <h3>Recent events</h3>
            </div>
          </div>
          <div className="event-list">
            {dashboard.events.map((event) => (
              <article className={`event-card event-${event.tone}`} key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
                <span>{event.timeLabel}</span>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
