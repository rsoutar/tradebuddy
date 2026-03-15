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

export type ActiveStrategy = {
  id: string
  name: string
  strategy: StrategyKey
  strategyLabel: string
  symbol: string
  exchange: string
  status: 'paper-running'
  tradeCount: number
  buyCount: number
  sellCount: number
  totalNotionalUsd: number
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  configSummary: string
  createdAt: string
  lastTradeAt?: string
}

export type PaperTrade = {
  id: string
  botId: string
  botName: string
  strategy: StrategyKey
  strategyLabel: string
  config: Record<string, unknown>
  symbol: string
  side: 'buy' | 'sell'
  orderType: 'limit' | 'market'
  amount: number
  price: number
  notionalUsd: number
  rationale: string
  status: string
  createdAt: string
}

export type TradeHistoryState = {
  summary: {
    totalTrades: number
    plannedTrades: number
    buyTrades: number
    sellTrades: number
    totalNotionalUsd: number
    activeBotCount: number
    latestTradeAt?: string
    paperRunCount: number
  }
  trades: PaperTrade[]
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
  activeStrategies: ActiveStrategy[]
  events: ActivityEvent[]
}

export type GridBotInput = {
  lowerPrice: number
  upperPrice: number
  gridCount: number
  spacingPct: number
  stopLossEnabled: boolean
  stopLossPct?: number
}

type SessionData = {
  user?: LineUserProfile
  oauthState?: string
  pkceVerifier?: string
  intendedPath?: string
}

export type ViewerState = {
  authenticated: boolean
  lineConfigured: boolean
  user?: LineUserProfile
}

type LoginResult =
  | { mode: 'oauth'; authorizeUrl: string }
  | { mode: 'demo'; redirectTo: string }

const lineScopes = ['openid', 'profile']

function getSessionPassword() {
  return (
    process.env.AUTH_SESSION_SECRET ??
    'oscar-dev-session-secret-change-me-1234567890'
  )
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

type BackendDashboardEnvelope = {
  dashboard: DashboardState
}

type BackendTradeHistoryEnvelope = TradeHistoryState

function getBackendApiBaseUrl() {
  return process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
}

function getUserScope(user: LineUserProfile) {
  return {
    user_id: user.userId,
    user_name: user.displayName,
  }
}

async function extractBackendError(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string }
    if (typeof payload.detail === 'string' && payload.detail) {
      return payload.detail
    }
  } catch {
    // Fall back to the generic status message below.
  }
  return `Backend request failed with status ${response.status}.`
}

async function fetchBackend<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init)

  if (!response.ok) {
    throw new Error(await extractBackendError(response))
  }

  return (await response.json()) as T
}

async function fetchDashboardForUser(user: LineUserProfile) {
  const url = new URL('/api/dashboard', getBackendApiBaseUrl())
  url.searchParams.set('user_id', user.userId)
  url.searchParams.set('user_name', user.displayName)
  return fetchBackend<BackendDashboardEnvelope>(url.toString())
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

  await session.update({
    user: profile,
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

  if (!session.data.user) {
    throw new Error('You need to sign in before opening the dashboard.')
  }

  const payload = await fetchDashboardForUser(session.data.user)

  return {
    viewer: session.data.user,
    dashboard: payload.dashboard,
  }
})

export const getTradeHistory = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await useSession<SessionData>(getSessionConfig())

  if (!session.data.user) {
    throw new Error('You need to sign in before opening trade history.')
  }

  const url = new URL('/api/trades', getBackendApiBaseUrl())
  url.searchParams.set('user_id', session.data.user.userId)
  url.searchParams.set('user_name', session.data.user.displayName)

  return fetchBackend<BackendTradeHistoryEnvelope>(url.toString())
})

export const runPaperTrading = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as { strategy: StrategyKey }
    const session = await useSession<SessionData>(getSessionConfig())

    if (!session.data.user) {
      throw new Error('You need to sign in before running the bot.')
    }
    const payload = await fetchBackend<BackendDashboardEnvelope>(
      new URL('/api/paper-trading/run', getBackendApiBaseUrl()).toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strategy: input.strategy,
          ...getUserScope(session.data.user),
        }),
      },
    )

    return payload.dashboard
  },
)

export const runBacktest = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as { strategy: StrategyKey }
    const session = await useSession<SessionData>(getSessionConfig())

    if (!session.data.user) {
      throw new Error('You need to sign in before running a backtest.')
    }
    const payload = await fetchBackend<BackendDashboardEnvelope>(
      new URL('/api/backtests/run', getBackendApiBaseUrl()).toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strategy: input.strategy,
          ...getUserScope(session.data.user),
        }),
      },
    )

    return payload.dashboard
  },
)

export const createBot = createServerFn({ method: 'POST' }).handler(async ({ data }) => {
  const input = (data ?? {}) as {
    strategy: StrategyKey
    gridConfig?: GridBotInput
  }
  const session = await useSession<SessionData>(getSessionConfig())

  if (!session.data.user) {
    throw new Error('You need to sign in before creating a bot.')
  }

  const payload = await fetchBackend<BackendDashboardEnvelope>(
    new URL('/api/bots', getBackendApiBaseUrl()).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        strategy: input.strategy,
        grid_config: input.gridConfig
          ? {
              lower_price: input.gridConfig.lowerPrice,
              upper_price: input.gridConfig.upperPrice,
              grid_count: input.gridConfig.gridCount,
              spacing_pct: input.gridConfig.spacingPct,
              stop_loss_enabled: input.gridConfig.stopLossEnabled,
              stop_loss_pct: input.gridConfig.stopLossPct,
            }
          : undefined,
        ...getUserScope(session.data.user),
      }),
    },
  )

  return payload.dashboard
})

export const depositPaperFunds = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    const input = (data ?? {}) as { amountUsd: number }
    const session = await useSession<SessionData>(getSessionConfig())

    if (!session.data.user) {
      throw new Error('You need to sign in before funding the paper wallet.')
    }

    const payload = await fetchBackend<BackendDashboardEnvelope>(
      new URL('/api/paper-trading/deposits', getBackendApiBaseUrl()).toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount_usd: input.amountUsd,
          ...getUserScope(session.data.user),
        }),
      },
    )

    return payload.dashboard
  },
)
