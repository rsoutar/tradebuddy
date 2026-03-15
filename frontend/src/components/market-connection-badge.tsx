import { Icon } from '@iconify/react'
import type { MarketConnectionState, MarketState } from '../lib/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function MarketConnectionBadge({
  connection,
  market,
}: {
  connection: MarketConnectionState
  market: MarketState
}) {
  const healthy = connection.healthy
  return (
    <div
      className={cx(
        'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex',
        healthy
          ? 'border-emerald-900/30 bg-emerald-900/10 text-emerald-500'
          : 'border-rose-900/30 bg-rose-900/10 text-rose-300',
      )}
      title={connection.lastError ?? connection.source}
    >
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          healthy ? 'animate-pulse bg-emerald-500' : 'bg-rose-400',
        )}
      />
      <span>{`WSS ${connection.connected_streams}/${connection.configured_streams || 1}`}</span>
      <span className="text-zinc-500">{market.symbol}</span>
      <span className="inline-flex items-center gap-1 text-zinc-400">
        <Icon icon="solar:graph-up-linear" width={12} height={12} />
        {currencyFormatter.format(market.price)}
      </span>
    </div>
  )
}
