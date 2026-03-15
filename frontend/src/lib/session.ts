import { createServerFn } from '@tanstack/react-start'
import {
  getRequestUrl,
  useSession,
} from '@tanstack/react-start/server'

export type StrategyKey = 'grid' | 'rebalance' | 'infinity-grid'

export type LineUserProfile = {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

export type BotMetric = {
  key: StrategyKey
  name: string
  summary: string
  mode: 'Sideways' | 'Steady' | 'Trend'
  status: 'idle' | 'paper-running' | 'backtest-ready'
  paperPnlPct: number
  winRatePct: number
  maxDrawdownPct: number
  sharpeRatio: number
  trades: number
  allocationPct: number
  lastSignal: string
}

export type BacktestSummary = {
  strategy: StrategyKey
  periodLabel: string
  roiPct: number
  maxDrawdownPct: number
  profitFactor: number
  winRatePct: number
  trades: number
  annualizedPct: number
  completedAt: string
}

export type ActivityEvent = {
  id: string
  tone: 'positive' | 'neutral' | 'warning'
  title: string
  detail: string
  timeLabel: string
}

export type DashboardState = {
  capitalUsd: number
  activeStrategy: StrategyKey
  botStatus: 'idle' | 'paper-running'
  paperRunCount: number
  lastPaperRunAt?: string
  lastBacktest?: BacktestSummary
  bots: BotMetric[]
  events: ActivityEvent[]
}

type SessionData = {
  user?: LineUserProfile
  oauthState?: string
  pkceVerifier?: string
  intendedPath?: string
  dashboard?: DashboardState
}

export type ViewerState = {
  authenticated: boolean
  lineConfigured: boolean
  user?: LineUserProfile
}

type LoginResult =
  | { mode: 'oauth'; authorizeUrl: string }
  | { mode: 'demo'; redirectTo: string }

const strategyCatalog: Array<{
  key: StrategyKey
  name: string
  summary: string
  mode: BotMetric['mode']
  status: BotMetric['status']
  paperPnlPct: number
  winRatePct: number
  maxDrawdownPct: number
  sharpeRatio: number
  trades: number
  allocationPct: number
  lastSignal: string
}> = [
  {
    key: 'grid',
    name: 'Grid Bot',
    summary: 'Captures intraday BTC rotations inside a protected paper ladder.',
    mode: 'Sideways',
    status: 'paper-running',
    paperPnlPct: 4.82,
    winRatePct: 67.4,
    maxDrawdownPct: 3.1,
    sharpeRatio: 1.41,
    trades: 36,
    allocationPct: 32,
    lastSignal: 'Buy wall refreshed at $81,420',
  },
  {
    key: 'rebalance',
    name: 'Rebalance Bot',
    summary: 'Keeps BTC and cash near the target ratio with low intervention.',
    mode: 'Steady',
    status: 'idle',
    paperPnlPct: 2.18,
    winRatePct: 58.3,
    maxDrawdownPct: 1.7,
    sharpeRatio: 1.12,
    trades: 11,
    allocationPct: 28,
    lastSignal: 'Portfolio drift hit 4.8% threshold',
  },
  {
    key: 'infinity-grid',
    name: 'Infinity Grid',
    summary: 'Extends with trend strength while keeping trailing protection active.',
    mode: 'Trend',
    status: 'backtest-ready',
    paperPnlPct: 6.41,
    winRatePct: 72.1,
    maxDrawdownPct: 4.4,
    sharpeRatio: 1.67,
    trades: 24,
    allocationPct: 40,
    lastSignal: 'Trailing take-profit armed at +1.2%',
  },
]

const lineScopes = ['openid', 'profile']
const dayFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
})

function getSessionPassword() {
  return process.env.AUTH_SESSION_SECRET ?? 'oscar-dev-session-secret-change-me'
}

function getSessionConfig() {
  return {
    name: 'oscar-auth',
    password: getSessionPassword(),
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  }
}

function getLineConfig() {
  return {
    channelId: process.env.LINE_CHANNEL_ID ?? '',
    channelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
    redirectUri: process.env.LINE_REDIRECT_URI ?? '',
  }
}

function isLineConfigured() {
  const config = getLineConfig()
  return Boolean(config.channelId && config.channelSecret)
}

function getBaseUrl() {
  const requestUrl = getRequestUrl({
    xForwardedHost: true,
    xForwardedProto: true,
  })
  return requestUrl.origin
}

function getRedirectUri() {
  const config = getLineConfig()
  return config.redirectUri || `${getBaseUrl()}/auth/line`
}

function createRandomString(length: number) {
  const buffer = new Uint8Array(length)
  crypto.getRandomValues(buffer)
  return Array.from(buffer, (value) =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[
      value % 66
    ],
  ).join('')
}

function toBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function createPkcePair() {
  const verifier = createRandomString(64)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )

  return {
    verifier,
    challenge: toBase64Url(new Uint8Array(digest)),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return `${dayFormatter.format(date)} · ${timeFormatter.format(date)}`
}

function createDefaultDashboardState(userName?: string): DashboardState {
  const now = new Date()
  return {
    capitalUsd: 15000,
    activeStrategy: 'grid',
    botStatus: 'paper-running',
    paperRunCount: 7,
    lastPaperRunAt: now.toISOString(),
    lastBacktest: {
      strategy: 'infinity-grid',
      periodLabel: 'Last 180 days',
      roiPct: 18.6,
      maxDrawdownPct: 7.4,
      profitFactor: 1.92,
      winRatePct: 63.2,
      trades: 114,
      annualizedPct: 22.4,
      completedAt: now.toISOString(),
    },
    bots: strategyCatalog.map((strategy) => ({ ...strategy })),
    events: [
      {
        id: 'evt-open',
        tone: 'positive',
        title: `Session ready for ${userName ?? 'Operator'}`,
        detail: 'LINE sign-in completed and paper trading controls are unlocked.',
        timeLabel: 'Now',
      },
      {
        id: 'evt-risk',
        tone: 'neutral',
        title: 'Risk envelope verified',
        detail: 'Daily drawdown guardrail capped at 5% of simulated capital.',
        timeLabel: '12 min ago',
      },
      {
        id: 'evt-health',
        tone: 'warning',
        title: 'Volatility regime elevated',
        detail: 'BTC 24h volatility is above the recent mean, so spreads were widened.',
        timeLabel: '34 min ago',
      },
    ],
  }
}

function ensureDashboardState(data: SessionData) {
  if (!data.dashboard) {
    data.dashboard = createDefaultDashboardState(data.user?.displayName)
  }
  return data.dashboard
}

function createEvent(title: string, detail: string, tone: ActivityEvent['tone']) {
  return {
    id: crypto.randomUUID(),
    title,
    detail,
    tone,
    timeLabel: 'Now',
  }
}

async function exchangeCodeForProfile(code: string, state: string) {
  const config = getLineConfig()
  const session = await useSession<SessionData>(getSessionConfig())
  const redirectTo = session.data.intendedPath || '/dashboard'

  if (!config.channelId || !config.channelSecret) {
    throw new Error('LINE Login is not configured.')
  }

  if (!code || !state || state !== session.data.oauthState) {
    throw new Error('The LINE sign-in state check failed. Please try again.')
  }

  if (!session.data.pkceVerifier) {
    throw new Error('The LINE sign-in verifier is missing. Please try again.')
  }

  const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: config.channelId,
      client_secret: config.channelSecret,
      code_verifier: session.data.pkceVerifier,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error('LINE rejected the token exchange request.')
  }

  const tokens = (await tokenResponse.json()) as {
    access_token?: string
    id_token?: string
  }

  if (!tokens.access_token) {
    throw new Error('LINE did not return an access token.')
  }

  const profileResponse = await fetch('https://api.line.me/v2/profile', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  })

  if (!profileResponse.ok) {
    throw new Error('LINE profile lookup failed.')
  }

  const profile = (await profileResponse.json()) as LineUserProfile
  const dashboard = createDefaultDashboardState(profile.displayName)

  await session.update({
    user: profile,
    dashboard,
    oauthState: undefined,
    pkceVerifier: undefined,
    intendedPath: undefined,
  })

  return {
    redirectTo,
  }
}

export const getViewer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig())

  return {
    authenticated: Boolean(session.data.user),
    lineConfigured: isLineConfigured(),
    user: session.data.user,
  } satisfies ViewerState
})

export const beginLineLogin = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as { intendedPath?: string }
    const session = await useSession<SessionData>(getSessionConfig())
    const intendedPath = input.intendedPath || '/dashboard'

    if (!isLineConfigured()) {
      const demoUser = {
        userId: 'demo-line-user',
        displayName: 'Demo Trader',
        pictureUrl:
          'https://profile.line-scdn.net/0h0m00tP9fYQw6QWFxS0NlXmt7Y0h1JHgVfSZ1NnR8cE4gJ2Vn',
        statusMessage: 'Paper trading mode',
      } satisfies LineUserProfile

      await session.update({
        user: demoUser,
        dashboard: createDefaultDashboardState(demoUser.displayName),
        oauthState: undefined,
        pkceVerifier: undefined,
        intendedPath: undefined,
      })

      return {
        mode: 'demo',
        redirectTo: intendedPath,
      } satisfies LoginResult
    }

    const { verifier, challenge } = await createPkcePair()
    const state = crypto.randomUUID()

    await session.update({
      oauthState: state,
      pkceVerifier: verifier,
      intendedPath,
    })

    const config = getLineConfig()
    const authorizeUrl = new URL('https://access.line.me/oauth2/v2.1/authorize')
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', config.channelId)
    authorizeUrl.searchParams.set('redirect_uri', getRedirectUri())
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('scope', lineScopes.join(' '))
    authorizeUrl.searchParams.set('code_challenge', challenge)
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')

    return {
      mode: 'oauth',
      authorizeUrl: authorizeUrl.toString(),
    } satisfies LoginResult
  },
)

