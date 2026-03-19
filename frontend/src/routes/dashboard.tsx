import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Icon } from '@iconify/react'
import { BacktestEquityChart, type BacktestEquityPoint } from '../components/backtest-equity-chart'
import { BotControlModal } from '../components/bot-control-modal'
import { MarketConnectionBadge } from '../components/market-connection-badge'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import type {
  ActiveStrategy,
  AiBotDraft,
  DashboardState,
  MarketConnectionState,
  MarketState,
  StrategyKey,
} from '../lib/session'
import { createBot, depositPaperFunds, getAiBotDraft, getDashboard, stopBot } from '../lib/session'
import { useTheme } from '../lib/theme'

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
    eyebrow: 'Ready now',
    description: 'Push the grid upward in trend mode and keep extending entries as the market climbs.',
    icon: 'solar:maximize-square-linear',
    accent:
      'border-sky-400/20 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_70%)]',
    availableNow: true,
  },
]

const strategyCreateMeta: Record<
  StrategyKey,
  {
    accentText: string
    accentSurface: string
    inputFocus: string
    primaryButton: string
    aiGlow: string
    aiRing: string
    sectionEyebrow: string
    sectionTitle: string
    manualDescription: string
    aiDescription: string
    launchNote: string
  }
> = {
  grid: {
    accentText: 'text-emerald-300',
    accentSurface: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    inputFocus: 'focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50',
    primaryButton: 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300 disabled:bg-emerald-400/60',
    aiGlow: 'bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_58%)]',
    aiRing: 'border-emerald-400/20',
    sectionEyebrow: 'Grid Bot Parameters',
    sectionTitle: 'Range-focused ladder',
    manualDescription:
      'Set the bounds, spacing, and safety rails manually if you want precise control over how the ladder behaves.',
    aiDescription:
      'AI Pilot watches the live BTC regime and handles the range width, density, and safety rails for you.',
    launchNote:
      'Launching this bot creates a live dashboard entry and stores each planned grid order in the paper-trading SQLite ledger.',
  },
  rebalance: {
    accentText: 'text-amber-300',
    accentSurface: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    inputFocus: 'focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/50',
    primaryButton: 'bg-amber-300 text-zinc-950 hover:bg-amber-200 disabled:bg-amber-300/60',
    aiGlow: 'bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_58%)]',
    aiRing: 'border-amber-300/20',
    sectionEyebrow: 'Rebalance Parameters',
    sectionTitle: 'Steady exposure loop',
    manualDescription:
      'Control the target BTC mix, drift sensitivity, and rebalance cadence yourself when you want a specific allocation profile.',
    aiDescription:
      'AI Pilot adapts the BTC target, drift threshold, and cadence to the current market tone automatically.',
    launchNote:
      'Launching this bot creates a live dashboard entry and stores the opening rebalance paper trade in the same SQLite ledger.',
  },
  'infinity-grid': {
    accentText: 'text-sky-300',
    accentSurface: 'border-sky-300/20 bg-sky-300/10 text-sky-100',
    inputFocus: 'focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/50',
    primaryButton: 'bg-sky-300 text-zinc-950 hover:bg-sky-200 disabled:bg-sky-300/60',
    aiGlow: 'bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_58%)]',
    aiRing: 'border-sky-300/20',
    sectionEyebrow: 'Infinity Grid Parameters',
    sectionTitle: 'Trend-following ladder',
    manualDescription:
      'Choose the anchor, spacing, clip size, and ladder depth manually when you need a very specific geometric profile.',
    aiDescription:
      'AI Pilot sizes the geometric ladder around the current tape and handles spacing, order size, and depth for you.',
    launchNote:
      'Launching this bot stores the reference ladder and the first planned geometric orders in the same paper-trading ledger as the other strategies.',
  },
}

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

const btcFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 8,
})

const chartLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
})

const MIN_EFFECTIVE_ORDER_USD = 10

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

function formatPercent(value: number, digits = 2) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function formatBtc(value: number) {
  return `${btcFormatter.format(value)} BTC`
}

