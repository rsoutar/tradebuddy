from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_CACHE_TTL_DAYS = 7.0


@dataclass
class GeneratedRecommendation:
    generated_at: str
    is_llm_generated: bool
    headline: Optional[str] = None
    rationale: Optional[str] = None
    recommended_strategy: Optional[str] = None
    market_snapshot: dict[str, Any] = field(default_factory=dict)
    grid_config: Optional[dict[str, Any]] = None
    rebalance_config: Optional[dict[str, Any]] = None
    infinity_config: Optional[dict[str, Any]] = None


@dataclass
class RecommendationCache:
    recommendation: GeneratedRecommendation
    version: int = 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(raw: str) -> datetime:
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def _cache_age_days(cache_path: Path) -> float:
    try:
        mtime = cache_path.stat().st_mtime
        age_seconds = time.time() - mtime
        return age_seconds / 86400.0
    except OSError:
        return float("inf")


class RecommendationCacheStore:
    def __init__(self, state_dir: Path, ttl_days: float = DEFAULT_CACHE_TTL_DAYS) -> None:
        self._path = state_dir / "recommendation_cache.json"
        self._lock_path = state_dir / "recommendation_cache.lock"
        self._ttl_days = ttl_days
        self._file_lock = threading.Lock()

    def _acquire_lock(self, timeout: float = 5.0) -> bool:
        start = time.monotonic()
        while True:
            try:
                with open(self._lock_path, "x") as f:
                    f.write(str(time.time()))
                return True
            except FileExistsError:
                if time.monotonic() - start >= timeout:
                    return False
                time.sleep(0.1)

    def _release_lock(self) -> None:
        try:
            self._lock_path.unlink(missing_ok=True)
        except OSError:
            pass

    def get(self) -> Optional[RecommendationCache]:
        try:
            with open(self._path) as f:
                data = json.load(f)
            cache = RecommendationCache(
                recommendation=GeneratedRecommendation(**data["recommendation"]),
                version=data.get("version", 1),
            )
            age = _cache_age_days(self._path)
            logger.info(
                "[RecCache] Loaded cache (age=%.1f days, ttl=%.1f days)",
                age,
                self._ttl_days,
            )
            return cache
        except (FileNotFoundError, json.JSONDecodeError, TypeError, KeyError):
            logger.info("[RecCache] No cache found or cache is invalid")
            return None

    def is_fresh(self) -> bool:
        try:
            age = _cache_age_days(self._path)
            return age < self._ttl_days
        except OSError:
            return False

    def save(self, cache: RecommendationCache) -> None:
        self._acquire_lock()
        try:
            payload = {
                "version": cache.version,
                "recommendation": asdict(cache.recommendation),
            }
            tmp = self._path.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(payload, f, indent=2)
            tmp.replace(self._path)
            logger.info(
                "[RecCache] Saved cache (llm=%s) to %s",
                cache.recommendation.is_llm_generated,
                self._path,
            )
        finally:
            self._release_lock()

    def invalidate(self) -> None:
        try:
            self._path.unlink(missing_ok=True)
            logger.info("[RecCache] Cache invalidated")
        except OSError:
            pass
