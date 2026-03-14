import { createFileRoute } from '@tanstack/react-router'
import { StatsPhone, StrategyPhone } from '../components/showcase'

const botCards = [
  {
    name: 'Grid Bot',
    description: 'Oscillation-focused order ladder inside a fixed price range.',
    mode: 'Sideways',
    allocation: '35%',
    spread: '0.8%',
    pnl: '+4.2% expected',
  },
  {
    name: 'Rebalance Bot',
    description: 'Target allocation strategy that nudges the portfolio back toward a BTC ratio.',
    mode: 'Steady',
    allocation: '50%',
    spread: '1.2%',
    pnl: '+2.6% expected',
  },
  {
    name: 'Infinity Grid Bot',
    description: 'Bull-market ladder that keeps extending as price rises.',
    mode: 'Trend',
    allocation: '65%',
    spread: '1.6%',
    pnl: '+6.8% expected',
  },
]

export const Route = createFileRoute('/bots')({
  component: BotsPage,
})

function BotsPage() {
  return (
    <div className="page">
      <section className="showcase-grid showcase-grid-tight">
        <div className="showcase-copy">
          <p className="eyebrow">Bot Prototypes</p>
          <h2>Each strategy now reads like a polished product state, not just a config card.</h2>
          <p className="lede">
            Grid, rebalance, and infinity grid are presented as glossy trading presets with clear
            modes, spacing, and projected outcomes. That keeps the technical detail while making
            the experience feel launch-ready.
          </p>
        </div>
        <div className="phone-wall bots-wall" aria-label="Strategy preview screens">
          <StrategyPhone
            title="Grid Bot"
            mode="Sideways"
            allocation="35%"
            spread="0.8%"
            pnl="+4.2% expected"
          />
          <StrategyPhone
            title="Rebalance"
            mode="Steady"
            allocation="50%"
            spread="1.2%"
            pnl="+2.6% expected"
          />
          <StatsPhone />
        </div>
      </section>

      <section className="feature-grid">
        {botCards.map((bot) => (
          <article className="feature-card" key={bot.name}>
            <p className="eyebrow">{bot.mode}</p>
            <h3>{bot.name}</h3>
            <p>{bot.description}</p>
            <div className="feature-meta">
              <span>{bot.allocation} capital</span>
              <span>{bot.spread} interval</span>
              <span>{bot.pnl}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
