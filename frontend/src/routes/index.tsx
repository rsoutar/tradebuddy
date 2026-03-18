import { Icon } from '@iconify/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'

const strategies = [
  {
    title: 'AI Grid Bot',
    body: 'Capitalizes on lateral market movements. The AI automatically sets optimal upper and lower limits, adjusting grid density based on real-time volatility metrics.',
    icon: 'solar:widget-3-linear',
    market: 'Ranging',
  },
  {
    title: 'Smart Rebalance',
    body: 'Maintains desired asset allocation to lock in profits. The AI predicts short-term momentum to delay or accelerate rebalancing events, maximizing yield.',
    icon: 'solar:pie-chart-2-linear',
    market: 'Bull / Bear',
  },
  {
    title: 'Infinity Grid',
    body: 'Never miss a parabolic run. Removes the upper price limit, while the AI calculates dynamic trailing stops to secure profits without selling early.',
    icon: 'solar:infinity-linear',
    market: 'Uptrend',
  },
]

const controlChecks = [
  'Real-time order book analysis',
  'Dynamic grid spacing based on ATR',
  'Automated trailing stop integration',
]

const metrics = [
  { value: '$4.2B+', label: 'Volume Traded' },
  { value: '99.9%', label: 'Uptime' },
  { value: '12ms', label: 'Execution Speed' },
  { value: '45k+', label: 'Active Bots' },
]

