from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class StrategyType(str, Enum):
    GRID = "grid"
    REBALANCE = "rebalance"
    INFINITY_GRID = "infinity-grid"


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    LIMIT = "limit"
    MARKET = "market"


@dataclass(frozen=True)
class Balance:
    asset: str
    free: float
    locked: float = 0.0


@dataclass(frozen=True)
class MarketSnapshot:
    symbol: str
    price: float
    change_24h_pct: float
    volume_24h: float
    volatility_24h_pct: float
    trend: str


@dataclass(frozen=True)
class HistoricalCandle:
    symbol: str
    interval: str
    open_time: datetime
    close_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float
    trade_count: int
    taker_buy_base_volume: float
    taker_buy_quote_volume: float


@dataclass(frozen=True)
class OrderIntent:
    symbol: str
    side: OrderSide
    order_type: OrderType
    amount: float
    price: Optional[float] = None
    rationale: str = ""


@dataclass(frozen=True)
class BotStatus:
    environment: str
    symbol: str
    exchange: str
    ai_enabled: bool
    simulation_ready: bool


@dataclass(frozen=True)
class GridBotConfig:
    lower_price: float
    upper_price: float
    grid_count: int
    spacing_pct: float
    stop_at_upper_enabled: bool = False
    stop_loss_enabled: bool = False
    stop_loss_pct: Optional[float] = None

    def price_levels(self) -> list[float]:
        factor = 1 + (self.spacing_pct / 100)
        levels = [round(self.lower_price, 2)]
        current_level = self.lower_price

        for _ in range(1, self.grid_count):
            next_level = current_level * factor
            if next_level >= self.upper_price:
                rounded_upper = round(self.upper_price, 2)
                if rounded_upper > levels[-1]:
                    levels.append(rounded_upper)
                break

            rounded_level = round(next_level, 2)
            if rounded_level <= levels[-1]:
                break

            levels.append(rounded_level)
            current_level = next_level

        return levels

    def validate(self) -> None:
        if self.lower_price <= 0 or self.upper_price <= 0:
            raise ValueError("Grid prices must be positive.")
        if self.upper_price <= self.lower_price:
            raise ValueError("Grid upper price must be greater than lower price.")
        if self.grid_count < 2:
            raise ValueError("Grid bot requires at least 2 grid levels.")
        if self.spacing_pct <= 0:
            raise ValueError("Grid spacing must be greater than 0.")
        if len(self.price_levels()) < 2:
            raise ValueError("Grid configuration must produce at least 2 price levels within range.")
        if self.stop_loss_enabled:
            if self.stop_loss_pct is None or self.stop_loss_pct <= 0:
                raise ValueError("Stop-loss percentage must be greater than 0 when enabled.")


@dataclass(frozen=True)
class RebalanceBotConfig:
    target_btc_ratio: float
    rebalance_threshold_pct: float
    interval_minutes: int

    def validate(self) -> None:
        if not 0 <= self.target_btc_ratio <= 1:
            raise ValueError("Target BTC ratio must be between 0 and 1.")
        if self.rebalance_threshold_pct <= 0:
            raise ValueError("Rebalance threshold must be greater than 0.")
        if self.interval_minutes <= 0:
            raise ValueError("Rebalance interval must be greater than 0.")


@dataclass(frozen=True)
class InfinityGridBotConfig:
    lower_start_price: float
    spacing_pct: float
    profit_take_pct: float
    trailing_stop_pct: float
    max_active_grids: int = 6

    def validate(self) -> None:
        if self.lower_start_price <= 0:
            raise ValueError("Infinity grid lower starting price must be positive.")
        if self.spacing_pct <= 0:
            raise ValueError("Infinity grid spacing must be greater than 0.")
        if self.profit_take_pct <= 0:
            raise ValueError("Profit take percentage must be greater than 0.")
        if self.trailing_stop_pct <= 0:
            raise ValueError("Trailing stop percentage must be greater than 0.")
        if self.max_active_grids < 2:
            raise ValueError("Infinity grid requires at least 2 active grids.")


@dataclass
class StrategyEvaluation:
    strategy: StrategyType
    summary: str
    orders: list[OrderIntent] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
