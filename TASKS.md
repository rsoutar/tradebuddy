# TASKS

## 1. Goal

Build an MVP Bitcoin trading bot for `BTC/USDT` with:

- Exchange integration
- Three trading strategies:
  - Grid Bot
  - Rebalance Bot
  - Infinity Grid Bot
- AI-assisted market analysis and bot configuration help
- Basic CLI for operations
- TanStack Start web frontend for dashboard and onboarding
- Logging, backtesting, paper trading, and risk controls

## 2. MVP Scope

### In Scope

- Spot trading only
- `BTC/USDT` pair
- Exchange integration via CCXT
- AI chat for market questions and configuration suggestions
- Backtesting and paper trading mode using live market data and virtual balances
- Web dashboard and basic CLI
- Trade, error, and AI interaction logs

### Out of Scope

- Futures/leverage trading
- Multi-asset portfolio support beyond future extensibility
- Mobile app
- Fully hosted production infrastructure

## 3. Milestones

- Phase 1: Project setup, architecture, exchange integration, strategy prototypes
- Phase 2: AI module, market data pipeline, recommendation workflow
- Phase 3: Frontend, onboarding, charts, logs, backtesting UX, and paper trading flows
- Phase 4: Hardening, beta readiness, documentation

## 4. Task Breakdown

### 4.1 Project Foundation

- [x] Define repository structure for backend, frontend, shared configs, and docs
- [x] Set up Python project tooling, dependency management, linting, and tests
- [x] Set up TanStack Start frontend project with routing and API integration approach
- [x] Add environment configuration for exchange keys, AI keys, and app settings
- [x] Create `.env.example` with all required variables documented
- [x] Establish logging conventions and log storage locations
- [x] Add configuration schema validation for bot and strategy settings
- [x] Document local development workflow in `README.md`

### 4.2 Core Domain and Backend Architecture

- [x] Define core domain models:
  - Orders
  - Positions
  - Balances
  - Bot runs
  - Strategy configs
  - Risk settings
  - AI conversations
- [ ] Define paper trading domain models:
  - Virtual portfolios
  - Simulated orders and fills
  - Paper trading sessions
  - Paper performance snapshots
- [x] Design service boundaries for:
  - Exchange client
  - Market data service
  - Strategy engine
  - Order execution
  - Risk manager
  - AI assistant
  - Logging/export
- [x] Implement app-level settings loading and dependency wiring
- [ ] Add persistent storage approach for logs, bot state, and backtest results
- [ ] Define error handling and retry patterns for external API calls

### 4.3 Exchange and Market Data Integration

- [ ] Integrate CCXT with support for at least one primary exchange for MVP
- [ ] Add exchange capability checks for spot trading and limit orders
- [ ] Implement secure credential loading from environment variables
- [ ] Build market data fetchers for:
  - Ticker price
  - Order book snapshot
  - Balances
  - Open orders
  - Historical OHLCV data
- [ ] Add read-only market data access path for paper trading mode without live order submission
- [ ] Add rate limiting and exponential backoff for exchange requests
- [ ] Add graceful handling for API downtime and partial failures
- [ ] Build a normalized market data interface for strategies and AI features

### 4.4 Strategy Engine

- [ ] Create a shared strategy interface for lifecycle management:
  - Validate config
  - Start
  - Tick/update
  - Stop
  - Resume/recover
- [ ] Build shared utilities for position sizing, order calculation, fees, and PnL
- [ ] Implement execution mode abstraction for live trading vs paper trading
- [ ] Ensure all three strategies can run unchanged against live and paper execution adapters
- [ ] Add strategy state persistence and recovery after restart

### 4.5 Grid Bot

- [x] Implement grid configuration validation:
  - Lower bound
  - Upper bound
  - Number of grids
  - Grid spacing
  - Stop-loss threshold
- [x] Generate initial grid levels and order placement plan
- [ ] Place paired buy/sell limit orders within configured range
- [ ] Replace orders automatically after fills
- [ ] Stop trading if price exits range beyond configured stop-loss threshold
- [ ] Track realized and unrealized PnL for the bot session
- [x] Add unit tests covering normal, trending, and stop-loss scenarios

