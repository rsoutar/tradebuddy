from __future__ import annotations

import json

from trading_bot.models import MarketSnapshot
from trading_bot.services.binance_ws import BinanceSpotWebSocketMarketData
from trading_bot.services.exchange import MockExchangeClient
from trading_bot.services.market_data import MarketDataService


def test_binance_ticker_event_is_converted_to_market_snapshot() -> None:
    stream = BinanceSpotWebSocketMarketData(
        symbol="BTC/USDT",
        websocket_url="wss://data-stream.binance.vision",
        initial_timeout_seconds=0.0,
    )

    stream._on_message(
        None,  # type: ignore[arg-type]
        json.dumps(
            {
                "stream": "btcusdt@ticker",
                "data": {
                    "e": "24hrTicker",
                    "s": "BTCUSDT",
                    "c": "68420.12",
                    "P": "2.34",
                    "q": "123456789.00",
                    "o": "66800.00",
                    "h": "68950.00",
                    "l": "66100.00",
                },
            }
        ),
    )

    snapshot = stream._latest_snapshot

    assert snapshot == MarketSnapshot(
        symbol="BTC/USDT",
        price=68420.12,
        change_24h_pct=2.34,
        volume_24h=123456789.0,
        volatility_24h_pct=4.27,
        trend="bullish",
    )


def test_market_data_service_falls_back_to_exchange_when_stream_has_no_snapshot() -> None:
    class EmptyStream:
        def get_snapshot(self, symbol: str) -> None:
            return None

    service = MarketDataService(MockExchangeClient(), market_stream=EmptyStream())

    snapshot = service.get_snapshot("BTC/USDT")

    assert snapshot.symbol == "BTC/USDT"
    assert snapshot.price == 68250.0
