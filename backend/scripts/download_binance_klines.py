#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path


BUCKET_LIST_URL = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
BUCKET_FILE_URL = "https://data.binance.vision"
DEFAULT_PREFIX = "data/spot/monthly/klines/BTCUSDT/15m/"
DEFAULT_OUTPUT_DIR = Path(".data/binance/spot/monthly/klines/BTCUSDT/15m")
S3_NAMESPACE = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


@dataclass(frozen=True)
class BucketObject:
    key: str
    size: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download Binance kline ZIP archives from the public data bucket."
    )
    parser.add_argument(
        "--prefix",
        default=DEFAULT_PREFIX,
        help=f"Bucket prefix to download. Default: {DEFAULT_PREFIX}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory to store ZIP files. Default: {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Redownload files even when the local size already matches.",
    )
    return parser.parse_args()


def build_list_url(prefix: str, continuation_token: str | None = None) -> str:
    params = {"list-type": "2", "prefix": prefix}
    if continuation_token:
        params["continuation-token"] = continuation_token
    return f"{BUCKET_LIST_URL}?{urllib.parse.urlencode(params)}"


def iter_bucket_objects(prefix: str) -> list[BucketObject]:
    objects: list[BucketObject] = []
    continuation_token: str | None = None

    while True:
        with urllib.request.urlopen(build_list_url(prefix, continuation_token)) as response:
            payload = response.read()

        root = ET.fromstring(payload)
        for contents in root.findall("s3:Contents", S3_NAMESPACE):
            key = contents.findtext("s3:Key", default="", namespaces=S3_NAMESPACE)
            size_text = contents.findtext("s3:Size", default="0", namespaces=S3_NAMESPACE)
            if key.endswith(".zip"):
                objects.append(BucketObject(key=key, size=int(size_text)))

        is_truncated = (
            root.findtext("s3:IsTruncated", default="false", namespaces=S3_NAMESPACE).lower()
            == "true"
        )
        if not is_truncated:
            break

        continuation_token = root.findtext(
            "s3:NextContinuationToken", default=None, namespaces=S3_NAMESPACE
        )
        if not continuation_token:
            break

    return objects


def local_path_for(output_dir: Path, key: str) -> Path:
    return output_dir / Path(key).name


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_suffix(destination.suffix + ".part")

    with urllib.request.urlopen(url) as response, temp_path.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    temp_path.replace(destination)


def main() -> int:
    args = parse_args()
    objects = iter_bucket_objects(args.prefix)
    if not objects:
        print(f"No ZIP files found for prefix: {args.prefix}", file=sys.stderr)
        return 1

    downloaded = 0
    skipped = 0

    print(f"Found {len(objects)} ZIP files under {args.prefix}")
    print(f"Downloading into {args.output_dir}")

    for index, item in enumerate(objects, start=1):
        destination = local_path_for(args.output_dir, item.key)
        if (
            not args.overwrite
            and destination.exists()
            and destination.stat().st_size == item.size
        ):
            skipped += 1
            print(f"[{index}/{len(objects)}] skip {destination.name}")
            continue

        file_url = f"{BUCKET_FILE_URL}/{item.key}"
        print(f"[{index}/{len(objects)}] download {destination.name}")
        download_file(file_url, destination)
        downloaded += 1

    print(f"Done. Downloaded {downloaded} file(s), skipped {skipped} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
