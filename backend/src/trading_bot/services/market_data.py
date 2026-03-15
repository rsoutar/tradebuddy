from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Optional, Protocol

from trading_bot.models import MarketSnapshot
from trading_bot.services.exchange import ExchangeClient


class MarketDataStream(Protocol):
    def get_snapshot(self, symbol: str) -> Optional[MarketSnapshot]:
        ...


class SharedSnapshotFileMarketData:
    def __init__(self, snapshot_path: Path, max_age_seconds: float = 10.0) -> None:
        self._snapshot_path = snapshot_path
        self._max_age_seconds = max_age_seconds

    def get_snapshot(self, symbol: str) -> Optional[MarketSnapshot]:
        if not self._snapshot_path.exists():
            return None

        try:
            payload = json.loads(self._snapshot_path.read_text())
        except (OSError, json.JSONDecodeError):
            return None

        if payload.get("symbol") != symbol:
            return None

        written_at = float(payload.get("written_at", 0.0))
        if written_at <= 0 or (time.time() - written_at) > self._max_age_seconds:
            return None

        snapshot = payload.get("snapshot")
        if not isinstance(snapshot, dict):
            return None

        try:
            return MarketSnapshot(**snapshot)
        except TypeError:
            return None


def write_shared_snapshot(snapshot_path: Path, snapshot: MarketSnapshot) -> None:
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = snapshot_path.with_name(
        f"{snapshot_path.stem}.{os.getpid()}.{threading.get_ident()}.tmp"
    )
    payload = {
        "written_at": time.time(),
        "symbol": snapshot.symbol,
        "snapshot": asdict(snapshot),
    }
    try:
        temp_path.write_text(json.dumps(payload))
        temp_path.replace(snapshot_path)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


class MarketDataService:
    def __init__(
        self,
        exchange_client: ExchangeClient,
        market_stream: Optional[MarketDataStream] = None,
    ) -> None:
        self._exchange_client = exchange_client
        self._market_stream = market_stream

    def get_snapshot(self, symbol: str) -> MarketSnapshot:
        if self._market_stream is not None:
            snapshot = self._market_stream.get_snapshot(symbol)
            if snapshot is not None:
                return snapshot
        return self._exchange_client.fetch_market_snapshot(symbol)
