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
DEFAULT_CACHE_VERSION = 2


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
    version: int = DEFAULT_CACHE_VERSION


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
        logger.info("[RecCache] Initialized with path=%s, ttl=%.1f days", self._path, ttl_days)

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
            version = data.get("version", 1)
            # Invalidate old cache versions to force regeneration with new schema
            if version < DEFAULT_CACHE_VERSION:
                logger.info(
                    "[RecCache] Cache version %d is outdated (current: %d), invalidating",
                    version,
                    DEFAULT_CACHE_VERSION,
                )
                self.invalidate()
                return None
            cache = RecommendationCache(
                recommendation=GeneratedRecommendation(**data["recommendation"]),
                version=version,
            )
            age = _cache_age_days(self._path)
            logger.info(
                "[RecCache] Loaded cache (age=%.1f days, ttl=%.1f days)",
                age,
                self._ttl_days,
            )
            return cache
        except FileNotFoundError:
            logger.debug("[RecCache] Cache file not found at %s", self._path)
            return None
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            logger.warning("[RecCache] Cache file is corrupted at %s: %s", self._path, e)
            return None
        except OSError as e:
            logger.error("[RecCache] OS error reading cache at %s: %s", self._path, e)
            return None

    def is_fresh(self) -> bool:
        try:
            age = _cache_age_days(self._path)
            return age < self._ttl_days
        except OSError:
            return False

    def save(self, cache: RecommendationCache) -> None:
        if not self._acquire_lock():
            logger.warning("[RecCache] Could not acquire lock, skipping cache save")
            return
        try:
            # Ensure parent directory exists
            self._path.parent.mkdir(parents=True, exist_ok=True)
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
        except OSError as e:
            logger.error("[RecCache] Failed to save cache to %s: %s", self._path, e)
        finally:
            self._release_lock()

    def invalidate(self) -> None:
        try:
            self._path.unlink(missing_ok=True)
            logger.info("[RecCache] Cache invalidated")
        except OSError:
            pass

    def get_diagnostics(self) -> dict[str, Any]:
        """Get diagnostic information about the cache store."""
        diagnostics = {
            "cache_path": str(self._path),
            "cache_path_exists": self._path.exists(),
            "state_dir_exists": self._path.parent.exists(),
            "state_dir_writable": False,
            "cache_file_size": None,
            "cache_age_days": None,
            "cache_version": None,
        }
        
        # Check if state directory is writable
        try:
            test_file = self._path.parent / ".write_test"
            test_file.touch()
            test_file.unlink()
            diagnostics["state_dir_writable"] = True
        except OSError:
            pass
        
        # Get cache file info if it exists
        if self._path.exists():
            try:
                diagnostics["cache_file_size"] = self._path.stat().st_size
                diagnostics["cache_age_days"] = _cache_age_days(self._path)
                with open(self._path) as f:
                    data = json.load(f)
                diagnostics["cache_version"] = data.get("version", 1)
            except (OSError, json.JSONDecodeError) as e:
                diagnostics["cache_read_error"] = str(e)
        
        return diagnostics
