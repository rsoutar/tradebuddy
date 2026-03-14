import { createFileRoute } from '@tanstack/react-router'
import { AssistantPhone, MarketPhone } from '../components/showcase'

const prompts = [
  'What is the current BTC market volatility regime?',
  'Suggest grid settings for a sideways market.',
  'How far is the current portfolio from a 50/50 BTC-USDT target?',
]

export const Route = createFileRoute('/ai')({
  component: AIPage,
})

function AIPage() {
  return (
    <div className="page">
      <section className="showcase-grid showcase-grid-tight">
        <div className="showcase-copy">
          <p className="eyebrow">AI Workspace</p>
          <h2>The assistant route now feels like a live strategy studio for market decisions.</h2>
          <p className="lede">
            Prompts, notes, and portfolio context sit inside the same floating mobile language, so
            the AI layer feels native to the trading product instead of bolted on later.
          </p>
        </div>
        <div className="phone-wall ai-wall" aria-label="AI workspace preview screens">
          <AssistantPhone />
          <MarketPhone />
        </div>
      </section>

      <div className="feature-card feature-card-wide">
        <p className="eyebrow">Sample queries</p>
        <h3>Prompt set for the phase-two market assistant.</h3>
        <ul className="prompt-list">
          {prompts.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
