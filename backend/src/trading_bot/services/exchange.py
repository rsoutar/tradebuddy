from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from trading_bot.models import Balance, MarketSnapshot
from trading_bot.settings import ExchangeSettings


class ExchangeClient(Protocol):
    exchange_name: str

    def fetch_market_snapshot(self, symbol: str) -> MarketSnapshot:
        ...

    def fetch_balances(self) -> list[Balance]:
        ...


@dataclass
class MockExchangeClient:
    exchange_name: str = "mock"

    def fetch_market_snapshot(self, symbol: str) -> MarketSnapshot:
        return MarketSnapshot(
            symbol=symbol,
            price=68250.0,
            change_24h_pct=1.8,
            volume_24h=35_000_000_000.0,
            volatility_24h_pct=2.4,
            trend="sideways-to-bullish",
        )

    def fetch_balances(self) -> list[Balance]:
        return [
            Balance(asset="BTC", free=0.12, locked=0.0),
            Balance(asset="USDT", free=4200.0, locked=0.0),
        ]


class CcxtExchangeClient:
    def __init__(self, settings: ExchangeSettings) -> None:
        self._settings = settings
        self.exchange_name = settings.exchange_id
        self._client = None

    def _ensure_client(self):
        if self._client is not None:
            return self._client
        try:
            import ccxt  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Install ccxt to enable live exchange access.") from exc

        exchange_cls = getattr(ccxt, self._settings.exchange_id, None)
        if exchange_cls is None:
            raise ValueError(f"Unsupported exchange: {self._settings.exchange_id}")

        self._client = exchange_cls(
            {
                "apiKey": self._settings.api_key,
                "secret": self._settings.api_secret,
                "enableRateLimit": True,
            }
        )
        if self._settings.sandbox and hasattr(self._client, "set_sandbox_mode"):
            self._client.set_sandbox_mode(True)
        return self._client

    def fetch_market_snapshot(self, symbol: str) -> MarketSnapshot:
        client = self._ensure_client()
        ticker = client.fetch_ticker(symbol)
        return MarketSnapshot(
            symbol=symbol,
            price=float(ticker["last"]),
            change_24h_pct=float(ticker.get("percentage") or 0.0),
            volume_24h=float(ticker.get("quoteVolume") or 0.0),
            volatility_24h_pct=0.0,
            trend="live-feed",
        )

    def fetch_balances(self) -> list[Balance]:
        client = self._ensure_client()
        payload = client.fetch_balance()
        balances: list[Balance] = []
        for asset, free_amount in payload.get("free", {}).items():
            locked_amount = payload.get("used", {}).get(asset, 0.0)
            if free_amount or locked_amount:
                balances.append(
                    Balance(
                        asset=asset,
                        free=float(free_amount),
                        locked=float(locked_amount),
                    )
                )
        return balances

