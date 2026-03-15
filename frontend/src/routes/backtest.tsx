import { Icon } from '@iconify/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent } from 'react'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getDashboard, runBacktest, type BacktestSummary, type DashboardState } from '../lib/session'
import { Route as RootRoute } from './__root'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export const Route = createFileRoute('/backtest')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  staleTime: 60_000,
  preloadStaleTime: 60_000,
  shouldReload: false,
  loader: () => getDashboard(),
  component: BacktestPage,
})

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatCurrency(value?: number) {
  return currencyFormatter.format(value ?? 0)
}

function formatPercent(value?: number, digits = 2) {
  const safe = value ?? 0
  const sign = safe > 0 ? '+' : ''
  return `${sign}${safe.toFixed(digits)}%`
}

function formatNumber(value?: number, digits = 2) {
  return (value ?? 0).toFixed(digits)
}

function formatDateTime(value?: string) {
  if (!value) return 'Not available'
  return dateTimeFormatter.format(new Date(value))
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10)
}

function defaultBacktestWindow() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 90)
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  }
}

function MetricCard({
  label,
  value,
  accent,
  detail,
  icon,
}: {
  label: string
  value: string
  accent?: 'positive' | 'negative' | 'neutral'
  detail: string
  icon: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/70 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</span>
        <Icon icon={icon} className="text-zinc-500" width={18} height={18} />
      </div>
      <div
        className={cx(
          'mt-4 text-3xl font-semibold tracking-tight',
          accent === 'positive'
            ? 'text-emerald-300'
            : accent === 'negative'
              ? 'text-rose-300'
              : 'text-zinc-100',
        )}
      >
        {value}
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{detail}</p>
    </div>
  )
}

