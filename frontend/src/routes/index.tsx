import { Link, createFileRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'

const launchStats = [
  { label: 'Paper capital', value: '$15,000', hint: 'Simulation-only bankroll' },
  { label: 'Tracked bots', value: '3', hint: 'Grid, rebalance, infinity grid' },
  { label: 'Latest backtest', value: '180 days', hint: 'Rolling BTC regime replay' },
]

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
      <section className="hero-grid">
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
          <div className="hero-actions">
            {viewer.authenticated ? (
              <Link className="primary-link" to="/dashboard">
                Open dashboard
              </Link>
            ) : (
              <Link
                className="primary-button"
                to="/auth/line/start"
              >
                Continue with LINE
              </Link>
            )}
            <Link className="secondary-link" to="/onboarding">
              Review setup steps
            </Link>
          </div>
        </div>

        <aside className="hero-panel">
          <div className="hero-panel-head">
            <p className="eyebrow">Dashboard Preview</p>
            <strong>Bot operations at a glance</strong>
          </div>
          <div className="stat-grid">
            {launchStats.map((item) => (
              <article className="stat-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.hint}</small>
              </article>
            ))}
          </div>
          <div className="preview-stack">
            <div className="preview-row">
              <span>Paper engine</span>
              <strong>Ready to launch</strong>
            </div>
            <div className="preview-row">
              <span>Backtest health</span>
              <strong>ROI 18.6% / Max DD 7.4%</strong>
            </div>
            <div className="preview-row">
              <span>Best bot</span>
              <strong>Infinity Grid in trend regime</strong>
            </div>
          </div>
        </aside>
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
