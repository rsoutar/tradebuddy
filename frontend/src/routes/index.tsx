import { Link, createFileRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'

const highlights = [
  {
    title: 'LINE sign-in first',
    body: 'Operators enter with LINE Login, then land directly in the control room with a persisted session.',
  },
  {
    title: 'Paper trading launchpad',
    body: 'Run the bot in simulation mode before going near exchange keys or live capital.',
  },
  {
    title: 'Backtesting on demand',
    body: 'Replay strategy performance and compare return, drawdown, and trade quality from one dashboard.',
  },
]

export const Route = createFileRoute('/')({
  validateSearch: (search) => ({
    authError: typeof search.authError === 'string' ? search.authError : undefined,
  }),
  component: HomePage,
})

function HomePage() {
  const viewer = RootRoute.useLoaderData()
  const search = Route.useSearch()
  const authError = search.authError
  const heroCopy = viewer.authenticated
    ? `Welcome back, ${viewer.user?.displayName}. Your dashboard is ready with paper trading controls and the latest bot health snapshot.`
    : 'Sign in with LINE to unlock the trading dashboard, launch paper trading, and run backtests with the latest bot metrics.'

  return (
    <div className="page">
      <section className="hero-grid landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Access Layer</p>
          <h2>Run Oscar from one dashboard after a LINE Login handoff.</h2>
          <p className="lede">{heroCopy}</p>
          {authError ? <p className="inline-alert">{authError}</p> : null}
          {!viewer.lineConfigured && !viewer.authenticated ? (
            <p className="inline-note">
              Demo auth is active because `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` are not set
              yet. Add them to switch this button to the live LINE OAuth flow.
            </p>
          ) : null}
          {viewer.authenticated ? (
            <div className="hero-actions">
              <Link className="primary-link" to="/dashboard">
                Open dashboard
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="content-grid">
        {highlights.map((item) => (
          <article className="feature-card" key={item.title}>
            <p className="eyebrow">Feature</p>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
