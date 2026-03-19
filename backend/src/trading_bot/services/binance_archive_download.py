from __future__ import annotations

import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path


BUCKET_LIST_URL = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
BUCKET_FILE_URL = "https://data.binance.vision"
S3_NAMESPACE = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


@dataclass(frozen=True)
class BucketObject:
    key: str
    size: int


def normalize_symbol(symbol: str) -> str:
    return symbol.replace("/", "").replace("-", "").strip().upper()


def default_prefix(symbol: str = "BTCUSDT", interval: str = "15m") -> str:
    normalized_symbol = normalize_symbol(symbol)
    return f"data/spot/monthly/klines/{normalized_symbol}/{interval}/"


def default_output_dir(base_dir: Path | str, symbol: str = "BTCUSDT", interval: str = "15m") -> Path:
    normalized_symbol = normalize_symbol(symbol)
    return Path(base_dir) / normalized_symbol / interval


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


def download_archives(
    *,
    prefix: str,
    output_dir: Path | str,
    overwrite: bool = False,
) -> tuple[int, int, Path]:
    resolved_output_dir = Path(output_dir)
    objects = iter_bucket_objects(prefix)
    if not objects:
        raise RuntimeError(f"No ZIP files found for prefix: {prefix}")

    downloaded = 0
    skipped = 0

    for item in objects:
        destination = local_path_for(resolved_output_dir, item.key)
        if (
            not overwrite
            and destination.exists()
            and destination.stat().st_size == item.size
        ):
            skipped += 1
            continue

        file_url = f"{BUCKET_FILE_URL}/{item.key}"
        download_file(file_url, destination)
        downloaded += 1

    return downloaded, skipped, resolved_output_dir