export const completeLineLogin = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as {
      code?: string
      state?: string
      error?: string
      errorDescription?: string
    }

    if (input.error) {
      throw new Error(input.errorDescription || 'LINE sign-in was canceled.')
    }

    if (!input.code || !input.state) {
      throw new Error('LINE did not return a valid authorization code.')
    }

    return exchangeCodeForProfile(input.code, input.state)
  },
)

export const logoutViewer = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig())
  await session.clear()
  return { ok: true }
})

export const getDashboard = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig())
  const dashboard = ensureDashboardState(session.data)

  if (!session.data.user) {
    throw new Error('You need to sign in before opening the dashboard.')
  }

  return {
    viewer: session.data.user,
    dashboard,
  }
})

export const runPaperTrading = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as { strategy: StrategyKey }
    const session = await useSession<SessionData>(getSessionConfig())

    if (!session.data.user) {
      throw new Error('You need to sign in before running the bot.')
    }

    const dashboard = ensureDashboardState(session.data)
    const now = new Date().toISOString()

    dashboard.activeStrategy = input.strategy
    dashboard.botStatus = 'paper-running'
    dashboard.paperRunCount += 1
    dashboard.lastPaperRunAt = now
    dashboard.bots = dashboard.bots.map((bot) => {
      if (bot.key !== input.strategy) {
        return {
          ...bot,
          status: bot.status === 'paper-running' ? 'backtest-ready' : bot.status,
        }
      }

      const pnlDelta = Number((Math.random() * 1.8 + 0.6).toFixed(2))
      return {
        ...bot,
        status: 'paper-running',
        paperPnlPct: Number((bot.paperPnlPct + pnlDelta).toFixed(2)),
        winRatePct: Number(clamp(bot.winRatePct + 0.8, 35, 92).toFixed(1)),
        maxDrawdownPct: Number(clamp(bot.maxDrawdownPct + 0.2, 0.8, 8.9).toFixed(1)),
        sharpeRatio: Number((bot.sharpeRatio + 0.06).toFixed(2)),
        trades: bot.trades + 4,
        lastSignal: `Paper engine redeployed at ${formatTimestamp(now)}`,
      }
    })
    dashboard.events = [
      createEvent(
        `${strategyCatalog.find((bot) => bot.key === input.strategy)?.name} launched`,
        'A new paper-trading cycle is running with simulated fills and risk rails enabled.',
        'positive',
      ),
      ...dashboard.events.slice(0, 4),
    ]

    await session.update({ dashboard })
    return dashboard
  },
)

export const runBacktest = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as { strategy: StrategyKey }
    const session = await useSession<SessionData>(getSessionConfig())

    if (!session.data.user) {
      throw new Error('You need to sign in before running a backtest.')
    }

    const dashboard = ensureDashboardState(session.data)
    const now = new Date().toISOString()
    const strategy = strategyCatalog.find((item) => item.key === input.strategy) ?? strategyCatalog[0]
    const roiPct = Number((Math.random() * 7 + 12).toFixed(2))
    const trades = Math.round(Math.random() * 70 + 85)

    dashboard.lastBacktest = {
      strategy: input.strategy,
      periodLabel: 'Last 180 days',
      roiPct,
      maxDrawdownPct: Number((Math.random() * 3 + 5.4).toFixed(2)),
      profitFactor: Number((Math.random() * 0.45 + 1.55).toFixed(2)),
      winRatePct: Number((Math.random() * 8 + 58).toFixed(1)),
      trades,
      annualizedPct: Number((roiPct * 1.2).toFixed(2)),
      completedAt: now,
    }
    dashboard.bots = dashboard.bots.map((bot) =>
      bot.key === input.strategy
        ? {
            ...bot,
            status: 'backtest-ready',
            sharpeRatio: Number((bot.sharpeRatio + 0.04).toFixed(2)),
            lastSignal: `Backtest completed at ${formatTimestamp(now)}`,
          }
        : bot,
    )
    dashboard.events = [
      createEvent(
        `${strategy.name} backtest finished`,
        `180-day simulation closed with ${roiPct}% ROI across ${trades} model trades.`,
        'neutral',
      ),
      ...dashboard.events.slice(0, 4),
    ]

    await session.update({ dashboard })
    return dashboard
  },
)