type BudgetAssessment = {
  isEnough: boolean
  isReady: boolean
  requiredBudgetUsd?: number
  message: string
  tone: 'neutral' | 'positive' | 'negative'
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

function parsePositiveNumber(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100
}

function buildGridLevels(lowerPrice: number, upperPrice: number, gridCount: number, spacingPct: number) {
  const factor = 1 + spacingPct / 100
  const levels = [roundPrice(lowerPrice)]
  let currentLevel = lowerPrice

  for (let index = 1; index < gridCount; index += 1) {
    const nextLevel = currentLevel * factor
    if (nextLevel >= upperPrice) {
      const roundedUpper = roundPrice(upperPrice)
      if (roundedUpper > levels[levels.length - 1]) {
        levels.push(roundedUpper)
      }
      break
    }

    const roundedLevel = roundPrice(nextLevel)
    if (roundedLevel <= levels[levels.length - 1]) {
      break
    }

    levels.push(roundedLevel)
    currentLevel = nextLevel
  }

  return levels
}

function infinityLevelAt(referencePrice: number, spacingPct: number, index: number) {
  return roundPrice(referencePrice * (1 + spacingPct / 100) ** index)
}

function infinityIndexBelow(referencePrice: number, spacingPct: number, price: number) {
  const factor = 1 + spacingPct / 100
  let rawIndex = Math.floor(Math.log(price / referencePrice) / Math.log(factor))

  while (infinityLevelAt(referencePrice, spacingPct, rawIndex) > price) {
    rawIndex -= 1
  }

  while (infinityLevelAt(referencePrice, spacingPct, rawIndex + 1) <= price) {
    rawIndex += 1
  }

  return rawIndex
}

function buildBudgetAssessment({
  strategy,
  budgetUsd,
  availableCashUsd,
  marketPrice,
  gridLowerPrice,
  gridUpperPrice,
  gridCount,
  gridSpacing,
  rebalanceTargetRatio,
  rebalanceThreshold,
  rebalanceInterval,
  infinityReferencePrice,
  infinitySpacingPct,
  infinityOrderSizeUsd,
  infinityLevelsPerSide,
}: {
  strategy: StrategyKey
  budgetUsd?: number
  availableCashUsd: number
  marketPrice: number
  gridLowerPrice?: number
  gridUpperPrice?: number
  gridCount?: number
  gridSpacing?: number
  rebalanceTargetRatio?: number
  rebalanceThreshold?: number
  rebalanceInterval?: number
  infinityReferencePrice?: number
  infinitySpacingPct?: number
  infinityOrderSizeUsd?: number
  infinityLevelsPerSide?: number
}): BudgetAssessment {
  if (!budgetUsd || budgetUsd <= 0) {
    return {
      isEnough: false,
      isReady: false,
      message: 'Enter a bot budget first to check whether this setup can launch.',
      tone: 'neutral',
    }
  }

  if (budgetUsd > availableCashUsd) {
    return {
      isEnough: false,
      isReady: true,
      requiredBudgetUsd: budgetUsd,
      message: `This budget needs ${formatCurrency(budgetUsd)}, but only ${formatCurrency(availableCashUsd)} is available in reserve.`,
      tone: 'negative',
    }
  }

  if (strategy === 'grid') {
    if (!gridLowerPrice || !gridUpperPrice || !gridCount || !gridSpacing || gridUpperPrice <= gridLowerPrice) {
      return {
        isEnough: false,
        isReady: false,
        message: 'Add a valid range, level count, and spacing to evaluate the grid budget.',
        tone: 'neutral',
      }
    }

    const levels = buildGridLevels(gridLowerPrice, gridUpperPrice, gridCount, gridSpacing)
    const buyLevels = levels.filter((level) => level < marketPrice)
    if (!buyLevels.length) {
      return {
        isEnough: false,
        isReady: true,
        message: 'This range sits above spot, so the bot has no buy levels below market to deploy the budget.',
        tone: 'negative',
      }
    }

    const requiredBudgetUsd = Number(((buyLevels.length * MIN_EFFECTIVE_ORDER_USD) / 0.45).toFixed(2))
    return budgetUsd >= requiredBudgetUsd
      ? {
          isEnough: true,
          isReady: true,
          requiredBudgetUsd,
          message: `Budget is sufficient. ${formatCurrency(budgetUsd)} covers ${buyLevels.length} live buy levels for this grid.`,
          tone: 'positive',
        }
      : {
          isEnough: false,
          isReady: true,
          requiredBudgetUsd,
          message: `This grid needs at least ${formatCurrency(requiredBudgetUsd)} to seed those buy levels realistically.`,
          tone: 'negative',
        }
  }

  if (strategy === 'rebalance') {
    if (
      rebalanceTargetRatio == null
      || rebalanceTargetRatio < 0
      || rebalanceTargetRatio > 100
      || rebalanceThreshold == null
      || rebalanceThreshold <= 0
      || rebalanceInterval == null
      || rebalanceInterval <= 0
    ) {
      return {
        isEnough: false,
        isReady: false,
        message: 'Add a valid target ratio, drift threshold, and check interval to evaluate the budget.',
        tone: 'neutral',
      }
    }

    const activeLegs = Number(rebalanceTargetRatio > 0) + Number(rebalanceTargetRatio < 100)
    const requiredBudgetUsd = Math.max(MIN_EFFECTIVE_ORDER_USD, activeLegs * MIN_EFFECTIVE_ORDER_USD)
    return budgetUsd >= requiredBudgetUsd
      ? {
          isEnough: true,
          isReady: true,
          requiredBudgetUsd,
          message: `Budget is sufficient. The rebalance bot can start with ${formatCurrency(budgetUsd)} and hold the requested mix.`,
          tone: 'positive',
        }
      : {
          isEnough: false,
          isReady: true,
          requiredBudgetUsd,
          message: `This rebalance setup needs at least ${formatCurrency(requiredBudgetUsd)} to split capital into the target allocation.`,
          tone: 'negative',
        }
  }

  if (
    !infinityReferencePrice
    || infinityReferencePrice <= 0
    || !infinitySpacingPct
    || infinitySpacingPct <= 0
    || !infinityOrderSizeUsd
    || infinityOrderSizeUsd <= 0
    || !infinityLevelsPerSide
    || infinityLevelsPerSide < 1
  ) {
    return {
      isEnough: false,
      isReady: false,
      message: 'Add a valid reference price, spacing, order size, and level count to evaluate the budget.',
      tone: 'neutral',
    }
  }

  const requiredBudgetUsd = Number((infinityOrderSizeUsd * infinityLevelsPerSide * 2).toFixed(2))
  return budgetUsd >= requiredBudgetUsd
    ? {
        isEnough: true,
        isReady: true,
        requiredBudgetUsd,
        message: `Budget is sufficient. ${formatCurrency(budgetUsd)} can fund both sides of the configured infinity ladder.`,
        tone: 'positive',
      }
    : {
        isEnough: false,
        isReady: true,
        requiredBudgetUsd,
        message: `This infinity ladder needs at least ${formatCurrency(requiredBudgetUsd)} to cover both sides of the configured levels.`,
        tone: 'negative',
      }
}

function buildAiDraftMetrics(draft?: AiBotDraft) {
  if (!draft) return []

  if (draft.strategy === 'grid' && draft.gridConfig) {
    return [
      {
        label: 'Range',
        value: `${formatCurrency(draft.gridConfig.lower_price)} to ${formatCurrency(draft.gridConfig.upper_price)}`,
      },
      {
        label: 'Grid density',
        value: `${draft.gridConfig.grid_count} levels`,
      },
      {
        label: 'Spacing',
        value: `${draft.gridConfig.spacing_pct.toFixed(1)}%`,
      },
      {
        label: 'Stop loss',
        value:
          draft.gridConfig.stop_loss_enabled && draft.gridConfig.stop_loss_pct
            ? `${draft.gridConfig.stop_loss_pct.toFixed(1)}%`
            : 'Off',
      },
    ]
  }

  if (draft.strategy === 'rebalance' && draft.rebalanceConfig) {
    return [
      {
        label: 'BTC target',
        value: `${(draft.rebalanceConfig.target_btc_ratio * 100).toFixed(0)}%`,
      },
      {
        label: 'Drift trigger',
        value: `${draft.rebalanceConfig.rebalance_threshold_pct.toFixed(1)}%`,
      },
      {
        label: 'Review cadence',
        value: `${draft.rebalanceConfig.interval_minutes} min`,
      },
      {
        label: 'Budget floor',
        value: formatCurrency(draft.requiredBudgetUsd),
      },
    ]
  }

  if (draft.strategy === 'infinity-grid' && draft.infinityConfig) {
    return [
      {
        label: 'Reference',
        value: formatCurrency(draft.infinityConfig.reference_price),
      },
      {
        label: 'Spacing',
        value: `${draft.infinityConfig.spacing_pct.toFixed(1)}%`,
      },
      {
        label: 'Order size',
        value: formatCurrency(draft.infinityConfig.order_size_usd),
      },
      {
        label: 'Depth',
        value: `${draft.infinityConfig.levels_per_side} per side`,
      },
    ]
  }

  return []
}

type LadderPreviewLevel = {
  id: string
  price: number
  kind: 'buy' | 'sell' | 'spot'
  label: string
}

type LadderPreviewModel = {
  title: string
  subtitle: string
  levels: LadderPreviewLevel[]
  badges: string[]
  notes: string[]
}

function LadderPreview({
  model,
}: {
  model?: LadderPreviewModel
}) {
  if (!model) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-950/70 p-5 text-sm text-zinc-500">
        Enter valid parameters to preview the ladder before creating the bot.
      </div>
    )
  }

  const sortedLevels = [...model.levels].sort((left, right) => right.price - left.price)
  const minPrice = Math.min(...sortedLevels.map((level) => level.price))
  const maxPrice = Math.max(...sortedLevels.map((level) => level.price))
  const span = Math.max(maxPrice - minPrice, maxPrice * 0.01, 1)
  const chartHeight = Math.min(Math.max(sortedLevels.length * 17, 180), 260)
  const topLevels = sortedLevels.slice(0, 8)

  return (
    <div className="rounded-[1.5rem] border border-zinc-800/80 bg-[radial-gradient(circle_at_top,_rgba(244,244,245,0.05),_transparent_55%),linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.96))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Live Preview
          </p>
          <h4 className="mt-2 text-base font-medium tracking-tight text-zinc-100">{model.title}</h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">{model.subtitle}</p>
        </div>
        <div className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300">
          {sortedLevels.length} plotted markers
        </div>
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-zinc-800/80 bg-zinc-950/80 p-3">
        <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-zinc-500">
          <span>Higher price</span>
          <span>{formatCurrency(maxPrice)}</span>
        </div>
        <div
          className="relative overflow-hidden rounded-[1.1rem] border border-zinc-800/70 bg-[linear-gradient(180deg,rgba(39,39,42,0.55),rgba(9,9,11,0.92))]"
          style={{ height: `${chartHeight}px` }}
        >
          <div className="absolute inset-y-4 left-5 w-px bg-zinc-700/80" />
          {sortedLevels.map((level) => {
            const top = ((maxPrice - level.price) / span) * 100
            const toneClasses =
              level.kind === 'buy'
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                : level.kind === 'sell'
                  ? 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                  : 'border-amber-300/50 bg-amber-300/12 text-amber-100'
            const railClasses =
              level.kind === 'buy'
                ? 'border-emerald-400/35'
                : level.kind === 'sell'
                  ? 'border-rose-400/35'
                  : 'border-amber-300/45'
            const dotClasses =
              level.kind === 'buy'
                ? 'bg-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.35)]'
                : level.kind === 'sell'
                  ? 'bg-rose-300 shadow-[0_0_16px_rgba(251,113,133,0.35)]'
                  : 'bg-amber-200 shadow-[0_0_18px_rgba(252,211,77,0.45)]'

            return (
              <div key={level.id} className="absolute inset-x-0" style={{ top: `${top}%` }}>
                <div className="absolute left-4 h-2 w-2 -translate-y-1/2 rounded-full ring-4 ring-zinc-950/80" />
                <div className={cx('absolute left-4 h-2 w-2 -translate-y-1/2 rounded-full', dotClasses)} />
                <div className={cx('absolute left-7 right-3 border-t -translate-y-1/2 border-dashed', railClasses)} />
                {level.kind === 'spot' ? (
                  <div className="absolute left-10 top-1/2 -translate-y-1/2 rounded-full border border-amber-300/40 bg-zinc-950/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100">
                    Spot
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-zinc-500">
          <span>Lower price</span>
          <span>{formatCurrency(minPrice)}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {topLevels.map((level) => {
          const toneClasses =
            level.kind === 'buy'
              ? 'border-emerald-400/30 bg-emerald-400/8 text-emerald-200'
              : level.kind === 'sell'
                ? 'border-rose-400/30 bg-rose-400/8 text-rose-200'
                : 'border-amber-300/30 bg-amber-300/8 text-amber-100'

          return (
            <div
              key={`${level.id}-legend`}
              className={cx(
                'flex items-center justify-between rounded-xl border px-3 py-2 text-xs shadow-sm shadow-black/10',
                toneClasses,
              )}
            >
              <span className="font-medium">{level.label}</span>
              <span className="tabular-nums text-current/80">{formatCurrency(level.price)}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {model.badges.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-zinc-700/70 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300"
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {model.notes.slice(0, 2).map((note) => (
          <p key={note} className="text-sm leading-6 text-zinc-400">
            {note}
          </p>
        ))}
      </div>
    </div>
  )
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

function createModalTone(strategy: StrategyKey) {
  if (strategy === 'grid') {
    return {
      dot: 'bg-emerald-400',
      accentText: 'text-emerald-300',
      activeCard:
        'border-emerald-400/30 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_60%),rgba(6,78,59,0.12)] shadow-[0_0_0_1px_rgba(16,185,129,0.14)]',
      iconSurface: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
      toggleTrack: 'bg-emerald-500',
      helperCard: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
      aiCard: 'border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_58%)]',
      aiAccent: 'text-emerald-300/90',
      aiIcon: 'text-emerald-300',
      statTint: 'text-emerald-300',
      quickBudgetActive: 'border-emerald-400 bg-emerald-400 text-zinc-950',
    }
  }

  if (strategy === 'rebalance') {
    return {
      dot: 'bg-amber-300',
      accentText: 'text-amber-300',
      activeCard:
        'border-amber-300/30 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.15),_transparent_60%),rgba(120,53,15,0.12)] shadow-[0_0_0_1px_rgba(245,158,11,0.14)]',
      iconSurface: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
      toggleTrack: 'bg-amber-300',
      helperCard: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
      aiCard: 'border-amber-300/20 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.15),_transparent_58%)]',
      aiAccent: 'text-amber-200/90',
      aiIcon: 'text-amber-200',
      statTint: 'text-amber-200',
      quickBudgetActive: 'border-amber-300 bg-amber-300 text-zinc-950',
    }
  }

  return {
    dot: 'bg-sky-300',
    accentText: 'text-sky-300',
    activeCard:
      'border-sky-300/30 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_60%),rgba(12,74,110,0.12)] shadow-[0_0_0_1px_rgba(56,189,248,0.14)]',
    iconSurface: 'border-sky-300/20 bg-sky-300/10 text-sky-200',
    toggleTrack: 'bg-sky-300',
    helperCard: 'border-sky-300/20 bg-sky-300/10 text-sky-100',
    aiCard: 'border-sky-300/20 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_58%)]',
    aiAccent: 'text-sky-200/90',
    aiIcon: 'text-sky-200',
    statTint: 'text-sky-200',
    quickBudgetActive: 'border-sky-300 bg-sky-300 text-zinc-950',
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
  const { effectiveTheme } = useTheme()
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
  const [isAiPilotEnabled, setIsAiPilotEnabled] = useState(true)
  const [isAiDraftLoading, setIsAiDraftLoading] = useState(false)
  const [aiDraftError, setAiDraftError] = useState<string>()
  const [aiDraft, setAiDraft] = useState<AiBotDraft>()
  const [gridLowerPrice, setGridLowerPrice] = useState('')
  const [gridUpperPrice, setGridUpperPrice] = useState('')
  const [gridCount, setGridCount] = useState('8')
  const [gridSpacing, setGridSpacing] = useState('2')
  const [isGridStopLossEnabled, setIsGridStopLossEnabled] = useState(false)
  const [gridStopLoss, setGridStopLoss] = useState('10')
  const [botBudgetUsd, setBotBudgetUsd] = useState('')
  const [rebalanceTargetRatio, setRebalanceTargetRatio] = useState('50')
  const [rebalanceThreshold, setRebalanceThreshold] = useState('5')
  const [rebalanceInterval, setRebalanceInterval] = useState('60')
  const [infinityReferencePrice, setInfinityReferencePrice] = useState(() =>
    Math.round(loaderData.market.price).toString(),
  )
  const [infinitySpacingPct, setInfinitySpacingPct] = useState('1.5')
  const [infinityOrderSizeUsd, setInfinityOrderSizeUsd] = useState('100')
  const [infinityLevelsPerSide, setInfinityLevelsPerSide] = useState('6')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositError, setDepositError] = useState<string>()
  const [isDepositing, setIsDepositing] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [searchValue, setSearchValue] = useState('')
  const [selectedActiveBotId, setSelectedActiveBotId] = useState<string>()
  const [isStoppingBot, setIsStoppingBot] = useState(false)
  const [botControlFeedback, setBotControlFeedback] = useState<string>()
  const [botControlError, setBotControlError] = useState<string>()
  const aiDraftRequestRef = useRef(0)

  const activeBots = dashboard.activeStrategies.length
  const alertCount = dashboard.events.filter((event) => event.tone !== 'neutral').length
  const totalTradeCount = dashboard.activeStrategies.reduce(
    (sum, strategy) => sum + strategy.tradeCount,
    0,
  )
  const metricsData = {
    totalBalance: dashboard.capitalUsd,
    availableCash: dashboard.availableCashUsd,
    availableReserve: dashboard.availableReserveUsd,
    availableBtc: dashboard.availableBtc,
    allocatedCapital: dashboard.allocatedCapitalUsd,
    balanceChange: dashboard.profit24hPct,
    profit24h: dashboard.profit24hUsd,
    trades24h: totalTradeCount,
    activeBots,
    totalBots: Object.keys(strategyLabels).length,
  }

  const portfolioChartData = useMemo<BacktestEquityPoint[]>(
    () =>
      dashboard.portfolioPerformance.map((point, index, all) => ({
        label:
          index === 0 || index === all.length - 1 || index % Math.max(Math.floor(all.length / 4), 1) === 0
            ? chartLabelFormatter.format(new Date(point.timestamp))
            : '',
        timestamp: point.timestamp,
        equity: point.equityUsd,
      })),
    [dashboard.portfolioPerformance],
  )

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
  const selectedActiveBot = useMemo<ActiveStrategy | undefined>(
    () => dashboard.activeStrategies.find((bot) => bot.id === selectedActiveBotId),
    [dashboard.activeStrategies, selectedActiveBotId],
  )

  function resetCreateBotComposer(nextStrategy: StrategyKey = selectedBotType) {
    aiDraftRequestRef.current += 1
    setSelectedBotType(nextStrategy)
    setCreateBotError(undefined)
    setAiDraftError(undefined)
    setAiDraft(undefined)
    setIsAiDraftLoading(false)
    setIsAiPilotEnabled(true)
    setGridLowerPrice('')
    setGridUpperPrice('')
    setGridCount('8')
    setGridSpacing('2')
    setIsGridStopLossEnabled(false)
    setGridStopLoss('10')
    setBotBudgetUsd('')
    setRebalanceTargetRatio('50')
    setRebalanceThreshold('5')
    setRebalanceInterval('60')
    setInfinityReferencePrice(Math.round(market.price).toString())
    setInfinitySpacingPct('1.5')
    setInfinityOrderSizeUsd('100')
    setInfinityLevelsPerSide('6')
  }

  function openCreateBotModal(strategy: StrategyKey = 'grid') {
    resetCreateBotComposer(strategy)
    setIsCreateBotModalOpen(true)
  }

  function closeCreateBotModal() {
    if (isCreatingBot) return
    setIsCreateBotModalOpen(false)
  }

  function applyAiDraftToForm(draft: AiBotDraft) {
    setBotBudgetUsd(draft.budgetUsd.toFixed(2))

    if (draft.strategy === 'grid' && draft.gridConfig) {
      setGridLowerPrice(draft.gridConfig.lower_price.toFixed(2))
      setGridUpperPrice(draft.gridConfig.upper_price.toFixed(2))
      setGridCount(String(draft.gridConfig.grid_count))
      setGridSpacing(draft.gridConfig.spacing_pct.toFixed(1))
      setIsGridStopLossEnabled(Boolean(draft.gridConfig.stop_loss_enabled))
      setGridStopLoss(draft.gridConfig.stop_loss_pct?.toFixed(1) ?? '10')
      return
    }

    if (draft.strategy === 'rebalance' && draft.rebalanceConfig) {
      setRebalanceTargetRatio((draft.rebalanceConfig.target_btc_ratio * 100).toFixed(0))
      setRebalanceThreshold(draft.rebalanceConfig.rebalance_threshold_pct.toFixed(1))
      setRebalanceInterval(String(draft.rebalanceConfig.interval_minutes))
      return
    }

    if (draft.strategy === 'infinity-grid' && draft.infinityConfig) {
      setInfinityReferencePrice(draft.infinityConfig.reference_price.toFixed(2))
      setInfinitySpacingPct(draft.infinityConfig.spacing_pct.toFixed(1))
      setInfinityOrderSizeUsd(draft.infinityConfig.order_size_usd.toFixed(2))
      setInfinityLevelsPerSide(String(draft.infinityConfig.levels_per_side))
    }
  }
  const gridPreview = useMemo<LadderPreviewModel | undefined>(() => {
    const lowerPrice = parsePositiveNumber(gridLowerPrice)
    const upperPrice = parsePositiveNumber(gridUpperPrice)
    const gridLevelCount = parsePositiveInteger(gridCount)
    const spacingPct = parsePositiveNumber(gridSpacing)

    if (!lowerPrice || !upperPrice || !gridLevelCount || !spacingPct || upperPrice <= lowerPrice) {
      return undefined
    }

    const levels = buildGridLevels(lowerPrice, upperPrice, gridLevelCount, spacingPct)
    if (levels.length === 0) {
      return undefined
    }

    const buyLevels = levels.filter((level) => level < market.price)
    const sellLevels = levels.filter((level) => level > market.price)

    return {
      title: 'Fixed-range ladder around the live spot',
      subtitle:
        'This mirrors the backend grid calculation, with lower levels marked as buys and upper levels marked as sells around the current market.',
      levels: [
        ...levels.map<LadderPreviewLevel>((level, index) => ({
          id: `grid-${index}-${level}`,
          price: level,
          kind: level < market.price ? 'buy' : 'sell',
          label: `${level < market.price ? 'Buy' : 'Sell'} L${index + 1}`,
        })),
        {
          id: 'grid-spot',
          price: market.price,
          kind: 'spot',
          label: 'Spot now',
        },
      ],
      badges: [
        `${levels.length} generated levels`,
        `${buyLevels.length} below spot`,
        `${sellLevels.length} above spot`,
        `${spacingPct.toFixed(2)}% spacing`,
      ],
      notes: [
        `Configured range: ${formatCurrency(lowerPrice)} to ${formatCurrency(upperPrice)}.`,
        `Spot is currently ${formatCurrency(market.price)}, so the ladder splits into ${buyLevels.length} buy levels below and ${sellLevels.length} sell levels above.`,
        'Paper mode currently seeds cash first, so the lower side is the portion most likely to appear immediately on launch unless BTC inventory is already available.',
      ],
    }
  }, [gridCount, gridLowerPrice, gridSpacing, gridUpperPrice, market.price])
  const infinityPreview = useMemo<LadderPreviewModel | undefined>(() => {
    const referencePrice = parsePositiveNumber(infinityReferencePrice)
    const spacingPct = parsePositiveNumber(infinitySpacingPct)
    const levelsPerSide = parsePositiveInteger(infinityLevelsPerSide)

    if (!referencePrice || !spacingPct || !levelsPerSide) {
      return undefined
    }

    const pivotIndex = infinityIndexBelow(referencePrice, spacingPct, market.price)
    const buyLevels = Array.from({ length: levelsPerSide }, (_, offset) =>
      infinityLevelAt(referencePrice, spacingPct, pivotIndex - offset),
    )
    const sellLevels = Array.from({ length: levelsPerSide }, (_, offset) =>
      infinityLevelAt(referencePrice, spacingPct, pivotIndex + 1 + offset),
    )

    return {
      title: 'Geometric ladder that tracks the live market',
      subtitle:
        'The preview shows the active buy window below spot and sell window above spot, while keeping your reference price as the geometric anchor.',
      levels: [
        ...sellLevels.map<LadderPreviewLevel>((level, index) => ({
          id: `infinity-sell-${index}-${level}`,
          price: level,
          kind: 'sell',
          label: `Sell +${index + 1}`,
        })),
        {
          id: 'infinity-spot',
          price: market.price,
          kind: 'spot',
          label: 'Spot now',
        },
        ...buyLevels.map<LadderPreviewLevel>((level, index) => ({
          id: `infinity-buy-${index}-${level}`,
          price: level,
          kind: 'buy',
          label: `Buy -${index + 1}`,
        })),
      ],
      badges: [
        `${levelsPerSide} levels per side`,
        `${buyLevels.length} buys ready`,
        `${sellLevels.length} sells ready`,
        `Reference ${formatCurrency(referencePrice)}`,
      ],
      notes: [
        `Reference price anchors the whole curve at ${formatCurrency(referencePrice)}.`,
        `At ${formatCurrency(market.price)} spot, the active ladder starts near ${formatCurrency(buyLevels[0])} below and ${formatCurrency(sellLevels[0])} above.`,
        `Each rung is ${spacingPct.toFixed(2)}% away from the next one, so wider spacing means fewer fills and tighter spacing means more frequent re-arming.`,
      ],
    }
  }, [infinityLevelsPerSide, infinityReferencePrice, infinitySpacingPct, market.price])
  const parsedBudgetUsd = useMemo(() => parsePositiveNumber(botBudgetUsd), [botBudgetUsd])
  const selectedCreateMeta = strategyCreateMeta[selectedBotType]
  const selectedCreateTone = createModalTone(selectedBotType)
  const aiDraftMetrics = useMemo(() => buildAiDraftMetrics(aiDraft), [aiDraft])
  const budgetPresets = useMemo(() => {
    const reservePreset = Math.floor(dashboard.availableReserveUsd)
    return Array.from(new Set([250, 500, 1000, reservePreset]))
      .filter((amount) => amount > 0 && amount <= Math.max(reservePreset, 0))
      .sort((left, right) => left - right)
  }, [dashboard.availableReserveUsd])
  const botBudgetAssessment = useMemo(
    () =>
      buildBudgetAssessment({
        strategy: selectedBotType,
        budgetUsd: parsedBudgetUsd,
        availableCashUsd: dashboard.availableReserveUsd,
        marketPrice: market.price,
        gridLowerPrice: parsePositiveNumber(gridLowerPrice),
        gridUpperPrice: parsePositiveNumber(gridUpperPrice),
        gridCount: parsePositiveInteger(gridCount),
        gridSpacing: parsePositiveNumber(gridSpacing),
        rebalanceTargetRatio: Number.parseFloat(rebalanceTargetRatio),
        rebalanceThreshold: Number.parseFloat(rebalanceThreshold),
        rebalanceInterval: Number.parseInt(rebalanceInterval, 10),
        infinityReferencePrice: parsePositiveNumber(infinityReferencePrice),
        infinitySpacingPct: parsePositiveNumber(infinitySpacingPct),
        infinityOrderSizeUsd: parsePositiveNumber(infinityOrderSizeUsd),
        infinityLevelsPerSide: parsePositiveInteger(infinityLevelsPerSide),
      }),
    [
      dashboard.availableReserveUsd,
      gridCount,
      gridLowerPrice,
      gridSpacing,
      gridUpperPrice,
      infinityLevelsPerSide,
      infinityOrderSizeUsd,
      infinityReferencePrice,
      infinitySpacingPct,
      market.price,
      parsedBudgetUsd,
      rebalanceInterval,
      rebalanceTargetRatio,
      rebalanceThreshold,
      selectedBotType,
    ],
  )
  const isCreateBudgetBlocked =
    !parsedBudgetUsd
    || parsedBudgetUsd > dashboard.availableReserveUsd
    || (botBudgetAssessment.isReady && !botBudgetAssessment.isEnough)
  const isCreateActionBlocked =
    isCreatingBot
    || isCreateBudgetBlocked
    || (isAiPilotEnabled && (isAiDraftLoading || !aiDraft))

  useEffect(() => {
    if (!isCreateBotModalOpen || !isAiPilotEnabled) {
      setIsAiDraftLoading(false)
      return
    }

    if (!parsedBudgetUsd) {
      setAiDraft(undefined)
      setAiDraftError(undefined)
      setIsAiDraftLoading(false)
      return
    }

    const requestId = aiDraftRequestRef.current + 1
    aiDraftRequestRef.current = requestId
    setAiDraftError(undefined)

    const timeoutId = window.setTimeout(async () => {
      try {
        setIsAiDraftLoading(true)
        const draft = await getAiBotDraft({
          // @ts-ignore
          data: {
            strategy: selectedBotType,
            budgetUsd: parsedBudgetUsd,
          },
        })

        if (aiDraftRequestRef.current !== requestId) return

        setAiDraft(draft)
        applyAiDraftToForm(draft)
        setCreateBotError(undefined)
      } catch (error) {
        if (aiDraftRequestRef.current !== requestId) return
        setAiDraft(undefined)
        setAiDraftError(
          error instanceof Error
            ? error.message
            : 'Unable to prepare an AI-managed setup right now.',
        )
      } finally {
        if (aiDraftRequestRef.current === requestId) {
          setIsAiDraftLoading(false)
        }
      }
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [isAiPilotEnabled, isCreateBotModalOpen, parsedBudgetUsd, selectedBotType])

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
      if (isAiPilotEnabled) {
        if (isAiDraftLoading) {
          setCreateBotError('AI Pilot is still preparing the launch setup. Give it a moment.')
          return
        }

        if (!aiDraft) {
          setCreateBotError('Enter a budget first so AI Pilot can build the bot parameters.')
          return
        }
      }

      const budgetUsd = Number.parseFloat(botBudgetUsd)
      if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
        setCreateBotError('Enter a bot budget greater than $0 before starting this strategy.')
        return
      }
      if (budgetUsd > dashboard.availableReserveUsd) {
        setCreateBotError(
          `This bot needs ${formatCurrency(budgetUsd)}, but only ${formatCurrency(dashboard.availableReserveUsd)} is available in reserve.`,
        )
        return
      }
      if (botBudgetAssessment.isReady && !botBudgetAssessment.isEnough) {
        setCreateBotError(botBudgetAssessment.message)
        return
      }

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
            budgetUsd,
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
            budgetUsd,
            rebalanceConfig: {
              targetBtcRatio: targetRatioPct / 100,
              rebalanceThresholdPct: thresholdPct,
              intervalMinutes,
            },
          },
        })
      } else {
        const referencePrice = Number.parseFloat(infinityReferencePrice)
        const spacingPct = Number.parseFloat(infinitySpacingPct)
        const orderSizeUsd = Number.parseFloat(infinityOrderSizeUsd)
        const levelsPerSide = Number.parseInt(infinityLevelsPerSide, 10)

        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
          setCreateBotError('Infinity Grid reference price must be greater than 0.')
          return
        }
        if (!Number.isFinite(spacingPct) || spacingPct <= 0) {
          setCreateBotError('Infinity Grid spacing must be greater than 0%.')
          return
        }
        if (!Number.isFinite(orderSizeUsd) || orderSizeUsd <= 0) {
          setCreateBotError('Order size must be greater than $0.')
          return
        }
        if (!Number.isInteger(levelsPerSide) || levelsPerSide < 1) {
          setCreateBotError('Levels per side must be a whole number greater than or equal to 1.')
          return
        }

        nextDashboard = await createBot({
          // @ts-ignore
          data: {
            strategy: 'infinity-grid',
            budgetUsd,
            infinityConfig: {
              referencePrice,
              spacingPct,
              orderSizeUsd,
              levelsPerSide,
            },
          },
        })
      }

      setDashboard(nextDashboard)
      setIsCreateBotModalOpen(false)
      resetCreateBotComposer(selectedBotType)
    } catch (error) {
      setCreateBotError(error instanceof Error ? error.message : 'Unable to create the bot right now.')
    } finally {
      setIsCreatingBot(false)
    }
  }

  async function handleStopActiveBot() {
    if (!selectedActiveBot) return

    try {
      setIsStoppingBot(true)
      setBotControlError(undefined)
      setBotControlFeedback(undefined)
      await stopBot({
        // @ts-ignore
        data: { botId: selectedActiveBot.id },
      })
      const nextDashboard = await getDashboard()
      setDashboard(nextDashboard.dashboard)
      setMarket(nextDashboard.market)
      setConnection(nextDashboard.connection)
      setBotControlFeedback(
        `${selectedActiveBot.name} received a stop request. The dashboard will update as soon as the worker exits cleanly.`,
      )
    } catch (error) {
      setBotControlError(error instanceof Error ? error.message : 'Unable to stop this bot right now.')
    } finally {
      setIsStoppingBot(false)
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
                  <span
                    className={cx(
                      'flex items-center rounded px-1.5 py-0.5 text-xs font-normal',
                      metricsData.balanceChange >= 0
                        ? 'bg-emerald-400/10 text-emerald-400'
                        : 'bg-rose-400/10 text-rose-400',
                    )}
                  >
                    <Icon
                      icon={
                        metricsData.balanceChange >= 0
                          ? 'solar:arrow-right-up-linear'
                          : 'solar:arrow-right-down-linear'
                      }
                      width={12}
                      height={12}
                      className="mr-0.5"
                    />
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
              footer={
                <span className="text-xs font-normal text-zinc-500">
                  Reserve value {formatCurrency(metricsData.availableReserve)} • Idle USD {formatCurrency(metricsData.availableCash)}
                </span>
              }
              value={formatCurrency(metricsData.totalBalance)}
            />
            <MetricCard
              accent={metricsData.profit24h >= 0 ? 'positive' : 'negative'}
              footer={
                <span className="text-xs font-normal text-zinc-500">
                  {metricsData.trades24h} trades executed • {activeBots} bot{activeBots === 1 ? '' : 's'} contributing
                </span>
              }
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
              footer={
                <span className="text-xs font-normal text-zinc-500">
                  BTC sitting in reserve and ready for another bot
                </span>
              }
              icon="solar:bitcoin-circle-linear"
              label="Remain BTC"
              value={formatBtc(metricsData.availableBtc)}
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

            <div className="h-72 p-5">
              {portfolioChartData.length ? (
                <BacktestEquityChart
                  className="h-full"
                  data={portfolioChartData}
                  isLightTheme={effectiveTheme === 'light'}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/70 text-sm text-zinc-500">
                  Portfolio history will appear after the first balance snapshot is recorded.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="flex flex-col lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-medium tracking-tight text-zinc-100">Active Strategies</h2>
                <button
                  className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-normal text-zinc-900 transition-colors hover:bg-zinc-200"
                  type="button"
                  onClick={() => openCreateBotModal('grid')}
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
                              className="cursor-pointer border-t border-zinc-800/30 transition-colors hover:bg-zinc-900/20"
                              key={bot.id}
                              onClick={() => {
                                setBotControlError(undefined)
                                setBotControlFeedback(undefined)
                                setSelectedActiveBotId(bot.id)
                              }}
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
                                      Started {formatTimeAgo(bot.createdAt)} • {bot.tradeCount} executed trade
                                      {bot.tradeCount === 1 ? '' : 's'}
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
                                <div className="mt-1 text-xs text-zinc-500">
                                  Budget {formatCurrency(bot.budgetUsd)} • Equity {formatCurrency(bot.currentEquityUsd)}
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
                      onClick={() => openCreateBotModal('grid')}
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
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/72 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-6">
          <button
            aria-label="Close new bot modal"
            className="absolute inset-0"
            type="button"
            onClick={closeCreateBotModal}
          />
          <div className="relative z-10 mx-auto my-4 w-full max-w-7xl overflow-hidden rounded-[2rem] border border-zinc-800/90 bg-[#0a0a0a] shadow-2xl shadow-black/60">
            <button
              aria-label="Close new bot modal"
              className="absolute right-4 top-4 z-20 rounded-full border border-zinc-800 bg-zinc-950/90 p-2 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 lg:right-[calc(55%+1.25rem)] lg:top-5"
              type="button"
              onClick={closeCreateBotModal}
            >
              <Icon icon="solar:close-circle-linear" width={22} height={22} />
            </button>

            <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="flex flex-col gap-8 border-b border-zinc-800/80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.04),_transparent_58%)] p-6 lg:min-h-[860px] lg:border-b-0 lg:border-r lg:p-8">
                <div className="pr-14">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
                      Strategy Launcher
                    </p>
                    <h2 className="mt-3 text-3xl font-medium tracking-tight text-zinc-100 sm:text-[2.1rem]">
                      Let the model handle the setup
                    </h2>
                    <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">
                      Pick the bot archetype, enter the budget, and AI Pilot will draft a
                      market-aware launch plan you can still fine-tune manually before you
                      initialize it.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  {botCatalog.map((bot) => {
                    const isSelected = bot.key === selectedBotType
                    return (
                      <button
                        className={cx(
                          'group relative overflow-hidden rounded-[1.35rem] border px-5 py-5 text-left transition sm:px-6 sm:py-6',
                          isSelected
                            ? selectedCreateTone.activeCard
                            : 'border-zinc-800/80 bg-zinc-900/35 hover:border-zinc-700 hover:bg-zinc-900/60',
                        )}
                        key={bot.key}
                        type="button"
                        onClick={() => {
                          setCreateBotError(undefined)
                          setAiDraftError(undefined)
                          setAiDraft(undefined)
                          setSelectedBotType(bot.key)
                        }}
                      >
                        {isSelected ? (
                          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
                        ) : null}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p
                              className={cx(
                                'text-[11px] font-semibold uppercase tracking-[0.28em]',
                                isSelected ? selectedCreateTone.accentText : 'text-zinc-500 group-hover:text-zinc-400',
                              )}
                            >
                              {bot.eyebrow}
                            </p>
                            <h3 className="mt-2 text-xl font-medium text-zinc-100 sm:text-[1.35rem]">
                              {strategyLabels[bot.key]}
                            </h3>
                          </div>
                          <div
                            className={cx(
                              'flex h-11 w-11 items-center justify-center rounded-2xl border bg-zinc-950/70',
                              isSelected
                                ? selectedCreateTone.iconSurface
                                : 'border-zinc-800 text-zinc-400 group-hover:border-zinc-700 group-hover:text-zinc-200',
                            )}
                          >
                            <Icon icon={bot.icon} width={20} height={20} />
                          </div>
                        </div>
                        <p className="relative mt-3 text-sm leading-6 text-zinc-400 group-hover:text-zinc-300">
                          {bot.description}
                        </p>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-auto grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.35rem] border border-zinc-800/80 bg-zinc-900/45 px-5 py-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Spot now</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
                      {formatCurrency(market.price)}
                    </p>
                    <p
                      className={cx(
                        'mt-2 text-sm font-medium',
                        market.change_24h_pct >= 0 ? 'text-emerald-300' : 'text-rose-300',
                      )}
                    >
                      {formatPercent(market.change_24h_pct)}
                    </p>
                  </div>
                  <div className="rounded-[1.35rem] border border-zinc-800/80 bg-zinc-900/45 px-5 py-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Market regime</p>
                    <p className="mt-3 text-xl font-medium capitalize text-zinc-100">{market.trend}</p>
                    <p className="mt-2 text-sm text-zinc-500">
                      24h volatility {market.volatility_24h_pct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0c0c0c] p-6 lg:p-8">
                <form className="flex h-full flex-col gap-6" onSubmit={handleCreateBotSubmit}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <p className={cx('text-xs font-medium uppercase tracking-[0.28em]', selectedCreateTone.accentText)}>
                        Initialize Bot
                      </p>
                      <h3 className="mt-3 text-3xl font-medium tracking-tight text-zinc-100">
                        {strategyLabels[selectedBotType]}
                      </h3>
                      <p className="mt-3 text-base leading-7 text-zinc-400">
                        {isAiPilotEnabled
                          ? selectedCreateMeta.aiDescription
                          : selectedCreateMeta.manualDescription}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-2 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-zinc-300">AI Pilot</span>
                        <button
                          aria-checked={isAiPilotEnabled}
                          aria-label="Toggle AI Pilot"
                          className={cx(
                            'relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none',
                            isAiPilotEnabled ? selectedCreateTone.toggleTrack : 'bg-zinc-800',
                          )}
                          role="switch"
                          type="button"
                          onClick={() => {
                            setCreateBotError(undefined)
                            setAiDraftError(undefined)
                            setIsAiPilotEnabled((current) => !current)
                          }}
                        >
                          <span
                            className={cx(
                              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                              isAiPilotEnabled ? 'left-[22px]' : 'left-0.5',
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="flex flex-col gap-4">
                      <label className="block">
                        <span className="mb-3 block text-sm font-medium text-zinc-300">Investment (USD)</span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                            $
                          </span>
                          <input
                            className={cx(
                              'w-full rounded-[1.15rem] border border-zinc-800 bg-[#111] py-3 pl-9 pr-4 text-lg font-medium text-zinc-100 outline-none transition placeholder:text-zinc-600',
                              selectedCreateMeta.inputFocus,
                            )}
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            placeholder={dashboard.availableReserveUsd.toFixed(2)}
                            type="number"
                            value={botBudgetUsd}
                            onChange={(event) => setBotBudgetUsd(event.target.value)}
                          />
                        </div>
                      </label>

                      <div className="flex flex-wrap gap-2">
                        {budgetPresets.map((amount) => (
                          <button
                            className={cx(
                              'rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                              Number(botBudgetUsd) === amount
                                ? selectedCreateTone.quickBudgetActive
                                : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100',
                            )}
                            key={amount}
                            type="button"
                            onClick={() => setBotBudgetUsd(String(amount))}
                          >
                            {amount === Math.floor(dashboard.availableReserveUsd)
                              ? 'Max reserve'
                              : formatCurrency(amount)}
                          </button>
                        ))}
                      </div>

                      <p className="text-sm text-zinc-500">
                        Available reserve: <span className="text-zinc-300">{formatCurrency(dashboard.availableReserveUsd)}</span>
                      </p>
                    </div>

                    <div
                      className={cx(
                        'rounded-[1.35rem] border px-5 py-5 text-sm leading-6',
                        botBudgetAssessment.tone === 'positive'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                          : botBudgetAssessment.tone === 'negative'
                            ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400',
                      )}
                    >
                      <p className="text-xs font-medium uppercase tracking-[0.24em] opacity-80">
                        Budget Check
                      </p>
                      <p className="mt-3">
                        {botBudgetAssessment.message}
                      </p>
                      {botBudgetAssessment.requiredBudgetUsd ? (
                        <p className="mt-3 text-xs opacity-80">
                          Minimum realistic budget: {formatCurrency(botBudgetAssessment.requiredBudgetUsd)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[1.15rem] border border-zinc-800/80 bg-[#111] px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Pair</p>
                      <p className="mt-2 text-base font-medium text-zinc-100">BTC/USDT</p>
                    </div>
                    <div className="rounded-[1.15rem] border border-zinc-800/80 bg-[#111] px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">24h Change</p>
                      <p className={cx('mt-2 text-base font-medium', market.change_24h_pct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                        {formatPercent(market.change_24h_pct)}
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-zinc-800/80 bg-[#111] px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Volatility</p>
                      <p className="mt-2 text-base font-medium text-zinc-100">
                        {market.volatility_24h_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-[1.15rem] border border-zinc-800/80 bg-[#111] px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Trend</p>
                      <p className="mt-2 truncate text-base font-medium capitalize text-zinc-100">{market.trend}</p>
                    </div>
                  </div>

                  {isAiPilotEnabled ? (
                    <div className="flex flex-col gap-5">
                      <div className={cx('relative overflow-hidden rounded-[1.5rem] border p-5 sm:p-6', selectedCreateTone.aiCard)}>
                        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-white/0 via-white/30 to-white/0" />
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={cx('text-xs font-medium uppercase tracking-[0.28em]', selectedCreateTone.aiAccent)}>
                              AI Pilot
                            </p>
                            <h4 className="mt-3 text-xl font-medium tracking-tight text-zinc-100 sm:text-2xl">
                              {parsedBudgetUsd
                                ? aiDraft?.headline ?? 'Preparing the managed setup...'
                                : 'Enter a budget and AI Pilot will draft the setup.'}
                            </h4>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                              {parsedBudgetUsd
                                ? aiDraft?.rationale
                                  ?? 'The model is reading the current BTC regime and filling in the launch parameters.'
                                : 'This mode uses the analyst engine to adapt the launch parameters to the current BTC market before you initialize the bot.'}
                            </p>
                          </div>
                          <div className={cx('flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-zinc-950/70', selectedCreateTone.aiIcon)}>
                            {isAiDraftLoading ? (
                              <Icon icon="solar:refresh-line-duotone" width={18} height={18} className="animate-spin" />
                            ) : (
                              <Icon icon="solar:stars-line-duotone" width={18} height={18} />
                            )}
                          </div>
                        </div>

                        {aiDraft ? (
                          <>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {aiDraft.highlights.map((highlight) => (
                                <span
                                  className="rounded-full border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-300"
                                  key={highlight}
                                >
                                  {highlight}
                                </span>
                              ))}
                            </div>
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                              {aiDraftMetrics.map((item) => (
                                <div
                                  className="rounded-[1rem] border border-zinc-800/70 bg-zinc-950/60 px-4 py-3"
                                  key={item.label}
                                >
                                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                                    {item.label}
                                  </p>
                                  <p className="mt-2 text-sm font-medium text-zinc-100">{item.value}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-5 rounded-[1rem] border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400">
                              <p className="font-medium text-zinc-100">Generated configuration</p>
                              <p className="mt-2 leading-6">{aiDraft.configSummary}</p>
                              <p className="mt-2 text-xs text-zinc-500">
                                Switch AI Pilot off if you want to tweak any of these values manually before launch.
                              </p>
                            </div>
                          </>
                        ) : null}
                      </div>

                      {selectedBotType === 'grid' ? <LadderPreview model={gridPreview} /> : null}
                      {selectedBotType === 'infinity-grid' ? <LadderPreview model={infinityPreview} /> : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      <div className="rounded-[1.5rem] border border-zinc-800/80 bg-zinc-900/30 p-5 sm:p-6">
                        <div>
                          <p className={cx('text-xs font-medium uppercase tracking-[0.28em]', selectedCreateMeta.accentText)}>
                            {selectedCreateMeta.sectionEyebrow}
                          </p>
                          <h4 className="mt-3 text-2xl font-medium tracking-tight text-zinc-100">
                            {selectedCreateMeta.sectionTitle}
                          </h4>
                          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                            {selectedCreateMeta.manualDescription}
                          </p>
                        </div>

                        {selectedBotType === 'grid' ? (
                          <>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-zinc-300">Lower price</span>
                                <input
                                  className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  type="number"
                                  value={gridLowerPrice}
                                  onChange={(event) => setGridLowerPrice(event.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-zinc-300">Upper price</span>
                                <input
                                  className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  type="number"
                                  value={gridUpperPrice}
                                  onChange={(event) => setGridUpperPrice(event.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-zinc-300">Grid levels</span>
                                <input
                                  className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                  inputMode="numeric"
                                  min="2"
                                  step="1"
                                  type="number"
                                  value={gridCount}
                                  onChange={(event) => setGridCount(event.target.value)}
                                />
                              </label>
                              <label className="block">
                                <span className="mb-2 block text-sm font-medium text-zinc-300">Spacing (%)</span>
                                <input
                                  className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                  inputMode="decimal"
                                  min="0.1"
                                  step="0.1"
                                  type="number"
                                  value={gridSpacing}
                                  onChange={(event) => setGridSpacing(event.target.value)}
                                />
                              </label>
                            </div>

                            <div className="mt-5 rounded-[1.25rem] border border-zinc-800 bg-zinc-900/50 p-4">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-medium text-zinc-200">Stop loss</p>
                                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                                    Enable this only if you want the bot to warn when price breaks below your safety threshold.
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
                                      isGridStopLossEnabled ? 'left-6 bg-zinc-950' : 'left-1 bg-zinc-500',
                                    )}
                                  />
                                </button>
                              </div>
                              {isGridStopLossEnabled ? (
                                <label className="mt-4 block">
                                  <span className="mb-2 block text-sm font-medium text-zinc-300">Stop loss (%)</span>
                                  <input
                                    className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                    inputMode="decimal"
                                    min="0.1"
                                    step="0.1"
                                    type="number"
                                    value={gridStopLoss}
                                    onChange={(event) => setGridStopLoss(event.target.value)}
                                  />
                                </label>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        {selectedBotType === 'rebalance' ? (
                          <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">
                                Target BTC allocation (%)
                              </span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="decimal"
                                min="0"
                                max="100"
                                step="1"
                                type="number"
                                value={rebalanceTargetRatio}
                                onChange={(event) => setRebalanceTargetRatio(event.target.value)}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">Drift threshold (%)</span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="decimal"
                                min="0.1"
                                step="0.1"
                                type="number"
                                value={rebalanceThreshold}
                                onChange={(event) => setRebalanceThreshold(event.target.value)}
                              />
                            </label>
                            <label className="block sm:col-span-2">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">Check interval (minutes)</span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="numeric"
                                min="1"
                                step="1"
                                type="number"
                                value={rebalanceInterval}
                                onChange={(event) => setRebalanceInterval(event.target.value)}
                              />
                            </label>
                          </div>
                        ) : null}

                        {selectedBotType === 'infinity-grid' ? (
                          <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">Reference price</span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                type="number"
                                value={infinityReferencePrice}
                                onChange={(event) => setInfinityReferencePrice(event.target.value)}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">Spacing (%)</span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="decimal"
                                min="0.1"
                                step="0.1"
                                type="number"
                                value={infinitySpacingPct}
                                onChange={(event) => setInfinitySpacingPct(event.target.value)}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">Order size (USD)</span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                type="number"
                                value={infinityOrderSizeUsd}
                                onChange={(event) => setInfinityOrderSizeUsd(event.target.value)}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-sm font-medium text-zinc-300">Levels per side</span>
                              <input
                                className={cx('w-full rounded-[1rem] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600', selectedCreateMeta.inputFocus)}
                                inputMode="numeric"
                                min="1"
                                step="1"
                                type="number"
                                value={infinityLevelsPerSide}
                                onChange={(event) => setInfinityLevelsPerSide(event.target.value)}
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>

                      {selectedBotType === 'grid' ? <LadderPreview model={gridPreview} /> : null}
                      {selectedBotType === 'infinity-grid' ? <LadderPreview model={infinityPreview} /> : null}
                    </div>
                  )}

                  <div className="mt-auto grid gap-3">
                    <div className={cx('rounded-[1.25rem] border px-4 py-4 text-sm leading-6', selectedCreateTone.helperCard)}>
                      {selectedCreateMeta.launchNote}
                    </div>
                    <div className="rounded-[1.25rem] border border-dashed border-zinc-800 bg-[#0a0a0a] px-4 py-4 text-sm text-zinc-500">
                      {isAiPilotEnabled
                        ? 'AI Pilot will keep the parameters synced to the current budget and selected strategy.'
                        : 'Manual mode is on. The values below are exactly what will be submitted.'}
                    </div>
                  </div>

                  {aiDraftError ? (
                    <div className="rounded-[1.15rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      {aiDraftError}
                    </div>
                  ) : null}

                  {createBotError ? (
                    <div className="rounded-[1.15rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      {createBotError}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      <span className={cx('h-2.5 w-2.5 rounded-full', selectedCreateTone.dot)} />
                      <span>Review setup and launch</span>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                        disabled={isCreatingBot}
                        type="button"
                        onClick={closeCreateBotModal}
                      >
                        Cancel
                      </button>
                      <button
                        className={cx(
                          'rounded-xl px-5 py-2 text-sm font-medium transition disabled:cursor-not-allowed',
                          selectedCreateMeta.primaryButton,
                        )}
                        disabled={isCreateActionBlocked}
                        type="submit"
                      >
                        {isCreatingBot ? 'Initializing bot...' : 'Initialize bot'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <BotControlModal
        bot={selectedActiveBot}
        error={botControlError}
        feedback={botControlFeedback}
        isStopping={isStoppingBot}
        onClose={() => setSelectedActiveBotId(undefined)}
        onStop={handleStopActiveBot}
      />

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
