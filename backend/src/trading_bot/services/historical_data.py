from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

from trading_bot.models import HistoricalCandle


ARCHIVE_NAME_RE = re.compile(
    r"^(?P<symbol>[A-Z0-9]+)-(?P<interval>[A-Za-z0-9]+)-(?P<year>\d{4})-(?P<month>\d{2})\.zip$"
)
REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_HISTORY_DIR = REPO_ROOT / ".data" / "binance" / "spot" / "monthly" / "klines"


@dataclass(frozen=True)
class BinanceArchive:
    path: Path
    symbol: str
    interval: str
    year: int
    month: int

    @property
    def month_start(self) -> datetime:
        return datetime(self.year, self.month, 1, tzinfo=timezone.utc)

    @property
    def next_month_start(self) -> datetime:
        if self.month == 12:
            return datetime(self.year + 1, 1, 1, tzinfo=timezone.utc)
        return datetime(self.year, self.month + 1, 1, tzinfo=timezone.utc)


class BinanceHistoricalKlineLoader:
    def __init__(
        self,
        data_dir: Path | str | None = None,
        *,
        symbol: str = "BTCUSDT",
        interval: str = "15m",
    ) -> None:
        normalized_symbol = self._normalize_symbol(symbol)
        self.symbol = normalized_symbol
        self.interval = interval
        base_dir = Path(data_dir) if data_dir is not None else DEFAULT_HISTORY_DIR
        self.data_dir = base_dir / normalized_symbol / interval

    @staticmethod
    def _normalize_symbol(symbol: str) -> str:
        return symbol.replace("/", "").replace("-", "").strip().upper()

    @staticmethod
    def _normalize_datetime(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _parse_archive(path: Path) -> BinanceArchive | None:
        match = ARCHIVE_NAME_RE.match(path.name)
        if not match:
            return None
        return BinanceArchive(
            path=path,
            symbol=match.group("symbol"),
            interval=match.group("interval"),
            year=int(match.group("year")),
            month=int(match.group("month")),
        )

    def available_archives(self) -> list[BinanceArchive]:
        if not self.data_dir.exists():
            return []

        archives: list[BinanceArchive] = []
        for path in sorted(self.data_dir.glob("*.zip")):
            archive = self._parse_archive(path)
            if archive is None:
                continue
            if archive.symbol != self.symbol or archive.interval != self.interval:
                continue
            archives.append(archive)
        return archives

    def _iter_archive_rows(self, archive: BinanceArchive) -> list[HistoricalCandle]:
        with ZipFile(archive.path) as zip_file:
            csv_names = [name for name in zip_file.namelist() if name.endswith(".csv")]
            if not csv_names:
                raise ValueError(f"No CSV file found inside archive: {archive.path}")

            with zip_file.open(csv_names[0]) as handle:
                text_stream = io.TextIOWrapper(handle, encoding="utf-8", newline="")
                reader = csv.reader(text_stream)
                candles: list[HistoricalCandle] = []
                for row in reader:
                    if not row:
                        continue
                    candles.append(self._build_candle(row))
                return candles

    def _build_candle(self, row: list[str]) -> HistoricalCandle:
        open_time_ms = int(row[0])
        close_time_ms = int(row[6])
        return HistoricalCandle(
            symbol=self.symbol,
            interval=self.interval,
            open_time=self._parse_exchange_timestamp(open_time_ms),
            close_time=self._parse_exchange_timestamp(close_time_ms),
            open=float(row[1]),
            high=float(row[2]),
            low=float(row[3]),
            close=float(row[4]),
            volume=float(row[5]),
            quote_volume=float(row[7]),
            trade_count=int(row[8]),
            taker_buy_base_volume=float(row[9]),
            taker_buy_quote_volume=float(row[10]),
        )

    @staticmethod
    def _parse_exchange_timestamp(raw_value: int) -> datetime:
        # Binance monthly archives mostly use millisecond epochs, but newer files can
        # contain microsecond precision. Normalize both to UTC datetimes.
        if raw_value >= 10**15:
            timestamp_seconds = raw_value / 1_000_000
        elif raw_value >= 10**12:
            timestamp_seconds = raw_value / 1_000
        else:
            timestamp_seconds = raw_value
        return datetime.fromtimestamp(timestamp_seconds, tz=timezone.utc)

    def load_candles(
        self,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[HistoricalCandle]:
        start = self._normalize_datetime(start)
        end = self._normalize_datetime(end)
        candles: list[HistoricalCandle] = []

        for archive in self.available_archives():
            if start and archive.next_month_start <= start:
                continue
            if end and archive.month_start >= end:
                continue

            for candle in self._iter_archive_rows(archive):
                if start and candle.open_time < start:
                    continue
                if end and candle.open_time >= end:
                    continue
                candles.append(candle)

        return candles

    def summarize(
        self,
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, str | int | None]:
        candles = self.load_candles(start=start, end=end)
        return {
            "symbol": self.symbol,
            "interval": self.interval,
            "dataDir": str(self.data_dir),
            "archiveCount": len(self.available_archives()),
            "candleCount": len(candles),
            "firstOpenTime": candles[0].open_time.isoformat() if candles else None,
            "lastOpenTime": candles[-1].open_time.isoformat() if candles else None,
        }
