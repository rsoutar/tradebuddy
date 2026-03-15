# Bitcoin Trading Bot

Phase 1 scaffolding for a `BTC/USDT` trading bot with:

- Python backend foundation
- Exchange and market data abstractions
- Strategy prototypes for Grid, Rebalance, and Infinity Grid
- CLI demo flows
- TanStack Start frontend shell

## Repository Layout

```text
backend/   Python application code
frontend/  TanStack Start application
PRD.md     Product requirements
TASKS.md   Delivery checklist
```

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
trading-bot status
trading-bot demo-strategy grid
trading-bot serve-api --reload
pytest

# Install live exchange dependencies when you are ready to wire CCXT
pip install -e ".[live]"
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend auth variables:

- `AUTH_SESSION_SECRET` secures the signed session cookie used after login.
- `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` enable the live LINE Login flow.
- `LINE_REDIRECT_URI` is optional; if omitted, the app uses the current origin plus `/auth/line`.

On first run, TanStack Start generates `src/routeTree.gen.ts`.

## Current Phase 1 Coverage

- Project structure and local environment configuration
- Backend settings, logging, domain models, and service boundaries
- BTCUSDT-only spot-market configuration for the MVP
- Exchange integration abstraction with mock and CCXT-backed clients
- Binance spot WebSocket market data feed with REST fallback
- Strategy evaluation prototypes with tests
- FastAPI dashboard endpoints for status, strategy previews, paper runs, and backtests
- TanStack Start dashboard, onboarding, bot, and AI routes

## Next Steps

- Add persistent state storage
- Add real backend API endpoints for the web frontend
- Expand strategy execution from evaluation plans to live/simulated runners
- Implement AI and backtesting modules
