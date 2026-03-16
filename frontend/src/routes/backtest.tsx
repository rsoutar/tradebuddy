import { Icon } from '@iconify/react'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react'
import type { BacktestEquityPoint } from '../components/backtest-equity-chart'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getDashboard, runBacktest, type DashboardState, type StrategyKey } from '../lib/session'
import { useTheme } from '../lib/theme'
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

const chartDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
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

function formatSignedCurrency(value?: number) {
  const safe = value ?? 0
  const sign = safe > 0 ? '+' : safe < 0 ? '-' : ''
  return `${sign}${currencyFormatter.format(Math.abs(safe))}`
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

const BacktestEquityChart = lazy(async () => {
  const module = await import('../components/backtest-equity-chart')
  return { default: module.BacktestEquityChart }
})

function defaultBacktestWindow() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 90)
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  }
}

function buildGridPreviewLevels(
  lowerPrice: number,
  upperPrice: number,
  gridCount: number,
  spacingPct: number,
) {
  if (
    !Number.isFinite(lowerPrice) ||
    !Number.isFinite(upperPrice) ||
    !Number.isInteger(gridCount) ||
    gridCount < 2 ||
    !Number.isFinite(spacingPct) ||
    spacingPct <= 0 ||
    upperPrice <= lowerPrice
  ) {
    return []
  }

  const factor = 1 + spacingPct / 100
  const levels = [Number(lowerPrice.toFixed(2))]
  let currentLevel = lowerPrice

  for (let index = 1; index < gridCount; index += 1) {
    const nextLevel = currentLevel * factor
    const lastLevel = levels[levels.length - 1]

    if (nextLevel >= upperPrice) {
      const roundedUpper = Number(upperPrice.toFixed(2))
      if (roundedUpper > lastLevel) {
        levels.push(roundedUpper)
      }
      break
    }

    const roundedLevel = Number(nextLevel.toFixed(2))
    if (roundedLevel <= lastLevel) {
      break
    }

    levels.push(roundedLevel)
    currentLevel = nextLevel
  }

  return levels
}

