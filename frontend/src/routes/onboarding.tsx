import { createFileRoute } from '@tanstack/react-router'

const steps = [
  'Add LINE Login credentials and a session secret to the frontend environment.',
  'Validate paper-trading capital, risk limits, and allowed strategies before any live wiring.',
  'Use backtesting to compare drawdown, win rate, and profit factor before promoting a bot.',
]

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  return (
    <div className="page">
      <section className="hero-grid compact-grid">
        <div className="hero-copy">
          <p className="eyebrow">Setup</p>
          <h2>Prepare the auth and safety rails before a trader ever sees the dashboard.</h2>
          <p className="lede">
            Oscar is designed for a simulation-first rollout: LINE Login at the front door, paper
            trading inside the dashboard, and backtests as the final check before anything live.
          </p>
        </div>
      </section>

      <section className="content-grid">
        {steps.map((step, index) => (
          <article className="feature-card" key={step}>
            <p className="eyebrow">Step {index + 1}</p>
            <h3>{step}</h3>
          </article>
        ))}
      </section>
    </div>
  )
}
