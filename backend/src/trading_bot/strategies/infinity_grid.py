from __future__ import annotations

from trading_bot.models import (
    InfinityGridBotConfig,
    MarketSnapshot,
    OrderIntent,
    OrderSide,
    OrderType,
    StrategyEvaluation,
    StrategyType,
)
from trading_bot.strategies.base import Strategy, free_balance


class InfinityGridStrategy(Strategy):
    def __init__(self, config: InfinityGridBotConfig) -> None:
        config.validate()
        self._config = config

    def evaluate(self, snapshot: MarketSnapshot, balances: list) -> StrategyEvaluation:
        anchor_price = max(snapshot.price, self._config.lower_start_price)
        spacing = self._config.spacing_pct / 100
        trailing_stop_price = anchor_price * (1 - (self._config.trailing_stop_pct / 100))
        usdt_free = free_balance(balances, "USDT")

        orders: list[OrderIntent] = []
        if usdt_free > 0:
            budget_per_grid = (usdt_free * 0.3) / self._config.max_active_grids
            for index in range(self._config.max_active_grids):
                buy_price = anchor_price * (1 + (spacing * index))
                amount = round(budget_per_grid / buy_price, 6)
                if amount > 0:
                    orders.append(
                        OrderIntent(
                            symbol=snapshot.symbol,
                            side=OrderSide.BUY,
                            order_type=OrderType.LIMIT,
                            price=round(buy_price, 2),
                            amount=amount,
                            rationale="Extend the grid upward as the market trends higher.",
                        )
                    )

        warnings: list[str] = []
        if snapshot.price < trailing_stop_price:
            warnings.append("Current price has crossed the modeled trailing stop level.")

        return StrategyEvaluation(
            strategy=StrategyType.INFINITY_GRID,
            summary=f"Prepared {len(orders)} upward-extending grid entries.",
            orders=orders,
            warnings=warnings,
            metrics={
                "anchor_price": round(anchor_price, 2),
                "trailing_stop_price": round(trailing_stop_price, 2),
            },
        )