function buildInfinityPreviewLevels(lowerStartPrice: number, spacingPct: number, maxActiveGrids: number) {
  if (
    !Number.isFinite(lowerStartPrice) ||
    lowerStartPrice <= 0 ||
    !Number.isFinite(spacingPct) ||
    spacingPct <= 0 ||
    !Number.isInteger(maxActiveGrids) ||
    maxActiveGrids < 2
  ) {
    return []
  }

  const spacingFactor = 1 + spacingPct / 100
  const levels: number[] = []
  let currentLevel = lowerStartPrice

  for (let index = 0; index < maxActiveGrids; index += 1) {
    levels.push(Number(currentLevel.toFixed(2)))
    currentLevel *= spacingFactor
  }

  return levels
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
  const { effectiveTheme } = useTheme()
  const [dashboard, setDashboard] = useState<DashboardState>(loaderData.dashboard)
  const market = loaderData.market
  const initialWindow = defaultBacktestWindow()
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>(
    loaderData.dashboard.lastBacktest?.strategy ?? 'grid',
  )
  const [startDate, setStartDate] = useState(initialWindow.start)
  const [endDate, setEndDate] = useState(initialWindow.end)
  const [capitalUsd, setCapitalUsd] = useState('250')
  const [feeRate, setFeeRate] = useState('0.001')
  const [slippageRate, setSlippageRate] = useState('0.0005')
  const [lowerPrice, setLowerPrice] = useState('98000')
  const [upperPrice, setUpperPrice] = useState('112000')
  const [gridCount, setGridCount] = useState('6')
  const [spacingPct, setSpacingPct] = useState('2')
  const [stopAtUpperEnabled, setStopAtUpperEnabled] = useState(false)
  const [stopLossEnabled, setStopLossEnabled] = useState(false)
  const [stopLossPct, setStopLossPct] = useState('8')
  const [targetBtcRatio, setTargetBtcRatio] = useState('50')
  const [rebalanceThresholdPct, setRebalanceThresholdPct] = useState('5')
  const [intervalMinutes, setIntervalMinutes] = useState('60')
  const [infinityReferencePrice, setInfinityReferencePrice] = useState(() =>
    Math.round(loaderData.market.price).toString(),
  )
  const [infinitySpacingPct, setInfinitySpacingPct] = useState('1.5')
  const [infinityOrderSizeUsd, setInfinityOrderSizeUsd] = useState('100')
  const [infinityLevelsPerSide, setInfinityLevelsPerSide] = useState('6')
  const [isRunning, setIsRunning] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [successNote, setSuccessNote] = useState<string>()

  const backtest = dashboard.lastBacktest
  const tradeLog = backtest?.tradeLog ?? []

  const equityChartData = useMemo<BacktestEquityPoint[]>(() => {
    if (!backtest?.startEquityUsd) return []

    let running = backtest.startEquityUsd
    const startTimestamp = backtest.startedAt ?? tradeLog[0]?.timestamp ?? backtest.completedAt
    const points: BacktestEquityPoint[] = [
      {
        label: 'Start',
        timestamp: startTimestamp,
        equity: running,
      },
    ]

    tradeLog.forEach((trade, index) => {
      running += trade.realized_pnl_usd ?? 0
      points.push({
        label: chartDateFormatter.format(new Date(trade.timestamp)),
        timestamp: trade.timestamp,
        equity: running,
        realizedPnl: trade.realized_pnl_usd ?? null,
        side: trade.side,
      })
    })

    return points
  }, [backtest?.completedAt, backtest?.startEquityUsd, backtest?.startedAt, tradeLog])

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
    const parsedTargetRatio = Number.parseFloat(targetBtcRatio)
    const parsedThresholdPct = Number.parseFloat(rebalanceThresholdPct)
    const parsedIntervalMinutes = Number.parseInt(intervalMinutes, 10)
    const parsedInfinityReferencePrice = Number.parseFloat(infinityReferencePrice)
    const parsedInfinitySpacingPct = Number.parseFloat(infinitySpacingPct)
    const parsedInfinityOrderSizeUsd = Number.parseFloat(infinityOrderSizeUsd)
    const parsedInfinityLevelsPerSide = Number.parseInt(infinityLevelsPerSide, 10)

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
    if (!Number.isFinite(parsedFeeRate) || parsedFeeRate < 0) {
      setFormError('Fee rate must be 0 or greater.')
      return
    }
    if (!Number.isFinite(parsedSlippageRate) || parsedSlippageRate < 0) {
      setFormError('Slippage rate must be 0 or greater.')
      return
    }
    if (selectedStrategy === 'grid') {
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
      if (stopLossEnabled && (!Number.isFinite(parsedStopLossPct) || (parsedStopLossPct ?? 0) <= 0)) {
        setFormError('Stop-loss percentage must be greater than 0 when enabled.')
        return
      }
    } else if (selectedStrategy === 'rebalance') {
      if (!Number.isFinite(parsedTargetRatio) || parsedTargetRatio < 0 || parsedTargetRatio > 100) {
        setFormError('Target BTC allocation must be between 0% and 100%.')
        return
      }
      if (!Number.isFinite(parsedThresholdPct) || parsedThresholdPct <= 0) {
        setFormError('Drift threshold must be greater than 0.')
        return
      }
      if (!Number.isInteger(parsedIntervalMinutes) || parsedIntervalMinutes <= 0) {
        setFormError('Rebalance interval must be a whole number of minutes greater than 0.')
        return
      }
    } else {
      if (!Number.isFinite(parsedInfinityReferencePrice) || parsedInfinityReferencePrice <= 0) {
        setFormError('Infinity Grid reference price must be greater than 0.')
        return
      }
      if (!Number.isFinite(parsedInfinitySpacingPct) || parsedInfinitySpacingPct <= 0) {
        setFormError('Infinity Grid spacing must be greater than 0.')
        return
      }
      if (!Number.isFinite(parsedInfinityOrderSizeUsd) || parsedInfinityOrderSizeUsd <= 0) {
        setFormError('Infinity Grid order size must be greater than 0.')
        return
      }
      if (!Number.isInteger(parsedInfinityLevelsPerSide) || parsedInfinityLevelsPerSide < 1) {
        setFormError('Levels per side must be a whole number greater than or equal to 1.')
        return
      }
    }

    try {
      setIsRunning(true)
      setFormError(undefined)
      setSuccessNote(undefined)
      const nextDashboard = await runBacktest({
        // @ts-ignore
        data: {
          strategy: selectedStrategy,
          startAt: `${startDate}T00:00:00+00:00`,
          endAt: `${endDate}T00:00:00+00:00`,
          initialCapitalUsd: parsedCapital,
          feeRate: parsedFeeRate,
          slippageRate: parsedSlippageRate,
          gridConfig:
            selectedStrategy === 'grid'
              ? {
                  lowerPrice: parsedLowerPrice,
                  upperPrice: parsedUpperPrice,
                  gridCount: parsedGridCount,
                  spacingPct: parsedSpacingPct,
                  stopAtUpperEnabled,
                  stopLossEnabled,
                  stopLossPct: parsedStopLossPct,
                }
              : undefined,
          rebalanceConfig:
            selectedStrategy === 'rebalance'
              ? {
                  targetBtcRatio: parsedTargetRatio / 100,
                  rebalanceThresholdPct: parsedThresholdPct,
                  intervalMinutes: parsedIntervalMinutes,
                }
              : undefined,
          infinityConfig:
            selectedStrategy === 'infinity-grid'
              ? {
                  referencePrice: parsedInfinityReferencePrice,
                  spacingPct: parsedInfinitySpacingPct,
                  orderSizeUsd: parsedInfinityOrderSizeUsd,
                  levelsPerSide: parsedInfinityLevelsPerSide,
                }
              : undefined,
        },
      })
      setDashboard(nextDashboard)
      setSuccessNote(
        selectedStrategy === 'grid'
          ? 'Grid backtest completed with the latest historical replay from the backend.'
          : selectedStrategy === 'rebalance'
            ? 'Rebalance backtest completed with the latest historical replay from the backend.'
            : 'Infinity Grid backtest completed with the latest historical replay from the backend.',
      )
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to run the backtest right now.')
    } finally {
      setIsRunning(false)
    }
  }

  const resultAccent =
    (backtest?.roiPct ?? 0) > 0 ? 'positive' : (backtest?.roiPct ?? 0) < 0 ? 'negative' : 'neutral'
  const isLightTheme = effectiveTheme === 'light'
  const gainLossUsd = (backtest?.finalEquityUsd ?? 0) - (backtest?.startEquityUsd ?? 0)
  const parsedCapitalUsd = Number.parseFloat(capitalUsd)
  const parsedLowerPrice = Number.parseFloat(lowerPrice)
  const parsedUpperPrice = Number.parseFloat(upperPrice)
  const parsedGridCount = Number.parseInt(gridCount, 10)
  const parsedSpacingPct = Number.parseFloat(spacingPct)
  const parsedTargetRatio = Number.parseFloat(targetBtcRatio)
  const parsedThresholdPct = Number.parseFloat(rebalanceThresholdPct)
  const parsedIntervalMinutes = Number.parseInt(intervalMinutes, 10)
  const parsedInfinityReference = Number.parseFloat(infinityReferencePrice)
  const parsedInfinitySpacing = Number.parseFloat(infinitySpacingPct)
  const parsedInfinityOrderSize = Number.parseFloat(infinityOrderSizeUsd)
  const parsedInfinityGridCount = Number.parseInt(infinityLevelsPerSide, 10)
  const previewLevels = useMemo(
    () => buildGridPreviewLevels(parsedLowerPrice, parsedUpperPrice, parsedGridCount, parsedSpacingPct),
    [parsedGridCount, parsedLowerPrice, parsedSpacingPct, parsedUpperPrice],
  )
  const infinityPreviewLevels = useMemo(
    () =>
      buildInfinityPreviewLevels(
        parsedInfinityReference,
        parsedInfinitySpacing,
        parsedInfinityGridCount,
      ),
    [parsedInfinityGridCount, parsedInfinityReference, parsedInfinitySpacing],
  )
  const deployableCapitalUsd = Number.isFinite(parsedCapitalUsd) && parsedCapitalUsd > 0 ? parsedCapitalUsd * 0.9 : 0
  const estimatedLevelBudgetUsd =
    deployableCapitalUsd > 0 && previewLevels.length > 1 ? deployableCapitalUsd / (previewLevels.length - 1) : 0
  const targetAllocationUsd =
    Number.isFinite(parsedCapitalUsd) && Number.isFinite(parsedTargetRatio)
      ? parsedCapitalUsd * (parsedTargetRatio / 100)
      : 0
  const targetAllocationBtc =
    targetAllocationUsd > 0 && market.price > 0 ? targetAllocationUsd / market.price : 0
  const strategyCopy =
    selectedStrategy === 'grid'
      ? {
          badge: 'Grid strategy live',
          title: 'Tune the grid, replay the regime, and inspect whether the ladder still earns its keep.',
          description:
            'This page is wired directly to the backend backtest runner. The form sends your grid range, capital, fees, slippage, and stop-loss assumptions to the API and stores the latest result in the dashboard state.',
          controlTitle: 'Configure grid inputs',
          tradesDetail: 'Filled buy and sell grid executions.',
        }
      : selectedStrategy === 'rebalance'
        ? {
          badge: 'Rebalance strategy live',
          title: 'Replay allocation drift, rebalance on schedule, and see how the portfolio held its shape.',
          description:
            'This path sends target allocation, drift threshold, interval cadence, capital, fees, and slippage assumptions to the backend rebalance runner and stores the latest replay summary in dashboard state.',
          controlTitle: 'Configure rebalance inputs',
          tradesDetail: 'Executed rebalance adjustments across the replay window.',
        }
        : {
            badge: 'Infinity Grid strategy live',
            title: 'Harvest the chop with a two-sided geometric ladder that keeps re-arming around price.',
            description:
              'This path sends your reference price, spacing, order size, levels-per-side, capital, fees, and slippage assumptions to the backend replay runner for a classic infinity grid replay.',
            controlTitle: 'Configure infinity grid inputs',
            tradesDetail: 'Filled geometric buy and sell ladder crossings.',
          }

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
        <div
          className={cx(
            'overflow-hidden rounded-[28px] border p-7',
            isLightTheme
              ? 'border-amber-300/40 shadow-[0_24px_60px_rgba(180,83,9,0.10)]'
              : 'border-amber-400/20 shadow-[0_30px_80px_rgba(0,0,0,0.35)]',
          )}
          style={{
            backgroundImage: isLightTheme
              ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(255, 251, 235, 0.96) 42%, rgba(245, 245, 244, 0.98) 100%)'
              : 'linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(217, 119, 6, 0.04) 45%, rgba(9, 9, 11, 0.9) 80%)',
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]',
                isLightTheme
                  ? 'border border-amber-500/30 bg-amber-100/90 text-amber-900'
                  : 'border border-amber-300/25 bg-amber-400/10 text-amber-200',
              )}
            >
              Historical Replay
            </span>
            <span
              className={cx(
                'rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em]',
                isLightTheme
                  ? 'border border-stone-300 bg-white/80 text-stone-600'
                  : 'border border-zinc-700 bg-zinc-950/50 text-zinc-400',
              )}
            >
              {strategyCopy.badge}
            </span>
          </div>
          <h2
            className={cx(
              'mt-4 max-w-2xl text-4xl font-semibold tracking-tight',
              isLightTheme ? 'text-stone-950' : 'text-zinc-50',
            )}
          >
            {strategyCopy.title}
          </h2>
          <p className={cx('mt-4 max-w-2xl text-sm leading-7', isLightTheme ? 'text-stone-600' : 'text-zinc-300/80')}>
            {strategyCopy.description}
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
              detail={strategyCopy.tradesDetail}
              icon="solar:transfer-horizontal-linear"
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-800/70 bg-zinc-950/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Run Control</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
                {strategyCopy.controlTitle}
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-200">
              <Icon icon="solar:sliders-minimalistic-linear" width={20} height={20} />
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['grid', 'Grid', 'solar:widget-4-linear'],
                ['rebalance', 'Rebalance', 'solar:refresh-circle-linear'],
                ['infinity-grid', 'Infinity Grid', 'solar:maximize-square-linear'],
              ] as const).map(([key, label, icon]) => (
                <button
                  key={key}
                  type="button"
                  className={cx(
                    'flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition',
                    selectedStrategy === key
                      ? 'border-amber-300/35 bg-amber-400/10 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                  )}
                  onClick={() => {
                    setFormError(undefined)
                    setSuccessNote(undefined)
                    setSelectedStrategy(key)
                  }}
                >
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {key === 'grid'
                        ? 'Range-based ladder replay'
                        : key === 'rebalance'
                          ? 'Allocation drift replay'
                          : 'Two-sided geometric ladder replay'}
                    </p>
                  </div>
                  <Icon icon={icon} width={18} height={18} />
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Initial capital (USD)">
                <input
                  inputMode="decimal"
                  value={capitalUsd}
                  onChange={(event) => setCapitalUsd(event.target.value)}
                  placeholder="250"
                />
              </Field>
              <Field label="Start date">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </Field>
              <Field label="End date">
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
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
              {selectedStrategy === 'grid' ? (
                <>
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
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
                    <label className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Stop when upper price is hit</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          End the backtest as soon as price touches the configured upper range.
                        </p>
                      </div>
                      <input
                        aria-label="Stop when upper price is hit"
                        checked={stopAtUpperEnabled}
                        className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                        type="checkbox"
                        onChange={(event) => setStopAtUpperEnabled(event.target.checked)}
                      />
                    </label>
                  </div>
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
                    <label className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Stop-loss protection</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          Liquidate remaining BTC if price breaches the configured threshold.
                        </p>
                      </div>
                      <input
                        aria-label="Enable stop-loss protection"
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
                </>
              ) : selectedStrategy === 'rebalance' ? (
                <>
                  <Field label="Target BTC allocation (%)">
                    <input
                      inputMode="decimal"
                      value={targetBtcRatio}
                      onChange={(event) => setTargetBtcRatio(event.target.value)}
                      placeholder="50"
                    />
                  </Field>
                  <Field label="Drift threshold (%)">
                    <input
                      inputMode="decimal"
                      value={rebalanceThresholdPct}
                      onChange={(event) => setRebalanceThresholdPct(event.target.value)}
                      placeholder="5"
                    />
                  </Field>
                  <Field label="Check interval (minutes)">
                    <input
                      inputMode="numeric"
                      value={intervalMinutes}
                      onChange={(event) => setIntervalMinutes(event.target.value)}
                      placeholder="60"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Reference price">
                    <input
                      inputMode="decimal"
                      value={infinityReferencePrice}
                      onChange={(event) => setInfinityReferencePrice(event.target.value)}
                      placeholder="102000"
                    />
                  </Field>
                  <Field label="Spacing pct">
                    <input
                      inputMode="decimal"
                      value={infinitySpacingPct}
                      onChange={(event) => setInfinitySpacingPct(event.target.value)}
                      placeholder="1.5"
                    />
                  </Field>
                  <Field label="Order size (USD)">
                    <input
                      inputMode="decimal"
                      value={infinityOrderSizeUsd}
                      onChange={(event) => setInfinityOrderSizeUsd(event.target.value)}
                      placeholder="100"
                    />
                  </Field>
                  <Field label="Levels per side">
                    <input
                      inputMode="numeric"
                      value={infinityLevelsPerSide}
                      onChange={(event) => setInfinityLevelsPerSide(event.target.value)}
                      placeholder="6"
                    />
                  </Field>
                </>
              )}
            </div>

            <div
              className={cx(
                'grid gap-3 rounded-[24px] border p-4 sm:grid-cols-3',
                isLightTheme
                  ? 'border-amber-300/40 bg-white/80'
                  : 'border-zinc-800/80 bg-zinc-900/65',
              )}
            >
              {selectedStrategy === 'grid' ? (
                <>
                  <DerivedMetric
                    label="Working Capital"
                    value={deployableCapitalUsd > 0 ? formatCurrency(deployableCapitalUsd) : '--'}
                    detail="Backtests deploy 90% of your capital into the grid ladder."
                    isLightTheme={isLightTheme}
                  />
                  <DerivedMetric
                    label="Levels In Range"
                    value={previewLevels.length ? numberFormatter.format(previewLevels.length) : '--'}
                    detail="Spacing, range, and grid count determine how many levels actually fit."
                    isLightTheme={isLightTheme}
                  />
                  <DerivedMetric
                    label="Est. Budget Per Level"
                    value={estimatedLevelBudgetUsd > 0 ? formatCurrency(estimatedLevelBudgetUsd) : '--'}
                    detail="Approximate capital allocated to each tradable gap between levels."
                    isLightTheme={isLightTheme}
                  />
                </>
              ) : selectedStrategy === 'rebalance' ? (
                <>
                  <DerivedMetric
                    label="Target BTC Value"
                    value={targetAllocationUsd > 0 ? formatCurrency(targetAllocationUsd) : '--'}
                    detail="The portfolio value the runner will try to keep in BTC."
                    isLightTheme={isLightTheme}
                  />
                  <DerivedMetric
                    label="Target BTC Size"
                    value={targetAllocationBtc > 0 ? formatNumber(targetAllocationBtc, 6) : '--'}
                    detail="Approximate BTC held at the current market reference price."
                    isLightTheme={isLightTheme}
                  />
                  <DerivedMetric
                    label="Rebalance Cadence"
                    value={Number.isInteger(parsedIntervalMinutes) ? `${parsedIntervalMinutes} min` : '--'}
                    detail={`Trades trigger only when drift exceeds ${Number.isFinite(parsedThresholdPct) ? formatPercent(parsedThresholdPct, 1) : '--'}.`}
                    isLightTheme={isLightTheme}
                  />
                </>
              ) : (
                <>
                  <DerivedMetric
                    label="Live Entry Bands"
                    value={infinityPreviewLevels.length ? String(infinityPreviewLevels.length) : '--'}
                    detail="Pending grid levels armed on one side of the market at any one time."
                    isLightTheme={isLightTheme}
                  />
                  <DerivedMetric
                    label="Configured Order Size"
                    value={Number.isFinite(parsedInfinityOrderSize) ? formatCurrency(parsedInfinityOrderSize) : '--'}
                    detail="Each grid crossing uses the same approximate notional size."
                    isLightTheme={isLightTheme}
                  />
                  <DerivedMetric
                    label="Reference Ladder"
                    value={Number.isFinite(parsedInfinityReference) ? formatCurrency(parsedInfinityReference) : '--'}
                    detail="The geometric grid is aligned around this base price, then extended above and below."
                    isLightTheme={isLightTheme}
                  />
                </>
              )}
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
                All three strategies now run against the backend replay engine.
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
              <div
                className={cx(
                  'mt-6 rounded-[24px] border p-5',
                  isLightTheme ? 'border-amber-200/80' : 'border-zinc-800/80',
                )}
                style={{
                  backgroundImage: isLightTheme
                    ? 'radial-gradient(circle at top, rgba(251, 191, 36, 0.16), transparent 58%), linear-gradient(180deg, rgba(255, 251, 235, 0.98), rgba(250, 250, 249, 0.96))'
                    : 'radial-gradient(circle at top, rgba(245, 158, 11, 0.12), transparent 55%), linear-gradient(180deg, rgba(24, 24, 27, 0.95), rgba(9, 9, 11, 0.98))',
                }}
              >
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
                  <Suspense
                    fallback={
                      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
                        Loading chart...
                      </div>
                    }
                  >
                    <BacktestEquityChart data={equityChartData} isLightTheme={isLightTheme} />
                  </Suspense>
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
                  label="Gain / Loss"
                  value={formatSignedCurrency(gainLossUsd)}
                  accent={gainLossUsd >= 0 ? 'positive' : 'negative'}
                  detail={`${formatCurrency(backtest.startEquityUsd)} to ${formatCurrency(backtest.finalEquityUsd)} (${formatPercent(backtest.roiPct)})`}
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
              {selectedStrategy === 'grid' ? (
                <>
                  <AssumptionRow label="Range" value={`${numberFormatter.format(Number(lowerPrice))} - ${numberFormatter.format(Number(upperPrice))}`} />
                  <AssumptionRow label="Grid count" value={gridCount} />
                  <AssumptionRow label="Levels in range" value={previewLevels.length ? String(previewLevels.length) : '--'} />
                  <AssumptionRow label="Spacing" value={`${spacingPct}%`} />
                  <AssumptionRow label="Upper stop" value={stopAtUpperEnabled ? 'Enabled' : backtest?.upperPriceStopTriggered ? 'Triggered' : 'Disabled'} />
                  <AssumptionRow label="Stop-loss" value={stopLossEnabled ? `${stopLossPct}%` : backtest?.stopLossTriggered ? 'Triggered' : 'Disabled'} />
                </>
              ) : selectedStrategy === 'rebalance' ? (
                <>
                  <AssumptionRow label="Target BTC" value={`${targetBtcRatio}%`} />
                  <AssumptionRow label="Drift threshold" value={`${rebalanceThresholdPct}%`} />
                  <AssumptionRow label="Check interval" value={`${intervalMinutes} min`} />
                </>
              ) : (
                <>
                  <AssumptionRow label="Reference price" value={numberFormatter.format(Number(infinityReferencePrice))} />
                  <AssumptionRow label="Spacing" value={`${infinitySpacingPct}%`} />
                  <AssumptionRow label="Order size" value={formatCurrency(Number(infinityOrderSizeUsd))} />
                  <AssumptionRow label="Levels per side" value={infinityLevelsPerSide} />
                  <AssumptionRow label="Live entry bands" value={infinityPreviewLevels.length ? String(infinityPreviewLevels.length) : '--'} />
                </>
              )}
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
              {selectedStrategy === 'grid'
                ? 'Filled grid executions'
                : selectedStrategy === 'rebalance'
                  ? 'Filled rebalance executions'
                  : 'Filled infinity grid executions'}
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
                          'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                          trade.side === 'buy'
                            ? 'border-emerald-400/35 bg-emerald-500/18 text-emerald-600'
                            : 'border-rose-400/35 bg-rose-500/14 text-rose-500',
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
  const { effectiveTheme } = useTheme()
  const isLightTheme = effectiveTheme === 'light'

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <div
        className={cx(
          'rounded-2xl border px-4 py-3 text-sm [&_input]:w-full [&_input]:border-none [&_input]:bg-transparent [&_input]:text-sm [&_input]:outline-none [&_input:disabled]:cursor-not-allowed',
          isLightTheme
            ? 'border-stone-300/80 bg-stone-50/90 text-stone-900 [&_input]:text-stone-900 [&_input]:placeholder:text-stone-400 [&_input:disabled]:text-stone-400'
            : 'border-zinc-800/80 bg-zinc-900/70 text-zinc-100 [&_input]:text-zinc-100 [&_input]:placeholder:text-zinc-600 [&_input:disabled]:text-zinc-600',
        )}
      >
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

function DerivedMetric({
  label,
  value,
  detail,
  isLightTheme,
}: {
  label: string
  value: string
  detail: string
  isLightTheme: boolean
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border px-4 py-4',
        isLightTheme ? 'border-stone-200/80 bg-stone-50/85' : 'border-zinc-800/70 bg-zinc-950/60',
      )}
    >
      <p className={cx('text-[11px] uppercase tracking-[0.2em]', isLightTheme ? 'text-stone-500' : 'text-zinc-500')}>
        {label}
      </p>
      <p className={cx('mt-2 text-2xl font-semibold tracking-tight', isLightTheme ? 'text-stone-950' : 'text-zinc-50')}>
        {value}
      </p>
      <p className={cx('mt-2 text-xs leading-5', isLightTheme ? 'text-stone-500' : 'text-zinc-500')}>{detail}</p>
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