### 4.6 Rebalance Bot

- [x] Implement rebalance configuration validation:
  - Target BTC/USDT ratio
  - Rebalance threshold
  - Execution interval
- [x] Fetch balances and compute current allocation drift
- [x] Calculate required trade amounts to return to target allocation
- [ ] Execute rebalance orders safely with minimum trade thresholds
- [x] Prevent over-trading when drift is below threshold
- [x] Add tests for rising, falling, and flat market conditions

### 4.7 Infinity Grid Bot

- [x] Implement infinity grid configuration validation:
  - Lower starting price
  - Grid spacing
  - Profit take per grid
  - Trailing stop
- [x] Generate upward-extending grid logic as price rises
- [x] Add dynamic grid creation during bull-market movement
- [x] Implement downside trailing stop protection
- [x] Add tests for sustained uptrend, reversal, and whipsaw conditions

### 4.8 Risk Management and Safety

- [ ] Implement global risk controls:
  - Max capital allocation
  - Emergency stop
  - Per-bot stop-loss handling
  - Minimum available balance checks
- [ ] Add exchange order validation before submission
- [ ] Prevent duplicate order placement during retries/reconnects
- [ ] Add dry-run mode for all strategies
- [ ] Ensure paper trading mode is fully isolated from live order execution paths
- [ ] Add prominent risk disclaimers in CLI and web UI
- [ ] Log all safety-triggered events for auditing

### 4.9 Paper Trading Mode

- [ ] Add user-selectable trading mode toggle for CLI and web UI
- [ ] Build virtual portfolio setup with configurable starting BTC/USDT balances
- [ ] Implement paper order execution and fill simulation using live ticker/order book inputs
- [ ] Track simulated balances, open positions, realized PnL, unrealized PnL, and trade ledger
- [ ] Support time-bound paper trading sessions and manually stopped indefinite sessions
- [ ] Generate paper trading performance reports with CSV export
- [ ] Surface AI-recommended parameters for paper trading sessions
- [ ] Add clear mode labeling across UI, logs, and exports so paper activity cannot be confused with live trades

### 4.10 AI Assistant

- [ ] Integrate xAI or compatible AI provider SDK
- [ ] Add fallback rules-based analysis when AI API is unavailable
- [ ] Build market context assembler using:
  - Current price
  - 24h change
  - Volume
  - Volatility
  - Trend indicators
- [ ] Implement supported query types:
  - Market condition questions
  - Strategy recommendations
  - Parameter suggestions
- [ ] Define prompt and response format for concise, data-backed answers
- [ ] Add chat history handling with consent-aware storage behavior
- [ ] Ensure AI responses clearly avoid financial-advice framing
- [ ] Include paper-trading-aware suggestions when the user asks to test strategies safely
- [ ] Add tests for fallback behavior and malformed API responses

### 4.11 CLI Experience

- [x] Create CLI entrypoint and command structure
- [ ] Add flows for:
  - Configure exchange credentials
  - Start bot
  - Stop bot
  - View bot status
  - Query AI
  - Configure paper trading portfolio
  - Toggle live vs paper trading
  - Run paper trading/backtest
  - Export logs
- [ ] Add guided setup prompts for first-time users
- [ ] Add paper trading session duration and stop controls
- [ ] Make risk warnings and confirmations explicit before live trading

### 4.12 Web Frontend with TanStack Start

- [x] Set up app shell, routing, and authenticated local session flow if needed
- [ ] Build onboarding flow for:
  - API key setup
  - Strategy selection
  - Risk acknowledgement
  - Paper trading configuration
- [ ] Create dashboard views for:
  - Active bots
  - Current balances
  - BTC price and market summary
  - Profit/loss summary
- [ ] Add paper trading dashboard states for virtual balances, session status, and simulated performance
- [ ] Build strategy configuration forms for all three bot types
- [ ] Build AI chat interface with query history controls
- [ ] Add charts for:
  - Price history
  - Portfolio value
  - Bot performance
- [ ] Add paper trading controls for mode switching, session duration, and start/stop actions
- [ ] Add logs and export screen
- [ ] Connect frontend to backend APIs with loading/error states
- [ ] Ensure responsive layout for desktop-first and tablet/mobile support

