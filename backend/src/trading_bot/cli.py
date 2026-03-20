from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from trading_bot.app import create_app
from trading_bot.models import GridBotConfig, StrategyType
from trading_bot.services.binance_archive_download import (
    default_output_dir,
    default_prefix,
    download_archives,
)
from trading_bot.services.backtesting import GridBacktestRunner
from trading_bot.services.historical_data import BinanceHistoricalKlineLoader
from trading_bot.settings import load_settings
from trading_bot.worker import BotWorkerRunner


def _parse_datetime(raw: str | None) -> datetime | None:
    if raw is None:
        return None
    value = datetime.fromisoformat(raw)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bitcoin trading bot phase 1 scaffold")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status", help="Show runtime status")

    demo_parser = subparsers.add_parser("demo-strategy", help="Evaluate a strategy prototype")
    demo_parser.add_argument(
        "strategy",
        choices=[strategy.value for strategy in StrategyType],
        help="Strategy prototype to evaluate",
    )

    history_parser = subparsers.add_parser(
        "history-summary",
        help="Inspect downloaded Binance historical kline archives",
    )
    history_parser.add_argument("--symbol", default="BTCUSDT", help="Trading symbol, e.g. BTCUSDT")
    history_parser.add_argument("--interval", default="15m", help="Kline interval, e.g. 15m")
    history_parser.add_argument(
        "--data-dir",
        help="Base directory containing Binance monthly kline archives",
    )
    history_parser.add_argument(
        "--start",
        help="Optional inclusive UTC start datetime, e.g. 2024-01-01 or 2024-01-01T00:00:00+00:00",
    )
    history_parser.add_argument(
        "--end",
        help="Optional exclusive UTC end datetime, e.g. 2024-02-01 or 2024-02-01T00:00:00+00:00",
    )

    download_parser = subparsers.add_parser(
        "download-history",
        help="Download Binance monthly kline archives into the configured history directory",
    )
    download_parser.add_argument("--symbol", default="BTCUSDT", help="Trading symbol, e.g. BTCUSDT")
    download_parser.add_argument("--interval", default="15m", help="Kline interval, e.g. 15m")
    download_parser.add_argument(
        "--prefix",
        help="Optional Binance bucket prefix override",
    )
    download_parser.add_argument(
        "--output-dir",
        help="Optional output directory override",
    )
    download_parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Redownload files even when the local size already matches.",
    )

    backtest_parser = subparsers.add_parser(
        "run-backtest",
        help="Run a historical backtest from downloaded Binance kline archives",
    )
    backtest_parser.add_argument(
        "strategy",
        choices=[strategy.value for strategy in StrategyType],
        help="Strategy to backtest",
    )
    backtest_parser.add_argument("--start", help="Optional inclusive UTC start datetime")
    backtest_parser.add_argument("--end", help="Optional exclusive UTC end datetime")
    backtest_parser.add_argument("--capital-usd", type=float, default=100.0, help="Initial capital")
    backtest_parser.add_argument("--symbol", default="BTCUSDT", help="Trading symbol, e.g. BTCUSDT")
    backtest_parser.add_argument("--interval", default="15m", help="Kline interval, e.g. 15m")
    backtest_parser.add_argument("--data-dir", help="Base directory containing Binance kline archives")
    backtest_parser.add_argument("--lower-price", type=float, help="Grid lower price bound")
    backtest_parser.add_argument("--upper-price", type=float, help="Grid upper price bound")
    backtest_parser.add_argument("--grid-count", type=int, help="Grid level count")
    backtest_parser.add_argument("--spacing-pct", type=float, help="Grid spacing percentage")
    backtest_parser.add_argument(
        "--stop-loss-enabled",
        action="store_true",
        help="Enable stop-loss handling for the backtest",
    )
    backtest_parser.add_argument("--stop-loss-pct", type=float, help="Stop-loss percentage")
    backtest_parser.add_argument("--fee-rate", type=float, help="Trading fee rate, e.g. 0.001")
    backtest_parser.add_argument(
        "--slippage-rate",
        type=float,
        help="Execution slippage rate, e.g. 0.0005",
    )

    api_parser = subparsers.add_parser("serve-api", help="Run the dashboard API server")
    api_parser.add_argument("--host", help="Host interface to bind")
    api_parser.add_argument("--port", type=int, help="Port to bind")
    api_parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for local development",
    )

    worker_parser = subparsers.add_parser("run-bot", help="Run a single bot worker process")
    worker_parser.add_argument("--bot-id", required=True, help="Persisted bot instance id")
    return parser


