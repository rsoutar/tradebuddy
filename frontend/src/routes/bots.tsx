import { createFileRoute } from '@tanstack/react-router'

const strategies = [
  {
    title: 'Grid Bot',
    regime: 'Sideways',
    detail: 'Places staggered simulated orders inside a defined BTC range and recycles capital on each fill.',
  },
  {
    title: 'Rebalance Bot',
    regime: 'Steady',
    detail: 'Keeps portfolio weights near a target allocation with smaller, lower-frequency adjustments.',
  },
  {
    title: 'Infinity Grid',
    regime: 'Trend',
    detail: 'Extends upward with price momentum while preserving trailing exits to protect paper gains.',
  },
]

export const Route = createFileRoute('/bots')({
  component: BotsPage,
})

function BotsPage() {
  return (
    <div className="page">
      <section className="hero-grid compact-grid">
        <div className="hero-copy">
          <p className="eyebrow">Strategies</p>
          <h2>Three bot profiles, each tuned for a different market rhythm.</h2>
          <p className="lede">
            Use the dashboard to switch between these bot profiles, run paper trading, and compare
            how each one behaves under backtest.
          </p>
        </div>
        <div className="panel">
          <p className="eyebrow">Selection Guide</p>
          <h3>Choose by regime, not by hype.</h3>
          <p className="panel-copy">
            Grid for chop, rebalance for steadier accumulation, and infinity grid when trend
            persistence matters more than mean reversion.
          </p>
        </div>
      </section>

      <section className="content-grid">
        {strategies.map((strategy) => (
          <article className="feature-card" key={strategy.title}>
            <p className="eyebrow">{strategy.regime}</p>
            <h3>{strategy.title}</h3>
            <p>{strategy.detail}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
