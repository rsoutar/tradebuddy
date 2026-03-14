from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from trading_bot.app import create_app
from trading_bot.models import StrategyType


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
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    app = create_app()

    if args.command == "status":
        print(json.dumps(asdict(app.status()), indent=2))
        return

    if args.command == "demo-strategy":
        strategy = StrategyType(args.strategy)
        print(json.dumps(app.demo_strategy(strategy), indent=2))
        return

    parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()

