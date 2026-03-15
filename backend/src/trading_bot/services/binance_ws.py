from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import replace
from pathlib import Path
from typing import Any, Optional

from websocket import WebSocketApp

from trading_bot.models import MarketSnapshot
from trading_bot.services.market_data import write_shared_snapshot


logger = logging.getLogger(__name__)


def to_binance_symbol(symbol: str) -> str:
    return symbol.replace("/", "").replace("-", "").strip().lower()


class BinanceSpotWebSocketMarketData:
    """Public spot-market data feed for BTCUSDT via Binance WebSocket."""

    def __init__(
        self,
        symbol: str,
        websocket_url: str,
        initial_timeout_seconds: float = 2.0,
        reconnect_delay_seconds: float = 3.0,
        snapshot_path: Optional[Path] = None,
    ) -> None:
        self._symbol = symbol
        self._stream_symbol = to_binance_symbol(symbol)
        self._websocket_url = websocket_url.rstrip("/")
        self._initial_timeout_seconds = initial_timeout_seconds
        self._reconnect_delay_seconds = reconnect_delay_seconds
        self._snapshot_lock = threading.Lock()
        self._snapshot_ready = threading.Event()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._websocket: Optional[WebSocketApp] = None
        self._latest_snapshot: Optional[MarketSnapshot] = None
        self._last_error: Optional[str] = None
        self._snapshot_path = snapshot_path

    def get_snapshot(self, symbol: str) -> Optional[MarketSnapshot]:
        if symbol != self._symbol:
            raise ValueError("Binance spot stream is restricted to BTCUSDT.")

        self.start()
        if self._latest_snapshot is None:
            self._snapshot_ready.wait(timeout=self._initial_timeout_seconds)

        with self._snapshot_lock:
            if self._latest_snapshot is None:
                return None
            return replace(self._latest_snapshot)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_forever, name="binance-spot-ws", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._websocket is not None:
            self._websocket.close()
        if self._thread is not None:
            self._thread.join(timeout=1.0)

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def _run_forever(self) -> None:
        stream_url = f"{self._websocket_url}/stream?streams={self._stream_symbol}@ticker"

        while not self._stop_event.is_set():
            logger.info("Connecting to Binance spot WebSocket: %s", stream_url)
            websocket = WebSocketApp(
                stream_url,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
                on_open=self._on_open,
            )
            self._websocket = websocket

            try:
                websocket.run_forever(ping_interval=15, ping_timeout=5)
            except Exception as exc:  # pragma: no cover
                self._last_error = str(exc)
                logger.warning("Binance WebSocket stopped with error: %s", exc)
            finally:
                self._websocket = None

            if self._stop_event.is_set():
                return

            time.sleep(self._reconnect_delay_seconds)

    def _on_open(self, websocket: WebSocketApp) -> None:
        logger.info("Binance spot WebSocket connected for %s", self._symbol)

    def _on_close(
        self,
        websocket: WebSocketApp,
        status_code: Optional[int],
        message: Optional[str],
    ) -> None:
        logger.info(
            "Binance spot WebSocket closed for %s (code=%s, message=%s)",
            self._symbol,
            status_code,
            message,
        )

    def _on_error(self, websocket: WebSocketApp, error: Any) -> None:
        self._last_error = str(error)
        logger.warning("Binance spot WebSocket error for %s: %s", self._symbol, error)

    def _on_message(self, websocket: WebSocketApp, message: str) -> None:
        payload = json.loads(message)
        event = payload.get("data", payload)
        if event.get("e") != "24hrTicker":
            return

        snapshot = self._snapshot_from_ticker_event(event)
        with self._snapshot_lock:
            self._latest_snapshot = snapshot
        self._snapshot_ready.set()
        if self._snapshot_path is not None:
            try:
                write_shared_snapshot(self._snapshot_path, snapshot)
            except OSError as exc:  # pragma: no cover
                logger.warning("Unable to persist shared market snapshot: %s", exc)

    def _snapshot_from_ticker_event(self, event: dict[str, Any]) -> MarketSnapshot:
        price = float(event["c"])
        open_price = float(event.get("o") or price)
        high_price = float(event.get("h") or price)
        low_price = float(event.get("l") or price)
        change_pct = float(event.get("P") or 0.0)
        range_pct = 0.0
        if open_price > 0:
            range_pct = ((high_price - low_price) / open_price) * 100

        trend = "sideways"
        if change_pct >= 1.0:
            trend = "bullish"
        elif change_pct <= -1.0:
            trend = "bearish"

        return MarketSnapshot(
            symbol=self._symbol,
            price=price,
            change_24h_pct=change_pct,
            volume_24h=float(event.get("q") or 0.0),
            volatility_24h_pct=round(range_pct, 2),
            trend=trend,
        )
