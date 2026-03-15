import { createFileRoute } from '@tanstack/react-router'

const prompts = [
  'Summarize the current BTC volatility regime for paper-trading decisions.',
  'Recommend spread settings for the grid bot when the range is widening.',
  'Compare the latest backtest against the active paper bot and flag risk drift.',
]

export const Route = createFileRoute('/ai')({
  component: AIPage,
})

function AIPage() {
  return (
    <div className="page">
      <section className="hero-grid compact-grid">
        <div className="hero-copy">
          <p className="eyebrow">Research</p>
          <h2>Use AI as a strategy analyst, not a replacement for the dashboard.</h2>
          <p className="lede">
            The dashboard gives the operational controls; this route frames the kind of market
            questions an assistant can answer around regime, risk, and configuration tuning.
          </p>
        </div>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Prompt Pack</p>
            <h3>Useful analyst prompts</h3>
          </div>
        </div>
        <ul className="prompt-list">
          {prompts.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </article>
    </div>
  )
}
