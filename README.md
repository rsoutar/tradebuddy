# Oscar Trading Bot

Oscar is a `BTC/USDT` spot-market trading bot MVP with a Python backend, a TanStack Start frontend, paper-trading workflows, and historical backtesting for three strategy families:

- Grid
- Rebalance
- Infinity Grid

The project currently focuses on a single-symbol Binance spot setup, with mock and CCXT-backed exchange access, a dashboard-oriented API, and a web UI for bot operations, history, and backtest review.

## What Is Implemented

- FastAPI backend with status, dashboard, trade history, bot lifecycle, deposit, and backtest endpoints
- CLI for status checks, strategy previews, historical data summaries, backtests, API serving, and worker execution
- Paper-trading state persisted to SQLite under the configured runtime state directory
- Binance spot WebSocket market data with snapshot-file and REST fallbacks
- Historical backtest runners for Grid, Rebalance, and Infinity Grid strategies
- TanStack Start frontend with dashboard, bot management, backtesting, history, onboarding, settings, and AI-oriented routes
- Demo auth flow today, with LINE Login wiring available through frontend environment variables
- Strategy diagrams and supporting docs under [`docs/`](docs/README.md)

## Repository Layout

```text
backend/    Python package, API, CLI, workers, tests
docs/       Strategy diagrams and supporting documentation
frontend/   TanStack Start application
PRD.md      Product requirements
TASKS.md    Delivery checklist and scope tracking
README.md   Repository overview and local setup
```

## Requirements

- Python 3.9+
- Node.js 18+ and npm
- Binance spot market only for the current MVP
- `BTC/USDT` only for the current MVP

## Quick Start

1. Copy the shared environment template:

   ```bash
   cp .env.example .env
   ```

2. Start the backend:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e ".[dev]"
   trading-bot serve-api --reload
   ```

3. In a second terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Open the frontend in your browser and the API docs at [http://127.0.0.1:8000/swagger](http://127.0.0.1:8000/swagger).

## Docker

1. Copy the shared environment template and set a real `AUTH_SESSION_SECRET`:

   ```bash
   cp .env.example .env
   ```

2. Start the full stack:

   ```bash
   docker compose up --build
   ```

3. Open the frontend at [http://127.0.0.1:3000](http://127.0.0.1:3000) and the backend docs at [http://127.0.0.1:8000/swagger](http://127.0.0.1:8000/swagger).

The compose setup keeps backend state and logs in a named Docker volume mounted at `/app/.data`. It also overrides `VITE_API_BASE_URL` inside the frontend container so the frontend talks to the backend service over the Docker network while still exposing the app on port `3000`.

## ONCE

The repository root [`Dockerfile`](Dockerfile) builds a single-container image for [ONCE](https://github.com/basecamp/once). It:

- serves HTTP on port `80`
- exposes `GET /up` for health checks
- stores backend state and logs under `/storage`
- honors runtime-provided `HOST`, `PORT`, `TRADING_BOT_API_HOST`, and `TRADING_BOT_API_PORT` values

Build it locally with:

```bash
docker build -t ghcr.io/rsoutar/tradebuddy:latest .
```

Merges to `main` also trigger the GitHub Actions workflow in [`.github/workflows/publish-image.yml`](.github/workflows/publish-image.yml), which rebuilds this root image and publishes it to `ghcr.io/rsoutar/tradebuddy`.

The publish workflow pushes a multi-arch image for both `linux/amd64` and `linux/arm64`, so Apple Silicon hosts can pull `:latest` without a platform override after the next successful publish.

## Environment

The root [`.env.example`](.env.example) contains the shared defaults used by local development.

Important backend variables:

- `TRADING_BOT_SYMBOL=BTCUSDT`
- `TRADING_BOT_EXCHANGE_ID=binance`
- `TRADING_BOT_EXCHANGE_MARKET_TYPE=spot`
- `TRADING_BOT_STATE_DIR=.data/state`
- `TRADING_BOT_LOG_DIR=.data/logs`
- `TRADING_BOT_HISTORY_DIR=.data/binance/spot/monthly/klines`
- `TRADING_BOT_MARKETDATA_WS_ENABLED=true`
- `TRADING_BOT_MARKETDATA_WS_URL=wss://data-stream.binance.vision`
- `TRADING_BOT_AI_PROVIDER=xai`
- `TRADING_BOT_AI_ENABLED=false`

Important frontend variables:

- `VITE_API_BASE_URL=http://127.0.0.1:8000`
- `AUTH_SESSION_SECRET` secures the signed session cookie
- `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` enable the live LINE Login flow
- `LINE_REDIRECT_URI` is optional; when omitted, the frontend derives it from the current origin

If `AUTH_SESSION_SECRET` is unset, the app falls back to a built-in development secret. If the LINE variables are unset, the frontend falls back to demo authentication for local development.

Backtesting reads Binance monthly archive zip files from `TRADING_BOT_HISTORY_DIR`. In the ONCE image, that defaults to `/storage/binance/spot/monthly/klines`, so archive data survives redeploys when mounted under `/storage`.

## Backend Commands

Common CLI commands from `backend/` after installing dependencies:

```bash
trading-bot status
trading-bot demo-strategy grid
trading-bot demo-strategy rebalance
trading-bot demo-strategy infinity-grid
trading-bot history-summary --data-dir /path/to/binance-archives
trading-bot run-backtest grid --data-dir /path/to/binance-archives
trading-bot serve-api --reload
trading-bot run-bot --bot-id <bot-id>
pytest
```

Optional live-exchange dependencies:

```bash
pip install -e ".[live]"
```

Those dependencies enable CCXT-backed exchange access for authenticated reads and future live-trading work. The current product surface is still centered on paper trading and backtesting.

## API Surface

Default local server: `http://127.0.0.1:8000`

- `GET /up`
- `GET /health`
- `GET /swagger`
- `GET /redoc`
- `GET /openapi.json`
- `GET /api/status`
- `GET /api/dashboard`
- `GET /api/trades`
- `GET /api/bots/history`
- `GET /api/strategies/{strategy}`
- `POST /api/paper-trading/run`
- `POST /api/paper-trading/deposits`
- `POST /api/bots`
- `POST /api/bots/{bot_id}/start`
- `POST /api/bots/{bot_id}/stop`
- `POST /api/backtests/run`

For backend-specific setup and examples, see [`backend/README.md`](backend/README.md).

## Documentation

- [`docs/README.md`](docs/README.md) for the documentation index
- [`docs/grid-strategy-diagram.mmd`](docs/grid-strategy-diagram.mmd) for the grid bot flow
- [`docs/rebalance-strategy-diagram.mmd`](docs/rebalance-strategy-diagram.mmd) for the rebalance bot flow
- [`docs/infinity-grid-strategy-diagram.mmd`](docs/infinity-grid-strategy-diagram.mmd) for the infinity grid flow
- [`PRD.md`](PRD.md) for product requirements
- [`TASKS.md`](TASKS.md) for milestone and scope tracking

## Current Limits

- Spot market only
- `BTC/USDT` only
- Paper-trading and backtest workflows are much further along than live execution
- AI configuration exists in settings and frontend routing, but the feature set is not yet complete