### 4.13 Backtesting and Paper Trading Validation

- [ ] Build historical data ingestion for BTC/USDT backtests
- [ ] Implement backtest runner shared across supported strategies
- [ ] Add configurable fee/slippage assumptions
- [ ] Produce backtest metrics:
  - Return
  - Drawdown
  - Win/loss summary
  - Trade count
- [ ] Expose backtest execution in CLI and web UI
- [ ] Export backtest results for analysis
- [ ] Validate paper trading results against expected live-market behavior and backtest assumptions
- [ ] Document known differences between backtesting, paper trading, and live execution

### 4.14 Logging, Reporting, and Export

- [ ] Log all bot lifecycle events, trades, AI requests, warnings, and errors
- [ ] Log paper trading mode changes, simulated orders, virtual portfolio changes, and session summaries
- [ ] Implement CSV export for trade logs and AI interaction history
- [ ] Implement CSV export for paper trading reports and simulated trade history
- [ ] Add structured logs suitable for debugging and audit review
- [ ] Provide human-readable summaries in CLI and dashboard

### 4.15 Security and Compliance

- [ ] Encrypt or otherwise securely protect stored API credentials
- [ ] Ensure secrets are never written to logs
- [ ] Use HTTPS for external integrations where applicable
- [ ] Ensure paper trading can operate without real trading permissions or live-order API access
- [ ] Add exchange ToS and trading-risk disclaimer copy
- [ ] Document privacy behavior for AI queries and consent choices

### 4.16 Testing and Quality

- [ ] Add unit tests for strategy calculations and risk logic
- [ ] Add integration tests for exchange service behavior with mocked APIs
- [ ] Add end-to-end tests for key frontend flows
- [ ] Validate paper trading mode against expected strategy behavior
- [ ] Add tests ensuring paper trading never calls live order placement paths
- [ ] Run backtests to compare bot performance against manual baseline assumptions
- [ ] Add failure tests for API outage, stale data, and invalid credentials

### 4.17 Beta Readiness and Documentation

- [ ] Write setup documentation for local MVP usage
- [ ] Document supported exchanges and known limitations
- [ ] Document how paper trading works, including assumptions and limitations of simulation fidelity
- [ ] Add troubleshooting guide for failed API auth, rate limits, and bot stoppages
- [ ] Create beta test checklist and feedback capture template
- [ ] Define MVP release criteria and sign-off checklist

## 5. Suggested Delivery Order

1. Project foundation
2. Exchange integration and market data
3. Shared strategy engine and execution modes
4. Grid Bot
5. Rebalance Bot
6. Infinity Grid Bot
7. Paper trading mode
8. Risk management
9. AI assistant
10. CLI
11. Web frontend
12. Backtesting, logging, and export
13. Security, testing, and beta readiness

## 6. MVP Acceptance Criteria

- [ ] User can connect a supported exchange using API credentials
- [ ] User can configure and run Grid, Rebalance, and Infinity Grid bots on `BTC/USDT`
- [ ] User can run all strategies in paper trading mode before live trading
- [ ] User can configure virtual starting balances and review paper trading results
- [ ] Bot can place, monitor, and replace exchange orders reliably
- [ ] AI assistant can answer market-condition questions and suggest settings using live data
- [ ] User can operate the system from CLI and web dashboard
- [ ] Logs and CSV exports are available for live trades, paper trades, errors, and AI interactions
- [ ] Backtesting works on historical BTC/USDT data
- [ ] Core safety controls and disclaimers are in place
- [ ] Test coverage exists for critical strategy and risk paths

## 7. Open Decisions

- [ ] Choose the primary exchange for MVP launch
- [ ] Decide whether bot state/log persistence should use files, SQLite, or Postgres
- [ ] Decide whether frontend talks directly to Python backend or via a thin API gateway
- [ ] Decide whether AI chat history is opt-in only or session-only by default
- [ ] Define the paper trading fill model and assumptions for slippage/partial fills
- [ ] Decide whether paper trading requires authenticated exchange access or public-market-data-only mode by default
- [ ] Define exact beta success metrics and reporting method
