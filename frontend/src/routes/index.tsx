import { createFileRoute } from '@tanstack/react-router'
import { MarketPhone, StatsPhone, SwapPhone } from '../components/showcase'

const featureCards = [
  {
    title: 'Market surfaces',
    body: 'Overview, wallet, swap, and stat states are styled as collectible mobile screens instead of flat admin panels.',
  },
  {
    title: 'Soft-risk framing',
    body: 'The UI keeps premium polish while still hinting at the safety rails that matter for a live trading product.',
  },
  {
    title: 'Route continuity',
    body: 'Every route now feels like part of one trading ecosystem rather than a placeholder set of disconnected cards.',
  },
]

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

function OverviewPage() {
  return (
    <div className="page">
      <section className="showcase-grid">
        <div className="showcase-copy">
          <p className="eyebrow">Overview</p>
          <h2>Trading bot software, reframed like a premium mobile exchange launch.</h2>
          <p className="lede">
            The redesign takes the existing Oscar routes and gives them the soft, luminous trading
            aesthetic from the reference: floating phone canvases, bright white glass, and calm
            violet accents that make the product feel collectible instead of utilitarian.
          </p>
          <div className="metric-band">
            <div className="metric-tile">
              <span>Primary pair</span>
              <strong>BTC / SOL / USDC</strong>
            </div>
            <div className="metric-tile">
              <span>Visual mode</span>
              <strong>Pastel glass UI</strong>
            </div>
            <div className="metric-tile">
              <span>Readiness</span>
              <strong>Prototype frontends live</strong>
            </div>
          </div>
        </div>
        <div className="phone-wall overview-wall" aria-label="Mobile trading dashboard showcase">
          <MarketPhone />
          <StatsPhone />
          <SwapPhone />
        </div>
      </section>

      <section className="feature-grid">
        {featureCards.map((item) => (
          <article className="feature-card" key={item.title}>
            <p className="eyebrow">Design shift</p>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
