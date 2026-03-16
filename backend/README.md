# Backend

Python backend scaffold for the Bitcoin trading bot MVP.

Included in Phase 1:

- Runtime settings and environment loading
- Logging setup
- BTCUSDT-only spot-market validation
- Exchange abstraction with mock and CCXT-backed clients
- Binance spot WebSocket market data feed with REST fallback
- Strategy prototypes for Grid, Rebalance, and Infinity Grid bots
- FastAPI endpoints for dashboard status, strategy previews, paper runs, and backtests
- CLI commands for status, strategy evaluation demos, and serving the API

## Requirements

- Python 3.9+
- Binance spot market only
- `BTCUSDT` only for this MVP

## Setup

Create a virtual environment and install the backend dependencies:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install fastapi uvicorn websocket-client pytest ruff httpx
```

If you want authenticated CCXT access for balances or later live trading work, install the optional live dependencies too:

```bash
python3 -m pip install ccxt requests pandas
```

## Environment

Copy the project-level env template and keep the backend on Binance spot with `BTCUSDT`:

```bash
cp ../.env.example .env
```

Important backend settings:

- `TRADING_BOT_SYMBOL=BTCUSDT`
- `TRADING_BOT_EXCHANGE_ID=binance`
- `TRADING_BOT_EXCHANGE_MARKET_TYPE=spot`
- `TRADING_BOT_MARKETDATA_WS_ENABLED=true`
- `TRADING_BOT_MARKETDATA_WS_URL=wss://data-stream.binance.vision`

## Running

Run the API server locally:

```bash
PYTHONPATH=src python3 -m trading_bot.cli serve-api --reload
```

Useful CLI commands:

```bash
PYTHONPATH=src python3 -m trading_bot.cli status
PYTHONPATH=src python3 -m trading_bot.cli demo-strategy grid
PYTHONPATH=src python3 -m trading_bot.cli demo-strategy rebalance
PYTHONPATH=src python3 -m trading_bot.cli demo-strategy infinity-grid
```

Run the test suite:

```bash
PYTHONPATH=src python3 -m pytest
$HOME/Library/Python/3.9/bin/ruff check src tests
```

Reset all paper-trading state later with:

```bash
./scripts/reset_paper_state.sh
```

## API Endpoints

Default local server: `http://127.0.0.1:8000`

- `GET /swagger`
- `GET /openapi.json`
- `GET /redoc`
- `GET /health`
- `GET /api/status`
- `GET /api/dashboard`
- `GET /api/strategies/{strategy}`
- `POST /api/paper-trading/run`
- `POST /api/backtests/run`

Example requests:

```bash
curl http://127.0.0.1:8000/api/dashboard
curl -X POST http://127.0.0.1:8000/api/paper-trading/run \
  -H "Content-Type: application/json" \
  -d '{"strategy":"grid"}'
```
