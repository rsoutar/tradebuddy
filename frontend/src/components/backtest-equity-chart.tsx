import { useId } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
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
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export type BacktestEquityPoint = {
  label: string
  timestamp?: string
  equity: number
  realizedPnl?: number | null
  side?: 'buy' | 'sell'
}

function formatCurrency(value?: number) {
  return currencyFormatter.format(value ?? 0)
}

function formatDateTime(value?: string) {
  if (!value) return 'Not available'
  return dateTimeFormatter.format(new Date(value))
}

function formatDeltaCurrency(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${currencyFormatter.format(Math.abs(value))}`
}

function EquityTooltip({
  active,
  payload,
  isLightTheme,
}: {
  active?: boolean
  payload?: Array<{ payload: BacktestEquityPoint; value?: number }>
  isLightTheme: boolean
}) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div
      className={cx(
        'min-w-44 rounded-2xl border px-3 py-2 shadow-xl backdrop-blur-sm',
        isLightTheme
          ? 'border-stone-200 bg-white/95 text-stone-700'
          : 'border-zinc-800 bg-zinc-950/95 text-zinc-300',
      )}
    >
      <p className={cx('text-xs uppercase tracking-[0.18em]', isLightTheme ? 'text-stone-500' : 'text-zinc-500')}>
        {point.label}
      </p>
      <p className={cx('mt-2 text-lg font-semibold', isLightTheme ? 'text-stone-950' : 'text-zinc-100')}>
        {formatCurrency(point.equity)}
      </p>
      {point.timestamp ? (
        <p className={cx('mt-1 text-xs', isLightTheme ? 'text-stone-500' : 'text-zinc-500')}>
          {formatDateTime(point.timestamp)}
        </p>
      ) : null}
      {point.realizedPnl != null ? (
        <p
          className={cx(
            'mt-2 text-xs font-medium',
            point.realizedPnl > 0
              ? 'text-emerald-400'
              : point.realizedPnl < 0
                ? 'text-rose-400'
                : isLightTheme
                  ? 'text-stone-500'
                  : 'text-zinc-500',
          )}
        >
          Realized PnL {point.realizedPnl > 0 ? '+' : ''}
          {formatCurrency(point.realizedPnl)}
        </p>
      ) : null}
    </div>
  )
}

export function BacktestEquityChart({
  data,
  isLightTheme,
  className,
}: {
  data: BacktestEquityPoint[]
  isLightTheme: boolean
  className?: string
}) {
  const chartId = useId().replace(/:/g, '')
  const positiveLineId = `${chartId}-positive-line`
  const positiveGlowId = `${chartId}-positive-glow`
  const negativeGlowId = `${chartId}-negative-glow`
  const startingEquity = data[0]?.equity ?? 0
  const segmentedData = data.reduce<Array<BacktestEquityPoint & { positiveEquity: number | null; negativeEquity: number | null }>>(
    (points, point, index) => {
      const isPositive = point.equity >= startingEquity
      const currentPoint = {
        ...point,
        positiveEquity: isPositive ? point.equity : null,
        negativeEquity: isPositive ? null : point.equity,
      }

      if (index === 0) {
        points.push(currentPoint)
        return points
      }

      const previousPoint = data[index - 1]
      const previousPositive = previousPoint.equity >= startingEquity

      if (previousPositive !== isPositive) {
        const distance = point.equity - previousPoint.equity
        const ratio = distance === 0 ? 0 : (startingEquity - previousPoint.equity) / distance
        const crossoverPoint = {
          label: '',
          timestamp: point.timestamp,
          equity: startingEquity,
          realizedPnl: 0,
          side: point.side,
          positiveEquity: startingEquity,
          negativeEquity: startingEquity,
        }

        if (ratio >= 0 && ratio <= 1) {
          points.push(crossoverPoint)
        }
      }

      points.push(currentPoint)
      return points
    },
    [],
  )

  return (
    <div className={cx('w-full', className ?? 'h-48')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          accessibilityLayer
          data={segmentedData}
          margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke={isLightTheme ? 'rgba(214, 211, 209, 0.7)' : 'rgba(63, 63, 70, 0.45)'}
            strokeDasharray="3 4"
          />
          <XAxis
            axisLine={false}
            dataKey="label"
            minTickGap={24}
            tick={{ fill: isLightTheme ? '#78716c' : '#a1a1aa', fontSize: 12 }}
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            axisLine={false}
            domain={['dataMin - 25', 'dataMax + 25']}
            orientation="right"
            tick={{ fill: isLightTheme ? '#78716c' : '#a1a1aa', fontSize: 12 }}
            tickFormatter={(value: number) => formatDeltaCurrency(value - startingEquity)}
            tickLine={false}
            tickMargin={8}
            width={80}
          />
          <ReferenceLine
            stroke={isLightTheme ? 'rgba(168, 162, 158, 0.65)' : 'rgba(113, 113, 122, 0.55)'}
            strokeDasharray="4 4"
            y={startingEquity}
          />
          <Tooltip
            content={<EquityTooltip isLightTheme={isLightTheme} />}
            cursor={{
              stroke: isLightTheme ? 'rgba(168, 162, 158, 0.45)' : 'rgba(113, 113, 122, 0.45)',
              strokeDasharray: '4 4',
            }}
          />
          <Line
            dataKey="positiveEquity"
            type="linear"
            stroke={`url(#${positiveLineId})`}
            connectNulls={false}
            dot={false}
            filter={`url(#${positiveGlowId})`}
            isAnimationActive={false}
            strokeWidth={3}
          />
          <Line
            dataKey="negativeEquity"
            type="linear"
            stroke="#dc2626"
            connectNulls={false}
            dot={false}
            filter={`url(#${negativeGlowId})`}
            isAnimationActive={false}
            strokeWidth={3}
          />
          <defs>
            <linearGradient id={positiveLineId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#86efac" stopOpacity={0.95} />
              <stop offset="45%" stopColor="#4ade80" stopOpacity={0.96} />
              <stop offset="100%" stopColor="#15803d" stopOpacity={0.98} />
            </linearGradient>
            <filter id={positiveGlowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur result="blur" stdDeviation="8" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id={negativeGlowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur result="blur" stdDeviation="8" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
