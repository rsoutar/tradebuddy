from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from trading_bot.app import create_app
from trading_bot.models import StrategyType
from trading_bot.settings import load_settings
from trading_bot.worker import BotWorkerRunner


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
