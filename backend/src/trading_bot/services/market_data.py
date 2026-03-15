from __future__ import annotations

from typing import Protocol

from trading_bot.models import MarketSnapshot
from trading_bot.services.exchange import ExchangeClient


class MarketDataStream(Protocol):
    def get_snapshot(self, symbol: str) -> MarketSnapshot | None:
        ...


class MarketDataService:
    def __init__(
        self,
        exchange_client: ExchangeClient,
        market_stream: MarketDataStream | None = None,
    ) -> None:
        self._exchange_client = exchange_client
        self._market_stream = market_stream

    def get_snapshot(self, symbol: str) -> MarketSnapshot:
        if self._market_stream is not None:
            snapshot = self._market_stream.get_snapshot(symbol)
            if snapshot is not None:
                return snapshot
        return self._exchange_client.fetch_market_snapshot(symbol)
