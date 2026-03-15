from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _parse_bool(raw: str, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_csv(raw: Optional[str], default: list[str]) -> list[str]:
    if raw is None:
        return default
    return [value.strip() for value in raw.split(",") if value.strip()] or default


def _normalize_symbol(raw: str) -> str:
    compact = raw.replace("/", "").replace("-", "").strip().upper()
    if compact != "BTCUSDT":
        raise ValueError("TRADING_BOT_SYMBOL must be BTCUSDT for this MVP.")
    return "BTC/USDT"


@dataclass(frozen=True)
class ExchangeSettings:
    exchange_id: str
    market_type: str
    api_key: str
    api_secret: str
    sandbox: bool


@dataclass(frozen=True)
class AISettings:
    provider: str
    enabled: bool
    api_key: str


@dataclass(frozen=True)
class RuntimeSettings:
    environment: str
    symbol: str
    log_level: str
    state_dir: Path
    log_dir: Path


@dataclass(frozen=True)
class MarketDataSettings:
    websocket_enabled: bool
    websocket_url: str
    websocket_timeout_seconds: float


@dataclass(frozen=True)
class APISettings:
    host: str
    port: int
    cors_origins: list[str]


@dataclass(frozen=True)
class AppSettings:
    runtime: RuntimeSettings
    exchange: ExchangeSettings
    ai: AISettings
    api: APISettings
    market_data: MarketDataSettings


def load_settings() -> AppSettings:
    runtime = RuntimeSettings(
        environment=os.getenv("TRADING_BOT_ENV", "development"),
        symbol=_normalize_symbol(os.getenv("TRADING_BOT_SYMBOL", "BTCUSDT")),
        log_level=os.getenv("TRADING_BOT_LOG_LEVEL", "INFO").upper(),
        state_dir=Path(os.getenv("TRADING_BOT_STATE_DIR", ".data/state")),
        log_dir=Path(os.getenv("TRADING_BOT_LOG_DIR", ".data/logs")),
    )
    if runtime.log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ValueError("TRADING_BOT_LOG_LEVEL must be a valid Python log level.")

    exchange = ExchangeSettings(
        exchange_id=os.getenv("TRADING_BOT_EXCHANGE_ID", "binance"),
        market_type=os.getenv("TRADING_BOT_EXCHANGE_MARKET_TYPE", "spot"),
        api_key=os.getenv("TRADING_BOT_EXCHANGE_API_KEY", ""),
        api_secret=os.getenv("TRADING_BOT_EXCHANGE_API_SECRET", ""),
        sandbox=_parse_bool(os.getenv("TRADING_BOT_EXCHANGE_SANDBOX", "true"), default=True),
    )
    if exchange.market_type != "spot":
        raise ValueError("TRADING_BOT_EXCHANGE_MARKET_TYPE must be 'spot' for this MVP.")

    ai = AISettings(
        provider=os.getenv("TRADING_BOT_AI_PROVIDER", "xai"),
        enabled=_parse_bool(os.getenv("TRADING_BOT_AI_ENABLED", "false")),
        api_key=os.getenv("TRADING_BOT_AI_API_KEY", ""),
    )
    api = APISettings(
        host=os.getenv("TRADING_BOT_API_HOST", "127.0.0.1"),
        port=int(os.getenv("TRADING_BOT_API_PORT", "8000")),
        cors_origins=_parse_csv(
            os.getenv("TRADING_BOT_API_CORS_ORIGINS"),
            default=[
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ],
        ),
    )
    market_data = MarketDataSettings(
        websocket_enabled=_parse_bool(
            os.getenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "true"),
            default=True,
        ),
        websocket_url=os.getenv(
            "TRADING_BOT_MARKETDATA_WS_URL",
            "wss://data-stream.binance.vision",
        ),
        websocket_timeout_seconds=float(
            os.getenv("TRADING_BOT_MARKETDATA_WS_TIMEOUT_SECONDS", "2.0")
        ),
    )
    return AppSettings(
        runtime=runtime,
        exchange=exchange,
        ai=ai,
        api=api,
        market_data=market_data,
    )
