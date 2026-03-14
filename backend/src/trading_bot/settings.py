from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _parse_bool(raw: str, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class ExchangeSettings:
    exchange_id: str
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
class AppSettings:
    runtime: RuntimeSettings
    exchange: ExchangeSettings
    ai: AISettings


def load_settings() -> AppSettings:
    runtime = RuntimeSettings(
        environment=os.getenv("TRADING_BOT_ENV", "development"),
        symbol=os.getenv("TRADING_BOT_SYMBOL", "BTC/USDT"),
        log_level=os.getenv("TRADING_BOT_LOG_LEVEL", "INFO").upper(),
        state_dir=Path(os.getenv("TRADING_BOT_STATE_DIR", ".data/state")),
        log_dir=Path(os.getenv("TRADING_BOT_LOG_DIR", ".data/logs")),
    )
    if runtime.log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ValueError("TRADING_BOT_LOG_LEVEL must be a valid Python log level.")

    exchange = ExchangeSettings(
        exchange_id=os.getenv("TRADING_BOT_EXCHANGE_ID", "binance"),
        api_key=os.getenv("TRADING_BOT_EXCHANGE_API_KEY", ""),
        api_secret=os.getenv("TRADING_BOT_EXCHANGE_API_SECRET", ""),
        sandbox=_parse_bool(os.getenv("TRADING_BOT_EXCHANGE_SANDBOX", "true"), default=True),
    )
    ai = AISettings(
        provider=os.getenv("TRADING_BOT_AI_PROVIDER", "xai"),
        enabled=_parse_bool(os.getenv("TRADING_BOT_AI_ENABLED", "false")),
        api_key=os.getenv("TRADING_BOT_AI_API_KEY", ""),
    )
    return AppSettings(runtime=runtime, exchange=exchange, ai=ai)