const features = [
  {
    title: 'Non-Custodial Security',
    body: 'We never hold your funds. NEXUS connects directly to your preferred exchange via encrypted API keys with withdrawal permissions strictly disabled.',
    icon: 'solar:shield-keyhole-linear',
  },
  {
    title: 'Auto-Compounding',
    body: 'Maximize your APY. Our bots automatically reinvest realized profits back into your active strategies to generate exponential growth over time.',
    icon: 'solar:chart-square-linear',
  },
  {
    title: 'Universal Compatibility',
    body: 'Seamlessly deploy strategies across Binance, Bitkub, Bybit and OKX simultaneously from a single unified dashboard.',
    icon: 'solar:link-linear',
  },
  {
    title: 'Smart Alerts',
    body: 'Receive instant notifications via Telegram or Discord when a bot hits a take-profit target, triggers a stop-loss, or detects an anomaly.',
    icon: 'solar:bell-bing-linear',
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
  const primaryTo = viewer.authenticated ? '/dashboard' : '/auth/line/start'
  const secondaryTo = viewer.authenticated ? '/backtest' : '/onboarding'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 selection:bg-indigo-500/30 selection:text-indigo-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 flex justify-center overflow-hidden">
        <div className="h-[860px] w-full max-w-7xl bg-[radial-gradient(ellipse_at_top,_rgba(79,70,229,0.24),_rgba(9,9,11,0)_58%)]" />
      </div>

      <nav className="sticky top-0 z-30 border-b border-white/[0.05] bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link className="flex items-center gap-3 text-zinc-100" to="/">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-400/25 bg-indigo-500/10 text-indigo-300">
                <Icon icon="solar:cpu-linear" width={20} height={20} />
              </span>
              <div>
                <span className="text-lg font-semibold tracking-tighter">NEXUS</span>
              </div>
            </Link>
            <div className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
              <a className="transition-colors hover:text-zinc-100" href="#strategies">
                Strategies
              </a>
              <a className="transition-colors hover:text-zinc-100" href="#engine">
                AI Engine
              </a>
              <a className="transition-colors hover:text-zinc-100" href="#features">
                Features
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="hidden text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 sm:block"
              to={viewer.authenticated ? '/dashboard' : '/auth/line/start'}
            >
              Log in
            </Link>
            <Link
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 sm:text-sm"
              to={primaryTo}
            >
              Start Trading
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-6 pb-24 pt-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <Icon icon="solar:magic-stick-3-linear" width={16} height={16} />
            <span>v2.0 Neural Engine Live</span>
          </div>
          <h1 className="mt-8 max-w-5xl text-5xl font-semibold tracking-tight text-transparent bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text md:text-7xl">
            Automated precision.
            <br />
            Powered by AI.
          </h1>
          <p className="mt-6 max-w-2xl text-lg font-light leading-8 text-zinc-400">
            Deploy autonomous trading agents that analyze order books, calculate volatility, and
            execute Grid, Rebalance, and Infinity strategies with zero emotion.
          </p>
          <div className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
            <Link
              className="w-full rounded-full bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-colors hover:bg-indigo-500 sm:w-auto"
              to={primaryTo}
            >
              Deploy a Bot
            </Link>
            <Link
              className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 sm:w-auto"
              to={secondaryTo}
            >
              <Icon icon="solar:play-circle-linear" width={18} height={18} />
              View Backtests
            </Link>
          </div>
          {authError ? (
            <div className="mt-6 w-full max-w-2xl rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-left text-sm text-rose-100">
              {authError}
            </div>
          ) : null}
          {!viewer.lineConfigured && !viewer.authenticated ? (
            <div className="mt-4 w-full max-w-2xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-left text-sm text-amber-100">
              Demo auth is active because `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` are not set
              yet. Add them to switch the sign-in flow to live LINE OAuth.
            </div>
          ) : null}
        </section>

        <section
          id="strategies"
          className="scroll-mt-24 mx-auto w-full max-w-7xl px-6 py-24"
        >
          <div className="mb-16">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">Core Strategies</h2>
            <p className="mt-4 max-w-2xl text-base font-light leading-7 text-zinc-400">
              Three powerful algorithms, dynamically optimized by our neural network to adapt to
              changing market conditions.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {strategies.map((strategy) => (
              <article
                className="group relative overflow-hidden rounded-3xl border border-white/[0.05] bg-zinc-900/40 p-8 transition-all duration-300 hover:bg-zinc-900/60"
                key={strategy.title}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/8 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative z-10">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 shadow-inner">
                    <Icon className="text-zinc-300" icon={strategy.icon} width={22} height={22} />
                  </div>
                  <h3 className="text-xl font-medium tracking-tight text-zinc-100">{strategy.title}</h3>
                  <p className="mt-3 text-sm font-light leading-7 text-zinc-400">{strategy.body}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-white/[0.05] pt-6">
                    <span className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                      Market Phase
                    </span>
                    <span className="rounded-md bg-indigo-500/10 px-2 py-1 text-xs text-indigo-400">
                      {strategy.market}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          id="engine"
          className="relative overflow-hidden border-y border-white/[0.05] bg-zinc-950/50 scroll-mt-24"
        >
          <div className="absolute left-1/2 top-1/2 h-[420px] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
          <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-16 px-6 py-24 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">
                Stop guessing parameters. Let the model handle it.
              </h2>
              <p className="mt-6 text-base font-light leading-8 text-zinc-400">
                Traditional bots require manual configuration of price ranges, grid quantities, and
                triggers. Our Neural Engine backtests millions of permutations in seconds to deploy
                the mathematically optimal setup for current liquidity.
              </p>
              <ul className="mt-8 space-y-4">
                {controlChecks.map((item) => (
                  <li className="flex items-start gap-3" key={item}>
                    <Icon
                      className="mt-0.5 text-indigo-400"
                      icon="solar:check-circle-linear"
                      width={20}
                      height={20}
                    />
                    <span className="text-sm font-light text-zinc-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <div className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 rounded-full bg-indigo-500/20 blur-2xl" />
              <div className="relative z-10 flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
                    <Icon icon="solar:bitcoin-linear" width={18} height={18} className="text-zinc-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">BTC/USDT</h3>
                    <p className="text-xs text-zinc-500">Grid Strategy</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">AI Pilot</span>
                  <div className="inline-flex h-5 w-9 items-center rounded-full bg-indigo-500">
                    <span className="ml-[18px] inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm" />
                  </div>
                </div>
              </div>

              <div className="relative z-10 mt-6 space-y-6">
                <div>
                  <div className="mb-2 flex justify-between text-xs text-zinc-400">
                    <span>Investment</span>
                    <span className="text-zinc-100">5,000 USDT</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-zinc-500">$</span>
                    <input
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-7 pr-3 text-sm text-zinc-100 outline-none"
                      readOnly
                      type="text"
                      value="5000"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex justify-between text-xs text-zinc-400">
                    <span>Grid Density (AI Managed)</span>
                    <span className="font-mono text-indigo-400">64 Grids</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full border border-zinc-800 bg-zinc-950">
                    <div className="absolute left-0 top-0 h-full w-2/3 rounded-full bg-indigo-500" />
                    <div className="absolute left-[66%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow" />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                    <span>Aggressive</span>
                    <span>Conservative</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-zinc-800/50 bg-zinc-950 p-3">
                  <Icon
                    className="mt-0.5 text-indigo-400"
                    icon="solar:info-circle-linear"
                    width={18}
                    height={18}
                  />
                  <p className="text-xs leading-relaxed text-zinc-400">
                    AI has detected a <span className="font-medium text-zinc-200">12.4%</span>{' '}
                    increase in 4h volatility. Grid spacing has been automatically widened to
                    prevent false breakouts.
                  </p>
                </div>

                <Link
                  className="block w-full rounded-lg bg-white py-2.5 text-center text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
                  to={primaryTo}
                >
                  Initialize Bot
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.05] bg-zinc-950 py-16">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-6 text-center md:grid-cols-4 md:divide-x md:divide-white/[0.05]">
            {metrics.map((metric) => (
              <div className="flex flex-col items-center" key={metric.label}>
                <span className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
                  {metric.value}
                </span>
                <span className="mt-2 text-sm font-light text-zinc-500">{metric.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          id="features"
          className="mx-auto w-full max-w-7xl px-6 py-24 scroll-mt-24"
        >
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">
              Engineered for performance
            </h2>
            <p className="mt-4 text-base font-light leading-7 text-zinc-400">
              Every component of our architecture is designed to give you an edge in highly volatile
              crypto markets.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {features.map((feature) => (
              <article
                className="rounded-3xl border border-white/[0.05] bg-zinc-900/40 p-8 transition-colors hover:bg-zinc-900/60"
                key={feature.title}
              >
                <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
                  <Icon className="text-zinc-300" icon={feature.icon} width={20} height={20} />
                </div>
                <h3 className="text-lg font-medium tracking-tight text-zinc-100">{feature.title}</h3>
                <p className="mt-3 text-sm font-light leading-7 text-zinc-400">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/[0.05] bg-zinc-950 py-32">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[100px]" />
          <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
              Ready to automate your trading?
            </h2>
            <p className="mt-6 text-lg font-light text-zinc-400">
              Join thousands of traders using NEXUS to eliminate emotion and execute strategies with
              mathematical precision.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                className="w-full rounded-full bg-white px-8 py-3.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 sm:w-auto"
                to={primaryTo}
              >
                Create Free Account
              </Link>
              <Link
                className="w-full rounded-full border border-zinc-800 bg-zinc-900 px-8 py-3.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 sm:w-auto"
                to="/onboarding"
              >
                Read Documentation
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.05] bg-zinc-950 py-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight text-zinc-100">
            <Icon className="text-indigo-400" icon="solar:cpu-linear" width={20} height={20} />
            NEXUS
          </div>
          <div className="flex items-center gap-6 text-sm font-light text-zinc-500">
            <Link className="transition-colors hover:text-zinc-300" to="/onboarding">
              Documentation
            </Link>
            <a className="transition-colors hover:text-zinc-300" href="#features">
              API
            </a>
            <a className="transition-colors hover:text-zinc-300" href="#rollout">
              Terms
            </a>
            <a className="transition-colors hover:text-zinc-300" href="#engine">
              Privacy
            </a>
          </div>
          <p className="text-xs text-zinc-600">© 2026 NEXUS Technologies. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