def main() -> None:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=True)

    parser = build_parser()
    args = parser.parse_args()

    if args.command == "status":
        app = create_app()
        print(json.dumps(asdict(app.status()), indent=2))
        return

    if args.command == "demo-strategy":
        app = create_app()
        strategy = StrategyType(args.strategy)
        print(json.dumps(app.demo_strategy(strategy), indent=2))
        return

    if args.command == "history-summary":
        loader = BinanceHistoricalKlineLoader(
            data_dir=args.data_dir,
            symbol=args.symbol,
            interval=args.interval,
        )
        print(
            json.dumps(
                loader.summarize(
                    start=_parse_datetime(args.start),
                    end=_parse_datetime(args.end),
                ),
                indent=2,
            )
        )
        return

    if args.command == "download-history":
        settings = load_settings()
        prefix = args.prefix or default_prefix(symbol=args.symbol, interval=args.interval)
        output_dir = (
            Path(args.output_dir)
            if args.output_dir
            else default_output_dir(
                settings.runtime.history_dir,
                symbol=args.symbol,
                interval=args.interval,
            )
        )
        downloaded, skipped, resolved_output_dir = download_archives(
            prefix=prefix,
            output_dir=output_dir,
            overwrite=args.overwrite,
        )
        print(
            json.dumps(
                {
                    "prefix": prefix,
                    "outputDir": str(resolved_output_dir),
                    "downloaded": downloaded,
                    "skipped": skipped,
                },
                indent=2,
            )
        )
        return

    if args.command == "run-backtest":
        strategy = StrategyType(args.strategy)
        if strategy is not StrategyType.GRID:
            raise RuntimeError("Only the grid strategy has a real historical backtest runner so far.")

        loader = BinanceHistoricalKlineLoader(
            data_dir=args.data_dir,
            symbol=args.symbol,
            interval=args.interval,
        )
        runner = GridBacktestRunner(
            loader,
            fee_rate=args.fee_rate if args.fee_rate is not None else 0.001,
            slippage_rate=args.slippage_rate if args.slippage_rate is not None else 0.0005,
        )
        start = _parse_datetime(args.start)
        end = _parse_datetime(args.end)
        if start is None or end is None:
            start, end = runner.default_window()
        first_candle = loader.load_candles(start=start, end=end)[0]
        config = GridBotConfig(
            lower_price=args.lower_price if args.lower_price is not None else first_candle.open * 0.92,
            upper_price=args.upper_price if args.upper_price is not None else first_candle.open * 1.08,
            grid_count=args.grid_count if args.grid_count is not None else 8,
            spacing_pct=args.spacing_pct if args.spacing_pct is not None else 2.0,
            stop_loss_enabled=args.stop_loss_enabled,
            stop_loss_pct=args.stop_loss_pct,
        )
        result = runner.run(
            config,
            initial_capital_usd=args.capital_usd,
            start=start,
            end=end,
        )
        print(json.dumps(result.to_summary(), indent=2))
        return

    if args.command == "serve-api":
        settings = load_settings()
        try:
            import uvicorn
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Install fastapi/uvicorn dependencies to run the API server.") from exc

        uvicorn.run(
            "trading_bot.api:app",
            host=args.host or settings.api.host,
            port=args.port or settings.api.port,
            reload=args.reload,
        )
        return

    if args.command == "run-bot":
        runner = BotWorkerRunner(args.bot_id)
        runner.run()
        return

    parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
