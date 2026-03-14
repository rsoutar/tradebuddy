from __future__ import annotations

from trading_bot.models import (
    MarketSnapshot,
    OrderIntent,
    OrderSide,
    OrderType,
    RebalanceBotConfig,
    StrategyEvaluation,
    StrategyType,
)
from trading_bot.strategies.base import Strategy, free_balance


class RebalanceStrategy(Strategy):
    def __init__(self, config: RebalanceBotConfig) -> None:
        config.validate()
        self._config = config

    def evaluate(self, snapshot: MarketSnapshot, balances: list) -> StrategyEvaluation:
        btc_free = free_balance(balances, "BTC")
        usdt_free = free_balance(balances, "USDT")
        btc_value = btc_free * snapshot.price
        portfolio_value = btc_value + usdt_free

        if portfolio_value <= 0:
            return StrategyEvaluation(
                strategy=StrategyType.REBALANCE,
                summary="Portfolio value is zero, no rebalance action planned.",
                warnings=["Unable to compute a rebalance without balances."],
            )

        current_ratio = btc_value / portfolio_value
        threshold = self._config.rebalance_threshold_pct / 100
        drift = self._config.target_btc_ratio - current_ratio

        if abs(drift) < threshold:
            return StrategyEvaluation(
                strategy=StrategyType.REBALANCE,
                summary="Portfolio is within the configured rebalance threshold.",
                metrics={"current_ratio": current_ratio, "drift": drift},
            )

        target_btc_value = portfolio_value * self._config.target_btc_ratio
        adjustment_value = target_btc_value - btc_value
        side = OrderSide.BUY if adjustment_value > 0 else OrderSide.SELL
        amount = round(abs(adjustment_value) / snapshot.price, 6)
        price = round(snapshot.price * (0.999 if side is OrderSide.BUY else 1.001), 2)

        return StrategyEvaluation(
            strategy=StrategyType.REBALANCE,
            summary="Generated a rebalance adjustment order.",
            orders=[
                OrderIntent(
                    symbol=snapshot.symbol,
                    side=side,
                    order_type=OrderType.LIMIT,
                    amount=amount,
                    price=price,
                    rationale="Move allocation back toward the configured BTC target ratio.",
                )
            ],
            metrics={"current_ratio": current_ratio, "drift": drift},
        )

