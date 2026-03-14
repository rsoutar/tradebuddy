import { createFileRoute } from '@tanstack/react-router'

const steps = [
  'Connect exchange credentials from a local environment file',
  'Choose a strategy type and start with simulation mode',
  'Confirm risk settings before enabling live execution',
]

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  return (
    <div className="page">
      <section className="section-heading">
        <p className="eyebrow">Onboarding flow</p>
        <h2>Guided setup will keep live trading behind explicit safety checks.</h2>
      </section>

      <div className="card-grid">
        {steps.map((step, index) => (
          <article className="card" key={step}>
            <p className="eyebrow">Step {index + 1}</p>
            <h3>{step}</h3>
          </article>
        ))}
      </div>
    </div>
  )
}

