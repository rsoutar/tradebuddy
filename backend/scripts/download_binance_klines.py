#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from trading_bot.services.binance_archive_download import (
    default_output_dir,
    default_prefix,
    download_archives,
)


def parse_args() -> argparse.Namespace:
    default_symbol = "BTCUSDT"
    default_interval = "15m"
    default_dir = default_output_dir(".data/binance/spot/monthly/klines", default_symbol, default_interval)
    default_bucket_prefix = default_prefix(default_symbol, default_interval)

    parser = argparse.ArgumentParser(
        description="Download Binance kline ZIP archives from the public data bucket."
    )
    parser.add_argument("--symbol", default=default_symbol, help=f"Trading symbol. Default: {default_symbol}")
    parser.add_argument(
        "--interval",
        default=default_interval,
        help=f"Kline interval. Default: {default_interval}",
    )
    parser.add_argument(
        "--prefix",
        default=default_bucket_prefix,
        help=f"Bucket prefix to download. Default: {default_bucket_prefix}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_dir,
        help=f"Directory to store ZIP files. Default: {default_dir}",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Redownload files even when the local size already matches.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        downloaded, skipped, output_dir = download_archives(
            prefix=args.prefix,
            output_dir=args.output_dir,
            overwrite=args.overwrite,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"Downloading into {output_dir}")
    print(f"Done. Downloaded {downloaded} file(s), skipped {skipped} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
