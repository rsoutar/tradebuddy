from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import asdict
from datetime import datetime
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
    written_at = time.time()
    ticks: list[dict[str, float]] = []
    if snapshot_path.exists():
        try:
            existing_payload = json.loads(snapshot_path.read_text())
        except (OSError, json.JSONDecodeError):
            existing_payload = None
        if isinstance(existing_payload, dict) and existing_payload.get("symbol") == snapshot.symbol:
            raw_ticks = existing_payload.get("ticks", [])
            if isinstance(raw_ticks, list):
                ticks = [
                    {"written_at": float(tick["written_at"]), "price": float(tick["price"])}
                    for tick in raw_ticks
                    if isinstance(tick, dict)
                    and tick.get("written_at") is not None
                    and tick.get("price") is not None
                ]
    ticks.append({"written_at": written_at, "price": snapshot.price})
    cutoff = written_at - 120.0
    ticks = [tick for tick in ticks if tick["written_at"] >= cutoff][-240:]
    payload = {
        "written_at": written_at,
        "symbol": snapshot.symbol,
        "snapshot": asdict(snapshot),
        "ticks": ticks,
    }
    try:
        temp_path.write_text(json.dumps(payload))
        temp_path.replace(snapshot_path)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


def read_shared_price_window(
    snapshot_path: Path,
    symbol: str,
    *,
    since: Optional[str] = None,
    max_age_seconds: float = 10.0,
) -> Optional[dict[str, float]]:
    if not snapshot_path.exists():
        return None

    try:
        payload = json.loads(snapshot_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None

    if payload.get("symbol") != symbol:
        return None

    written_at = float(payload.get("written_at", 0.0))
    if written_at <= 0 or (time.time() - written_at) > max_age_seconds:
        return None

    snapshot = payload.get("snapshot")
    if not isinstance(snapshot, dict):
        return None

    current_price = float(snapshot.get("price") or 0.0)
    if current_price <= 0:
        return None

    since_epoch = 0.0
    if since:
        since_epoch = datetime.fromisoformat(since).timestamp()

    raw_ticks = payload.get("ticks", [])
    prices = [
        float(tick["price"])
        for tick in raw_ticks
        if isinstance(tick, dict)
        and float(tick.get("written_at") or 0.0) >= since_epoch
        and float(tick.get("price") or 0.0) > 0
    ]
    if not prices:
        prices = [current_price]

    return {
        "low_price": min(prices),
        "high_price": max(prices),
        "current_price": current_price,
    }


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
