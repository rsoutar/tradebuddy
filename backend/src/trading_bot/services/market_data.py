from __future__ import annotations

from trading_bot.models import MarketSnapshot
from trading_bot.services.exchange import ExchangeClient


class MarketDataService:
    def __init__(self, exchange_client: ExchangeClient) -> None:
        self._exchange_client = exchange_client

    def get_snapshot(self, symbol: str) -> MarketSnapshot:
        return self._exchange_client.fetch_market_snapshot(symbol)

