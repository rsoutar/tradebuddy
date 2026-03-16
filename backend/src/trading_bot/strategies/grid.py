from __future__ import annotations

from trading_bot.models import (
    GridBotConfig,
    MarketSnapshot,
    OrderIntent,
    OrderSide,
    OrderType,
    StrategyEvaluation,
    StrategyType,
)
from trading_bot.strategies.base import Strategy, free_balance


class GridStrategy(Strategy):
    def __init__(self, config: GridBotConfig) -> None:
        config.validate()
        self._config = config

    def evaluate(self, snapshot: MarketSnapshot, balances: list) -> StrategyEvaluation:
        levels = self._config.price_levels()
        lower = self._config.lower_price
        upper = self._config.upper_price
        current_price = snapshot.price
        btc_free = free_balance(balances, "BTC")
        usdt_free = free_balance(balances, "USDT")
        buy_levels = [level for level in levels if level < current_price]
        sell_levels = [level for level in levels if level > current_price]

        orders: list[OrderIntent] = []
        if buy_levels and usdt_free > 0:
            buy_budget_per_level = (usdt_free * 0.45) / len(buy_levels)
            for level in buy_levels:
                amount = round(buy_budget_per_level / level, 6)
                if amount > 0:
                    orders.append(
                        OrderIntent(
                            symbol=snapshot.symbol,
                            side=OrderSide.BUY,
                            order_type=OrderType.LIMIT,
                            price=round(level, 2),
                            amount=amount,
                            rationale="Accumulate BTC on lower grid level.",
                        )
                    )

        if sell_levels and btc_free > 0:
            sell_amount_per_level = (btc_free * 0.45) / len(sell_levels)
            for level in sell_levels:
                amount = round(sell_amount_per_level, 6)
                if amount > 0:
                    orders.append(
                        OrderIntent(
                            symbol=snapshot.symbol,
                            side=OrderSide.SELL,
                            order_type=OrderType.LIMIT,
                            price=round(level, 2),
                            amount=amount,
                            rationale="Take profit on upper grid level.",
                        )
                    )

        warnings: list[str] = []
        if (
            self._config.stop_loss_enabled
            and self._config.stop_loss_pct is not None
            and current_price < lower * (1 - self._config.stop_loss_pct / 100)
        ):
            warnings.append("Price is beyond the configured stop-loss threshold.")
        if current_price > upper:
            warnings.append("Price is above the configured grid range; orders may need to be rebuilt.")

        return StrategyEvaluation(
            strategy=StrategyType.GRID,
            summary=f"Generated {len(orders)} grid orders across {len(levels)} levels.",
            orders=orders,
            warnings=warnings,
            metrics={
                "grid_spacing_pct": self._config.spacing_pct,
                "top_level": levels[-1],
                "price": current_price,
            },
        )
