import type { ReactNode } from 'react'

type PhoneFrameProps = {
  className?: string
  children: ReactNode
}

type InfoStripProps = {
  eyebrow: string
  title: string
  value: string
  meta: string
}

type StrategyPhoneProps = {
  title: string
  mode: string
  allocation: string
  spread: string
  pnl: string
}

const assets = [
  { name: 'Bitcoin', symbol: 'BTC', colorClass: 'token-btc' },
  { name: 'Solana', symbol: 'SOL', colorClass: 'token-sol' },
  { name: 'Ethereum', symbol: 'ETH', colorClass: 'token-eth' },
]

const walletRows = [
  { name: 'USDC', balance: 'Bal. $4,543.50', value: '$4,543', colorClass: 'token-usdc' },
  { name: 'SOL', balance: 'Bal. 84.53 Sol', value: '$321', colorClass: 'token-sol' },
  { name: 'BTC', balance: 'Bal. 0.182 BTC', value: '$11,870', colorClass: 'token-btc' },
]

function PhoneFrame({ className, children }: Readonly<PhoneFrameProps>) {
  return (
    <article className={`phone-frame${className ? ` ${className}` : ''}`}>
      <div className="phone-status">
        <span>9:41</span>
        <div className="phone-icons" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      {children}
    </article>
  )
}

function ExchangeHeader({ label }: Readonly<{ label: string }>) {
  return (
    <div className="exchange-header">
      <div className="exchange-brand">
        <span className="exchange-brand-mark">E</span>
        <strong>Exchange</strong>
      </div>
      <button type="button" className="ghost-button">
        {label}
      </button>
    </div>
  )
}

function AssetTabs() {
  return (
    <div className="asset-tabs" role="tablist" aria-label="Markets">
      {assets.map((asset, index) => (
        <button
          key={asset.symbol}
          type="button"
          className={`asset-tab${index === 1 ? ' active' : ''}`}
          aria-selected={index === 1}
        >
          <span className={`token-badge ${asset.colorClass}`}>{asset.symbol.slice(0, 1)}</span>
          {asset.name}
        </button>
      ))}
    </div>
  )
}

