from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

from trading_bot.models import GridBotConfig, InfinityGridBotConfig, RebalanceBotConfig
from trading_bot.services.backtesting import (
    GridBacktestRunner,
    InfinityGridBacktestRunner,
    RebalanceBacktestRunner,
)
from trading_bot.services.historical_data import BinanceHistoricalKlineLoader


def write_archive(base_dir: Path, name: str, rows: list[list[str]]) -> None:
    target_dir = base_dir / "BTCUSDT" / "15m"
    target_dir.mkdir(parents=True, exist_ok=True)
    archive_path = target_dir / name
    csv_name = name.replace(".zip", ".csv")
    csv_payload = "\n".join(",".join(row) for row in rows)
    with ZipFile(archive_path, "w") as archive:
        archive.writestr(csv_name, csv_payload)


def test_grid_backtest_runner_executes_buy_and_sell_cycles(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "111.0",
                "89.0",
                "105.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "105.0",
                "112.0",
                "94.0",
                "110.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    runner = GridBacktestRunner(loader, fee_rate=0.0, slippage_rate=0.0)
    result = runner.run(
        GridBotConfig(
            lower_price=90.0,
            upper_price=110.0,
            grid_count=3,
            spacing_pct=10.0,
            stop_loss_enabled=False,
        ),
        initial_capital_usd=100.0,
        start=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )

    assert result.strategy == "grid"
    assert result.trades >= 2
    assert result.trade_log[0]["side"] == "buy"
    assert any(trade["side"] == "sell" for trade in result.trade_log)
    assert result.final_equity_usd > result.start_equity_usd
    assert result.stop_loss_triggered is False


def test_grid_backtest_runner_respects_spacing_pct_when_building_levels(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "131.0",
                "99.0",
                "130.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    runner = GridBacktestRunner(loader, fee_rate=0.0, slippage_rate=0.0)
    result = runner.run(
        GridBotConfig(
            lower_price=100.0,
            upper_price=130.0,
            grid_count=5,
            spacing_pct=10.0,
            stop_loss_enabled=False,
        ),
        initial_capital_usd=100.0,
        start=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 15, tzinfo=timezone.utc),
    )

    traded_levels = {trade["level"] for trade in result.trade_log}
    assert 121.0 in traded_levels
    assert 110.0 in traded_levels
    assert 115.0 not in traded_levels


def test_rebalance_backtest_runner_executes_interval_rebalances(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "100.0",
                "140.0",
                "100.0",
                "140.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704069000000",
                "140.0",
                "140.0",
                "70.0",
                "70.0",
                "100.0",
                "1704069899999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    runner = RebalanceBacktestRunner(loader, fee_rate=0.0, slippage_rate=0.0)
    result = runner.run(
        RebalanceBotConfig(
            target_btc_ratio=0.5,
            rebalance_threshold_pct=5.0,
            interval_minutes=15,
        ),
        initial_capital_usd=100.0,
        start=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 45, tzinfo=timezone.utc),
    )

    assert result.strategy == "rebalance"
    assert result.trades >= 2
    assert result.trade_log[0]["side"] == "buy"
    assert any(trade["side"] == "sell" for trade in result.trade_log)
    assert result.start_equity_usd == 100.0
    assert result.warnings == []


def test_rebalance_backtest_runner_warns_when_drift_never_triggers(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    runner = RebalanceBacktestRunner(loader, fee_rate=0.0, slippage_rate=0.0)
    result = runner.run(
        RebalanceBotConfig(
            target_btc_ratio=0.0,
            rebalance_threshold_pct=10.0,
            interval_minutes=15,
        ),
        initial_capital_usd=100.0,
        start=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )

    assert result.trades == 0
    assert result.warnings == [
        "Portfolio drift stayed within the configured threshold for the entire replay window."
    ]


def test_infinity_grid_backtest_runner_executes_breakout_and_profit_take_cycles(
    tmp_path: Path,
) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "110.0",
                "103.0",
                "108.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "108.0",
                "116.0",
                "108.0",
                "114.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    runner = InfinityGridBacktestRunner(loader, fee_rate=0.0, slippage_rate=0.0)
    result = runner.run(
        InfinityGridBotConfig(
            reference_price=100.0,
            spacing_pct=5.0,
            order_size_usd=20.0,
            levels_per_side=3,
        ),
        initial_capital_usd=120.0,
        start=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )

    assert result.strategy == "infinity-grid"
    assert result.trades >= 2
    assert any(trade["side"] == "buy" for trade in result.trade_log)
    assert any(trade["side"] == "sell" for trade in result.trade_log)
    assert result.stop_loss_triggered is False


def test_infinity_grid_backtest_runner_extends_sell_ladder_higher_on_breakout(tmp_path: Path) -> None:
    write_archive(
        tmp_path,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "125.0",
                "100.0",
                "124.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "124.0",
                "132.0",
                "123.0",
                "130.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )

    loader = BinanceHistoricalKlineLoader(data_dir=tmp_path)
    runner = InfinityGridBacktestRunner(loader, fee_rate=0.0, slippage_rate=0.0)
    result = runner.run(
        InfinityGridBotConfig(
            reference_price=100.0,
            spacing_pct=5.0,
            order_size_usd=20.0,
            levels_per_side=2,
        ),
        initial_capital_usd=120.0,
        start=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        end=datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )

    traded_levels = {trade["level"] for trade in result.trade_log if trade["side"] == "sell"}
    assert 115.76 in traded_levels
    assert any(level > 110.25 for level in traded_levels)
    assert result.stop_loss_triggered is False
