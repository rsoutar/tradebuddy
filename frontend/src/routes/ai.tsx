import { createFileRoute } from '@tanstack/react-router'

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
      <section className="section-heading">
        <p className="eyebrow">AI workspace</p>
        <h2>Prompt scaffolding is ready for the live market assistant in Phase 2.</h2>
      </section>

      <div className="card">
        <p className="eyebrow">Sample queries</p>
        <ul className="prompt-list">
          {prompts.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

