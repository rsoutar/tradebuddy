import { createFileRoute } from '@tanstack/react-router'
import { SetupPhone, SwapPhone } from '../components/showcase'

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
      <section className="showcase-grid showcase-grid-tight">
        <div className="showcase-copy">
          <p className="eyebrow">Onboarding</p>
          <h2>Safety steps are now part of the product story, not hidden in a dry checklist.</h2>
          <p className="lede">
            The onboarding route uses the same luminous visual system, but shifts the emphasis to
            protected setup, simulation-first decisions, and clear risk approvals before any live
            trading begins.
          </p>
        </div>
        <div className="phone-wall onboarding-wall" aria-label="Onboarding preview screens">
          <SetupPhone />
          <SwapPhone />
        </div>
      </section>

      <div className="feature-grid">
        {steps.map((step, index) => (
          <article className="feature-card" key={step}>
            <p className="eyebrow">Step {index + 1}</p>
            <h3>{step}</h3>
          </article>
        ))}
      </div>
    </div>
  )
}