function WalletList() {
  return (
    <div className="wallet-list">
      {walletRows.map((row) => (
        <div className="wallet-row" key={row.name}>
          <div className="wallet-token">
            <span className={`token-badge ${row.colorClass}`}>{row.name.slice(0, 1)}</span>
            <div>
              <strong>{row.name}</strong>
              <span>{row.balance}</span>
            </div>
          </div>
          <div className="wallet-value">
            <strong>{row.value}</strong>
            <span>$23,400</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartCard({
  eyebrow,
  title,
  value,
  meta,
}: Readonly<InfoStripProps>) {
  return (
    <div className="chart-card">
      <div>
        <p>{eyebrow}</p>
        <strong>{title}</strong>
      </div>
      <div className="chart-card-meta">
        <span>{value}</span>
        <small>{meta}</small>
      </div>
      <div className="sparkline">
        <span className="sparkline-line" />
        <span className="sparkline-point sparkline-point-a" />
        <span className="sparkline-point sparkline-point-b" />
      </div>
    </div>
  )
}

export function MarketPhone() {
  return (
    <PhoneFrame className="phone-frame-overview">
      <ExchangeHeader label="This Week" />
      <div className="phone-section">
        <p className="phone-label">Market Overview</p>
        <AssetTabs />
      </div>
      <div className="phone-section">
        <div className="value-row">
          <div>
            <span className="mini-label">Your Wallet</span>
            <strong>Gl1xh7rbn1...</strong>
          </div>
          <button type="button" className="icon-button">
            ↗
          </button>
        </div>
        <WalletList />
      </div>
    </PhoneFrame>
  )
}

export function SwapPhone() {
  return (
    <PhoneFrame className="phone-frame-swap">
      <ExchangeHeader label="Quick Swap" />
      <div className="phone-section">
        <p className="phone-label">Swap Route</p>
        <div className="swap-pills">
          <span className="swap-pill active">OI</span>
          <span className="swap-pill">BTC</span>
          <span className="swap-pill">SOL</span>
        </div>
      </div>
      <div className="swap-card">
        <div className="swap-row">
          <span>Market Price</span>
          <strong>1.34 USDT</strong>
        </div>
        <label className="toggle-row">
          <span className="toggle-control" aria-hidden="true" />
          <span>Set current market price</span>
        </label>
        <button type="button" className="primary-button">
          Swap
        </button>
      </div>
    </PhoneFrame>
  )
}

export function StatsPhone() {
  return (
    <PhoneFrame className="phone-frame-stats">
      <div className="stats-header">
        <div>
          <p className="phone-label">Statics</p>
          <h3>$3.00</h3>
          <span>-30% last week</span>
        </div>
        <button type="button" className="ghost-icon">
          ⌁
        </button>
      </div>
      <div className="chart-hero">
        <span className="chart-axis chart-axis-left">$500</span>
        <span className="chart-axis chart-axis-right">M</span>
        <div className="curve-line" />
        <span className="curve-point">$345.280</span>
      </div>
      <div className="stats-stack">
        <ChartCard eyebrow="Total Volume" title="$1.00" value="+100" meta="30% last week" />
        <ChartCard eyebrow="Total Supply" title="$3.00" value="+200" meta="+12% last week" />
      </div>
    </PhoneFrame>
  )
}

export function SetupPhone() {
  return (
    <PhoneFrame className="phone-frame-setup">
      <ExchangeHeader label="Secure Mode" />
      <div className="phone-section">
        <p className="phone-label">Launch Checklist</p>
        <div className="check-stack">
          <label className="check-row">
            <input type="checkbox" defaultChecked />
            <span>Load exchange keys from `.env`</span>
          </label>
          <label className="check-row">
            <input type="checkbox" defaultChecked />
            <span>Start in simulation before live mode</span>
          </label>
          <label className="check-row">
            <input type="checkbox" />
            <span>Approve max drawdown and stop rules</span>
          </label>
        </div>
      </div>
      <div className="soft-panel">
        <span className="mini-label">Safety tier</span>
        <strong>Protected onboarding</strong>
        <p>Live execution stays locked until every step is verified.</p>
      </div>
    </PhoneFrame>
  )
}

export function StrategyPhone({
  title,
  mode,
  allocation,
  spread,
  pnl,
}: Readonly<StrategyPhoneProps>) {
  return (
    <PhoneFrame className="phone-frame-strategy">
      <ExchangeHeader label={mode} />
      <div className="strategy-chip-row">
        <span className="strategy-chip active">{title}</span>
        <span className="strategy-chip">{allocation}</span>
        <span className="strategy-chip">{spread}</span>
      </div>
      <div className="soft-panel">
        <span className="mini-label">Live projection</span>
        <strong>{pnl}</strong>
        <p>Simulated performance based on the current market regime.</p>
      </div>
      <div className="metric-list">
        <div>
          <span>Re-entry range</span>
          <strong>2.1%</strong>
        </div>
        <div>
          <span>Capital slice</span>
          <strong>{allocation}</strong>
        </div>
        <div>
          <span>Interval</span>
          <strong>{spread}</strong>
        </div>
      </div>
    </PhoneFrame>
  )
}

export function AssistantPhone() {
  return (
    <PhoneFrame className="phone-frame-assistant">
      <ExchangeHeader label="AI Notes" />
      <div className="phone-section">
        <p className="phone-label">Prompt Stack</p>
        <div className="prompt-stack">
          <div className="prompt-card">
            <span>Regime</span>
            <strong>Current BTC volatility state?</strong>
          </div>
          <div className="prompt-card">
            <span>Strategy</span>
            <strong>Suggest grid spacing for chop.</strong>
          </div>
          <div className="prompt-card">
            <span>Balance</span>
            <strong>How far is the wallet from 50/50?</strong>
          </div>
        </div>
      </div>
      <div className="soft-panel">
        <span className="mini-label">Assistant reply</span>
        <strong>Reduce aggression</strong>
        <p>Volatility is compressing. Favor tighter ladders and keep live size conservative.</p>
      </div>
    </PhoneFrame>
  )
}
