import { createFileRoute } from '@tanstack/react-router'

const focusItems = [
  'Project structure and environment config',
  'Exchange abstraction with mock and CCXT clients',
  'Strategy prototypes for grid, rebalance, and infinity grid',
  'CLI status and demo commands',
  'TanStack Start web shell for future dashboard work',
]

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

function OverviewPage() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">MVP foundation</p>
          <h2>Bitcoin automation, built to be tested before it trades.</h2>
          <p className="lede">
            This phase sets up the backend architecture, strategy prototypes, and frontend shell so
            the next steps can focus on execution, risk controls, and live data.
          </p>
        </div>
        <div className="hero-metrics">
          <div className="metric">
            <span>Primary pair</span>
            <strong>BTC/USDT</strong>
          </div>
          <div className="metric">
            <span>Strategies</span>
            <strong>3 prototype flows</strong>
          </div>
          <div className="metric">
            <span>Frontend</span>
            <strong>TanStack Start</strong>
          </div>
        </div>
      </section>

      <section className="card-grid">
        {focusItems.map((item) => (
          <article className="card" key={item}>
            <p className="eyebrow">Delivered</p>
            <h3>{item}</h3>
          </article>
        ))}
      </section>
    </div>
  )
}

