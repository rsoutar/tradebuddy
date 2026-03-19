from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import log
from typing import Optional

from trading_bot.models import (
    HistoricalCandle,
    SupportResistanceResult,
    SupportResistanceZone,
)
from trading_bot.services.historical_data import BinanceHistoricalKlineLoader

logger = logging.getLogger(__name__)

DEFAULT_LOOKBACK_DAYS = 90
PIVOT_WINDOW = 10  # candles (2.5h on 15m)
CLUSTER_TOLERANCE_PCT = 0.5
MAX_ZONES = 8
NEAR_ZONE_PCT = 1.5  # price within 1.5% of zone center = "near"


@dataclass(frozen=True)
class _Pivot:
    price: float
    timestamp: datetime
    pivot_type: str  # 'high' | 'low'
    volume: float


@dataclass
class _RawZone:
    pivots: list[_Pivot]

    @property
    def min_price(self) -> float:
        return min(p.price for p in self.pivots)

    @property
    def max_price(self) -> float:
        return max(p.price for p in self.pivots)

    @property
    def center_price(self) -> float:
        return (self.min_price + self.max_price) / 2

    @property
    def touches(self) -> int:
        return len(self.pivots)

    @property
    def avg_volume(self) -> float:
        return sum(p.volume for p in self.pivots) / len(self.pivots)


def find_pivots(
    candles: list[HistoricalCandle],
    window: int = PIVOT_WINDOW,
) -> list[_Pivot]:
    if len(candles) < window * 2 + 1:
        return []

    pivots: list[_Pivot] = []
    for i in range(window, len(candles) - window):
        current = candles[i]

        # Check if current candle's high is the maximum in the window
        is_swing_high = all(
            candles[j].high <= current.high for j in range(i - window, i + window + 1) if j != i
        )
        if is_swing_high:
            pivots.append(
                _Pivot(
                    price=current.high,
                    timestamp=current.close_time,
                    pivot_type="high",
                    volume=current.quote_volume,
                )
            )

        # Check if current candle's low is the minimum in the window
        is_swing_low = all(
            candles[j].low >= current.low for j in range(i - window, i + window + 1) if j != i
        )
        if is_swing_low:
            pivots.append(
                _Pivot(
                    price=current.low,
                    timestamp=current.close_time,
                    pivot_type="low",
                    volume=current.quote_volume,
                )
            )

    return pivots


def cluster_pivots(
    pivots: list[_Pivot],
    tolerance_pct: float = CLUSTER_TOLERANCE_PCT,
) -> list[_RawZone]:
    if not pivots:
        return []

    sorted_pivots = sorted(pivots, key=lambda p: p.price)
    zones: list[_RawZone] = []
    current_zone_pivots: list[_Pivot] = [sorted_pivots[0]]

    for pivot in sorted_pivots[1:]:
        zone_center = sum(p.price for p in current_zone_pivots) / len(current_zone_pivots)
        if abs(pivot.price - zone_center) / zone_center * 100 <= tolerance_pct:
            current_zone_pivots.append(pivot)
        else:
            zones.append(_RawZone(pivots=current_zone_pivots))
            current_zone_pivots = [pivot]

    if current_zone_pivots:
        zones.append(_RawZone(pivots=current_zone_pivots))

    return zones


def score_zones(
    raw_zones: list[_RawZone],
    current_price: float,
    max_zones: int = MAX_ZONES,
) -> list[SupportResistanceZone]:
    if not raw_zones:
        return []

    max_time = max(p.timestamp for zone in raw_zones for p in zone.pivots)
    scored: list[tuple[float, _RawZone]] = []

    for zone in raw_zones:
        if zone.center_price <= 0 or zone.avg_volume <= 0:
            continue

        # Recency weight: more recent pivots get higher weight (0.5 to 1.0)
        time_weights = []
        for p in zone.pivots:
            days_ago = max((max_time - p.timestamp).total_seconds() / 86400, 0)
            time_weights.append(1.0 / (1.0 + days_ago / 30))
        recency_weight = sum(time_weights) / len(time_weights)

        # Strength = touches × log(volume) × recency
        strength = zone.touches * log(zone.avg_volume + 1) * recency_weight
        scored.append((strength, zone))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_scored = scored[:max_zones]

    # Normalize scores to 0-1
    if top_scored:
        max_score = top_scored[0][0]
        if max_score > 0:
            top_scored = [(s / max_score, z) for s, z in top_scored]

    result: list[SupportResistanceZone] = []
    for strength, zone in top_scored:
        zone_type = "support" if zone.center_price < current_price else "resistance"
        result.append(
            SupportResistanceZone(
                lower_price=zone.min_price,
                upper_price=zone.max_price,
                center_price=zone.center_price,
                touches=zone.touches,
                avg_volume=zone.avg_volume,
                strength=round(strength, 4),
                zone_type=zone_type,
            )
        )

    return result


