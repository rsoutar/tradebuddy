import { createFileRoute } from '@tanstack/react-router'

const botCards = [
  {
    name: 'Grid Bot',
    description: 'Oscillation-focused order ladder inside a fixed price range.',
  },
  {
    name: 'Rebalance Bot',
    description: 'Target allocation strategy that nudges the portfolio back toward a BTC ratio.',
  },
  {
    name: 'Infinity Grid Bot',
    description: 'Bull-market ladder that keeps extending as price rises.',
  },
]

export const Route = createFileRoute('/bots')({
  component: BotsPage,
})

function BotsPage() {
  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Strategy prototypes</p>
        <h2>Phase 1 includes evaluation logic for each MVP bot type.</h2>
      </section>

      <section className="card-grid">
        {botCards.map((bot) => (
          <article className="card" key={bot.name}>
            <h3>{bot.name}</h3>
            <p>{bot.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