function BacktestPage() {
  const viewer = RootRoute.useLoaderData()
  const loaderData = Route.useLoaderData()
  const [dashboard, setDashboard] = useState<DashboardState>(loaderData.dashboard)
  const initialWindow = defaultBacktestWindow()
  const [startDate, setStartDate] = useState(initialWindow.start)
  const [endDate, setEndDate] = useState(initialWindow.end)
  const [capitalUsd, setCapitalUsd] = useState('250')
  const [feeRate, setFeeRate] = useState('0.001')
  const [slippageRate, setSlippageRate] = useState('0.0005')
  const [lowerPrice, setLowerPrice] = useState('98000')
  const [upperPrice, setUpperPrice] = useState('112000')
  const [gridCount, setGridCount] = useState('6')
  const [spacingPct, setSpacingPct] = useState('2')
  const [stopLossEnabled, setStopLossEnabled] = useState(false)
  const [stopLossPct, setStopLossPct] = useState('8')
  const [isRunning, setIsRunning] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [successNote, setSuccessNote] = useState<string>()

  const backtest = dashboard.lastBacktest
  const tradeLog = backtest?.tradeLog ?? []

  const cumulativeSeries = useMemo(() => {
    if (!backtest?.startEquityUsd) return []
    let running = backtest.startEquityUsd
    const points = tradeLog.map((trade, index) => {
      running += trade.realized_pnl_usd ?? 0
      return {
        x: index,
        y: running,
      }
    })
    if (!points.length) {
      return [{ x: 0, y: backtest.startEquityUsd }]
    }
    return [{ x: -1, y: backtest.startEquityUsd }, ...points]
  }, [backtest?.startEquityUsd, tradeLog])

  const sparklinePath = useMemo(() => {
    if (!cumulativeSeries.length) return ''
    const values = cumulativeSeries.map((point) => point.y)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const spread = max - min || 1
    return cumulativeSeries
      .map((point, index) => {
        const x = (index / Math.max(cumulativeSeries.length - 1, 1)) * 100
        const y = 100 - (((point.y - min) / spread) * 80 + 10)
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')
  }, [cumulativeSeries])

  async function handleRefresh() {
    try {
      const nextDashboard = await getDashboard()
      setDashboard(nextDashboard.dashboard)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to refresh backtest state.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedCapital = Number.parseFloat(capitalUsd)
    const parsedFeeRate = Number.parseFloat(feeRate)
    const parsedSlippageRate = Number.parseFloat(slippageRate)
    const parsedLowerPrice = Number.parseFloat(lowerPrice)
    const parsedUpperPrice = Number.parseFloat(upperPrice)
    const parsedGridCount = Number.parseInt(gridCount, 10)
    const parsedSpacingPct = Number.parseFloat(spacingPct)
    const parsedStopLossPct = stopLossEnabled ? Number.parseFloat(stopLossPct) : undefined

    if (!startDate || !endDate) {
      setFormError('Choose a backtest start and end date.')
      return
    }
    if (new Date(`${endDate}T00:00:00Z`) <= new Date(`${startDate}T00:00:00Z`)) {
      setFormError('End date must be after the start date.')
      return
    }
    if (!Number.isFinite(parsedCapital) || parsedCapital <= 0) {
      setFormError('Initial capital must be greater than 0.')
      return
    }
    if (!Number.isFinite(parsedLowerPrice) || !Number.isFinite(parsedUpperPrice)) {
      setFormError('Enter both lower and upper grid bounds.')
      return
    }
    if (parsedUpperPrice <= parsedLowerPrice) {
      setFormError('Upper price must be greater than the lower price.')
      return
    }
    if (!Number.isInteger(parsedGridCount) || parsedGridCount < 2) {
      setFormError('Grid count must be a whole number greater than or equal to 2.')
      return
    }
    if (!Number.isFinite(parsedSpacingPct) || parsedSpacingPct <= 0) {
      setFormError('Spacing percentage must be greater than 0.')
      return
    }
    if (!Number.isFinite(parsedFeeRate) || parsedFeeRate < 0) {
      setFormError('Fee rate must be 0 or greater.')
      return
    }
    if (!Number.isFinite(parsedSlippageRate) || parsedSlippageRate < 0) {
      setFormError('Slippage rate must be 0 or greater.')
      return
    }
    if (stopLossEnabled && (!Number.isFinite(parsedStopLossPct) || (parsedStopLossPct ?? 0) <= 0)) {
      setFormError('Stop-loss percentage must be greater than 0 when enabled.')
      return
    }

    try {
      setIsRunning(true)
      setFormError(undefined)
      setSuccessNote(undefined)
      const nextDashboard = await runBacktest({
        // @ts-ignore
        data: {
          strategy: 'grid',
          startAt: `${startDate}T00:00:00+00:00`,
          endAt: `${endDate}T00:00:00+00:00`,
          initialCapitalUsd: parsedCapital,
          feeRate: parsedFeeRate,
          slippageRate: parsedSlippageRate,
          gridConfig: {
            lowerPrice: parsedLowerPrice,
            upperPrice: parsedUpperPrice,
            gridCount: parsedGridCount,
            spacingPct: parsedSpacingPct,
            stopLossEnabled,
            stopLossPct: parsedStopLossPct,
          },
        },
      })
      setDashboard(nextDashboard)
      setSuccessNote('Backtest completed with the latest historical replay from the backend.')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to run the backtest right now.')
    } finally {
      setIsRunning(false)
    }
  }

  const resultAccent =
    (backtest?.roiPct ?? 0) > 0 ? 'positive' : (backtest?.roiPct ?? 0) < 0 ? 'negative' : 'neutral'

  return (
    <ProtectedShell
      activeNavId="backtest"
      viewer={viewer.user!}
      header={({ openMenu }) => (
        <>
          <div className="flex items-center gap-4">
            <ProtectedMenuButton onClick={openMenu} />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Replay Lab</p>
              <h1 className="text-lg font-medium tracking-tight text-zinc-100">Backtesting</h1>
            </div>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
            type="button"
            onClick={() => {
              void handleRefresh()
            }}
          >
            <Icon icon="solar:refresh-linear" width={16} height={16} />
            Refresh state
          </button>
        </>
      )}
      contentClassName="space-y-6"
    >
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-[28px] border border-amber-400/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(217,119,6,0.04)_45%,rgba(9,9,11,0.9)_80%)] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">
              Historical Replay
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-950/50 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-zinc-400">
              Grid strategy live
            </span>
          </div>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-50">
            Tune the grid, replay the regime, and inspect whether the ladder still earns its keep.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300/80">
            This page is wired directly to the backend backtest runner. The form sends your grid
            range, capital, fees, slippage, and stop-loss assumptions to the API and stores the
            latest result in the dashboard state.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricCard
              label="ROI"
              value={formatPercent(backtest?.roiPct)}
              accent={resultAccent}
              detail="Net return over the selected replay window."
              icon="solar:chart-square-linear"
            />
            <MetricCard
              label="Max Drawdown"
              value={formatPercent(backtest?.maxDrawdownPct)}
              accent="negative"
              detail="Peak-to-trough equity contraction."
              icon="solar:graph-down-linear"
            />
            <MetricCard
              label="Trades"
              value={numberFormatter.format(backtest?.trades ?? 0)}
              detail="Filled buy and sell grid executions."
              icon="solar:transfer-horizontal-linear"
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-800/70 bg-zinc-950/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Run Control</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
                Configure grid inputs
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-200">
              <Icon icon="solar:sliders-minimalistic-linear" width={20} height={20} />
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </Field>
              <Field label="End date">
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </Field>
              <Field label="Initial capital (USD)">
                <input
                  inputMode="decimal"
                  value={capitalUsd}
                  onChange={(event) => setCapitalUsd(event.target.value)}
                  placeholder="250"
                />
              </Field>
              <Field label="Grid count">
                <input
                  inputMode="numeric"
                  value={gridCount}
                  onChange={(event) => setGridCount(event.target.value)}
                  placeholder="6"
                />
              </Field>
              <Field label="Lower price">
                <input
                  inputMode="decimal"
                  value={lowerPrice}
                  onChange={(event) => setLowerPrice(event.target.value)}
                  placeholder="98000"
                />
              </Field>
              <Field label="Upper price">
                <input
                  inputMode="decimal"
                  value={upperPrice}
                  onChange={(event) => setUpperPrice(event.target.value)}
                  placeholder="112000"
                />
              </Field>
              <Field label="Spacing pct">
                <input
                  inputMode="decimal"
                  value={spacingPct}
                  onChange={(event) => setSpacingPct(event.target.value)}
                  placeholder="2"
                />
              </Field>
              <Field label="Fee rate">
                <input
                  inputMode="decimal"
                  value={feeRate}
                  onChange={(event) => setFeeRate(event.target.value)}
                  placeholder="0.001"
                />
              </Field>
              <Field label="Slippage rate">
                <input
                  inputMode="decimal"
                  value={slippageRate}
                  onChange={(event) => setSlippageRate(event.target.value)}
                  placeholder="0.0005"
                />
              </Field>
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
                <label className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Stop-loss protection</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Liquidate remaining BTC if price breaches the configured threshold.
                    </p>
                  </div>
                  <input
                    checked={stopLossEnabled}
                    className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                    type="checkbox"
                    onChange={(event) => setStopLossEnabled(event.target.checked)}
                  />
                </label>
                <div className="mt-4">
                  <Field label="Stop-loss pct">
                    <input
                      disabled={!stopLossEnabled}
                      inputMode="decimal"
                      value={stopLossPct}
                      onChange={(event) => setStopLossPct(event.target.value)}
                      placeholder="8"
                    />
                  </Field>
                </div>
              </div>
            </div>

            {formError ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {formError}
              </div>
            ) : null}

            {successNote ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {successNote}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRunning}
                type="submit"
              >
                <Icon
                  icon={isRunning ? 'solar:refresh-bold-duotone' : 'solar:play-circle-bold-duotone'}
                  width={18}
                  height={18}
                />
                {isRunning ? 'Running backtest...' : 'Run backtest'}
              </button>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Grid is live. Rebalance and Infinity Grid come next.
              </p>
            </div>
          </form>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-zinc-800/70 bg-zinc-950/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Performance Strip</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
                Equity drift from realized fills
              </h2>
            </div>
            <div className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
              {backtest?.periodLabel ?? 'No run yet'}
            </div>
          </div>

          {backtest ? (
            <>
              <div className="mt-6 rounded-[24px] border border-zinc-800/80 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_55%),linear-gradient(180deg,rgba(24,24,27,0.95),rgba(9,9,11,0.98))] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-400">Capital evolution</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
                      {formatCurrency(backtest.finalEquityUsd)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Started</p>
                    <p className="mt-2 text-sm text-zinc-200">{formatCurrency(backtest.startEquityUsd)}</p>
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-950/70 p-4">
                  <svg className="h-48 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="backtestLine" x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#fbbf24" />
                      </linearGradient>
                    </defs>
                    <path d="M 0 90 L 100 90" fill="none" stroke="rgba(63,63,70,0.8)" strokeDasharray="3 4" />
                    {sparklinePath ? (
                      <path
                        d={sparklinePath}
                        fill="none"
                        stroke="url(#backtestLine)"
                        strokeLinecap="round"
                        strokeWidth="2.5"
                      />
                    ) : null}
                  </svg>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Profit Factor"
                  value={formatNumber(backtest.profitFactor)}
                  detail="Gross profit divided by gross loss."
                  icon="solar:chart-linear"
                />
                <MetricCard
                  label="Win Rate"
                  value={formatPercent(backtest.winRatePct, 1)}
                  detail="Closed winners over all closed trades."
                  icon="solar:medal-ribbon-star-linear"
                />
                <MetricCard
                  label="Annualized"
                  value={formatPercent(backtest.annualizedPct)}
                  accent={(backtest.annualizedPct ?? 0) >= 0 ? 'positive' : 'negative'}
                  detail="Simple annualization of the replay result."
                  icon="solar:chart-2-linear"
                />
                <MetricCard
                  label="Completed"
                  value={formatDateTime(backtest.completedAt)}
                  detail="Latest successful backend execution timestamp."
                  icon="solar:clock-circle-linear"
                />
              </div>
            </>
          ) : (
            <EmptyState
              icon="solar:chart-square-linear"
              title="No backtest run yet"
              body="Run the first grid replay from the control panel to populate performance metrics, trade fills, and assumptions."
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-zinc-800/70 bg-zinc-950/70 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Assumptions</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
              Backend replay settings
            </h2>
            <div className="mt-5 space-y-3">
              <AssumptionRow label="Date range" value={backtest?.periodLabel ?? `${startDate} to ${endDate}`} />
              <AssumptionRow label="Initial capital" value={formatCurrency(backtest?.startEquityUsd ?? Number(capitalUsd))} />
              <AssumptionRow label="Fee rate" value={formatNumber(backtest?.feeRate ?? Number(feeRate), 4)} />
              <AssumptionRow label="Slippage rate" value={formatNumber(backtest?.slippageRate ?? Number(slippageRate), 4)} />
              <AssumptionRow label="Range" value={`${numberFormatter.format(Number(lowerPrice))} - ${numberFormatter.format(Number(upperPrice))}`} />
              <AssumptionRow label="Grid count" value={gridCount} />
              <AssumptionRow label="Spacing" value={`${spacingPct}%`} />
              <AssumptionRow label="Stop-loss" value={stopLossEnabled ? `${stopLossPct}%` : backtest?.stopLossTriggered ? 'Triggered' : 'Disabled'} />
            </div>
          </div>

          <div className="rounded-[28px] border border-zinc-800/70 bg-zinc-950/70 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Diagnostics</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
              Warning surface
            </h2>
            {backtest?.warnings?.length ? (
              <div className="mt-5 space-y-3">
                {backtest.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="rounded-2xl border border-amber-500/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100"
                  >
                    {warning}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-4 text-sm leading-6 text-zinc-400">
                {backtest
                  ? 'No warnings were returned for the latest replay.'
                  : 'Warnings from the backend backtest runner will appear here.'}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-zinc-800/70 bg-zinc-950/70 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Trade Ledger</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
              Filled grid executions
            </h2>
          </div>
          <div className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
            {tradeLog.length} rows
          </div>
        </div>

        {tradeLog.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-zinc-500">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Side</th>
                  <th className="px-4 py-2">Level</th>
                  <th className="px-4 py-2">Executed</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Notional</th>
                  <th className="px-4 py-2">PnL</th>
                  <th className="px-4 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {tradeLog.map((trade) => (
                  <tr key={`${trade.timestamp}-${trade.side}-${trade.level}`} className="rounded-2xl bg-zinc-900/60">
                    <td className="rounded-l-2xl px-4 py-3 text-zinc-300">{formatDateTime(trade.timestamp)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cx(
                          'inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                          trade.side === 'buy'
                            ? 'bg-emerald-500/12 text-emerald-300'
                            : 'bg-amber-500/12 text-amber-200',
                        )}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{formatCurrency(trade.level)}</td>
                    <td className="px-4 py-3 text-zinc-200">{formatCurrency(trade.execution_price)}</td>
                    <td className="px-4 py-3 text-zinc-300">{formatNumber(trade.amount, 6)}</td>
                    <td className="px-4 py-3 text-zinc-200">{formatCurrency(trade.notional_usd)}</td>
                    <td
                      className={cx(
                        'px-4 py-3',
                        (trade.realized_pnl_usd ?? 0) > 0
                          ? 'text-emerald-300'
                          : (trade.realized_pnl_usd ?? 0) < 0
                            ? 'text-rose-300'
                            : 'text-zinc-500',
                      )}
                    >
                      {trade.realized_pnl_usd == null ? 'Open leg' : formatCurrency(trade.realized_pnl_usd)}
                    </td>
                    <td className="rounded-r-2xl px-4 py-3 text-zinc-400">{trade.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="solar:document-text-linear"
            title="No trade fills yet"
            body="Filled buys and sells from the latest backtest will appear here once the backend returns a trade log."
          />
        )}
      </section>
    </ProtectedShell>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 [&_input]:w-full [&_input]:border-none [&_input]:bg-transparent [&_input]:text-sm [&_input]:text-zinc-100 [&_input]:outline-none [&_input]:placeholder:text-zinc-600 [&_input:disabled]:cursor-not-allowed [&_input:disabled]:text-zinc-600">
        {children}
      </div>
    </label>
  )
}

function AssumptionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <strong className="text-sm font-medium text-zinc-100">{value}</strong>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string
  title: string
  body: string
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-500">
        <Icon icon={icon} width={24} height={24} />
      </div>
      <h3 className="mt-5 text-2xl font-medium tracking-tight text-zinc-100">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-500">{body}</p>
    </div>
  )
}
