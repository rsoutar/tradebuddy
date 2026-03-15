from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

from trading_bot.services.historical_data import BinanceHistoricalKlineLoader


def write_archive(base_dir: Path, name: str, rows: list[list[str]]) -> None:
    target_dir = base_dir / "BTCUSDT" / "15m"
    target_dir.mkdir(parents=True, exist_ok=True)
    archive_path = target_dir / name
    csv_name = name.replace(".zip", ".csv")
    csv_payload = "\n".join(",".join(row) for row in rows)
    with ZipFile(archive_path, "w") as archive:
        archive.writestr(csv_name, csv_payload)


def test_loader_reads_monthly_archives_in_order(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "42000.0",
                "42100.0",
                "41950.0",
                "42050.0",
                "12.5",
                "1704068099999",
                "525000.0",
                "120",
                "7.1",
                "298500.0",
                "0",
            ]
        ],
    )
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-02.zip",
        [
            [
                "1706745600000",
                "43000.0",
                "43150.0",
                "42920.0",
                "43100.0",
                "10.0",
                "1706746499999",
                "430200.0",
                "100",
                "5.4",
                "232308.0",
                "0",
            ]
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path, symbol="BTC/USDT", interval="15m")
    candles = loader.load_candles()

    assert len(candles) == 2
    assert candles[0].open_time == datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc)
    assert candles[0].close == 42050.0
    assert candles[1].open_time == datetime(2024, 2, 1, 0, 0, tzinfo=timezone.utc)
    assert candles[1].trade_count == 100


def test_loader_filters_candles_by_datetime_range(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "42000.0",
                "42100.0",
                "41950.0",
                "42050.0",
                "12.5",
                "1704068099999",
                "525000.0",
                "120",
                "7.1",
                "298500.0",
                "0",
            ],
            [
                "1704068100000",
                "42050.0",
                "42200.0",
                "42020.0",
                "42180.0",
                "9.1",
                "1704068999999",
                "384138.0",
                "95",
                "4.2",
                "177156.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    candles = loader.load_candles(
        start=datetime(2024, 1, 1, 0, 15, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )

    assert len(candles) == 1
    assert candles[0].open == 42050.0
    assert candles[0].close == 42180.0


def test_loader_summary_reports_range_and_count(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "42000.0",
                "42100.0",
                "41950.0",
                "42050.0",
                "12.5",
                "1704068099999",
                "525000.0",
                "120",
                "7.1",
                "298500.0",
                "0",
            ]
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    summary = loader.summarize()

    assert summary["archiveCount"] == 1
    assert summary["candleCount"] == 1
    assert summary["firstOpenTime"] == "2024-01-01T00:00:00+00:00"
    assert summary["lastOpenTime"] == "2024-01-01T00:00:00+00:00"


def test_loader_supports_microsecond_epoch_archives(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2025-01.zip",
        [
            [
                "1735689600000000",
                "93576.00000000",
                "93702.15000000",
                "93489.03000000",
                "93656.18000000",
                "175.85673000",
                "1735690499999999",
                "16461794.00035600",
                "19788",
                "63.20664000",
                "5915901.62666110",
                "0",
            ]
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    candles = loader.load_candles()

    assert len(candles) == 1
    assert candles[0].open_time == datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
    assert candles[0].close_time == datetime(2025, 1, 1, 0, 14, 59, 999999, tzinfo=timezone.utc)