def determine_price_position(
    current_price: float,
    zones: list[SupportResistanceZone],
    near_pct: float = NEAR_ZONE_PCT,
) -> tuple[Optional[SupportResistanceZone], Optional[SupportResistanceZone], str]:
    supports = [z for z in zones if z.zone_type == "support"]
    resistances = [z for z in zones if z.zone_type == "resistance"]

    # Sort: supports highest first (closest below price), resistances lowest first (closest above)
    supports.sort(key=lambda z: z.center_price, reverse=True)
    resistances.sort(key=lambda z: z.center_price)

    nearest_support = supports[0] if supports else None
    nearest_resistance = resistances[0] if resistances else None

    if nearest_support is None and nearest_resistance is None:
        return nearest_support, nearest_resistance, "mid_range"

    near_support = (
        nearest_support is not None
        and abs(current_price - nearest_support.center_price) / current_price * 100 <= near_pct
    )
    near_resistance = (
        nearest_resistance is not None
        and abs(current_price - nearest_resistance.center_price) / current_price * 100 <= near_pct
    )

    if near_support and near_resistance:
        # Both near — pick the closer one
        sup_dist = abs(current_price - nearest_support.center_price)
        res_dist = abs(current_price - nearest_resistance.center_price)
        if sup_dist <= res_dist:
            return nearest_support, nearest_resistance, "near_support"
        return nearest_support, nearest_resistance, "near_resistance"
    if near_support:
        return nearest_support, nearest_resistance, "near_support"
    if near_resistance:
        return nearest_support, nearest_resistance, "near_resistance"
    if nearest_support is not None and current_price < nearest_support.center_price:
        return nearest_support, nearest_resistance, "below_support"
    if nearest_resistance is not None and current_price > nearest_resistance.center_price:
        return nearest_support, nearest_resistance, "above_resistance"

    return nearest_support, nearest_resistance, "mid_range"


class SupportResistanceDetector:
    def __init__(self, historical_loader: BinanceHistoricalKlineLoader) -> None:
        self._loader = historical_loader

    def detect(
        self,
        current_price: float,
        lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    ) -> SupportResistanceResult:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=lookback_days)

        candles = self._loader.load_candles(start=start, end=now)
        logger.info("[S/R] Loaded %d candles for analysis", len(candles))

        if len(candles) < PIVOT_WINDOW * 2 + 1:
            logger.warning("[S/R] Not enough candles (%d), returning empty result", len(candles))
            return SupportResistanceResult(
                zones=[],
                nearest_support=None,
                nearest_resistance=None,
                price_position="mid_range",
                current_price=current_price,
            )

        pivots = find_pivots(candles, window=PIVOT_WINDOW)
        logger.info("[S/R] Found %d pivots", len(pivots))

        raw_zones = cluster_pivots(pivots, tolerance_pct=CLUSTER_TOLERANCE_PCT)
        logger.info("[S/R] Clustered into %d raw zones", len(raw_zones))

        zones = score_zones(raw_zones, current_price, max_zones=MAX_ZONES)
        logger.info("[S/R] Scored %d zones", len(zones))

        nearest_support, nearest_resistance, price_position = determine_price_position(
            current_price, zones
        )
        logger.info(
            "[S/R] Price position: %s (support=%.0f, resistance=%.0f)",
            price_position,
            nearest_support.center_price if nearest_support else 0,
            nearest_resistance.center_price if nearest_resistance else 0,
        )

        return SupportResistanceResult(
            zones=zones,
            nearest_support=nearest_support,
            nearest_resistance=nearest_resistance,
            price_position=price_position,
            current_price=current_price,
        )
