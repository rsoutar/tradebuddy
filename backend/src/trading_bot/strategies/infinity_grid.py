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
        current_price = snapshot.price
        usdt_free = free_balance(balances, "USDT")
        btc_free = free_balance(balances, "BTC")
        portfolio_value = usdt_free + (btc_free * current_price)
        modeled_btc_free = btc_free
        modeled_usdt_free = usdt_free
        warnings: list[str] = []

        if btc_free <= 0 and portfolio_value > 0:
            working_capital = min(
                portfolio_value * 0.9,
                self._config.order_size_usd * self._config.levels_per_side * 2,
            )
            modeled_usdt_free = working_capital / 2
            modeled_btc_free = (working_capital / 2) / current_price
            warnings.append(
                "No BTC balance was available, so the preview seeded a 50/50 BTC-USDT ladder inventory."
            )

        orders: list[OrderIntent] = []
        remaining_usdt = modeled_usdt_free
        for level in self._config.buy_levels(current_price):
            if remaining_usdt <= 0:
                break
            notional = min(self._config.order_size_usd, remaining_usdt)
            amount = round(notional / level, 6)
            if amount <= 0:
                continue
            orders.append(
                OrderIntent(
                    symbol=snapshot.symbol,
                    side=OrderSide.BUY,
                    order_type=OrderType.LIMIT,
                    price=level,
                    amount=amount,
                    rationale="Buy the next lower infinity grid level and re-arm the matching sell above.",
                )
            )
            remaining_usdt -= amount * level

        remaining_btc = modeled_btc_free
        for level in self._config.sell_levels(current_price):
            if remaining_btc <= 0:
                break
            target_amount = round(self._config.order_size_usd / level, 6)
            amount = round(min(target_amount, remaining_btc), 6)
            if amount <= 0:
                continue
            orders.append(
                OrderIntent(
                    symbol=snapshot.symbol,
                    side=OrderSide.SELL,
                    order_type=OrderType.LIMIT,
                    price=level,
                    amount=amount,
                    rationale="Sell the next upper infinity grid level and re-arm the matching buy below.",
                )
            )
            remaining_btc -= amount

        if remaining_usdt < self._config.order_size_usd:
            warnings.append("USDT inventory only covers part of the configured buy ladder.")
        if remaining_btc * current_price < self._config.order_size_usd:
            warnings.append("BTC inventory only covers part of the configured sell ladder.")

        return StrategyEvaluation(
            strategy=StrategyType.INFINITY_GRID,
            summary=f"Prepared {len(orders)} two-sided geometric grid orders.",
            orders=orders,
            warnings=warnings,
            metrics={
                "reference_price": round(self._config.reference_price, 2),
                "order_size_usd": round(self._config.order_size_usd, 2),
                "levels_per_side": float(self._config.levels_per_side),
            },
        )
