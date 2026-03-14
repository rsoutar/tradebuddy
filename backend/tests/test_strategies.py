from trading_bot.models import (
    Balance,
    GridBotConfig,
    InfinityGridBotConfig,
    MarketSnapshot,
    RebalanceBotConfig,
)
from trading_bot.strategies.grid import GridStrategy
from trading_bot.strategies.infinity_grid import InfinityGridStrategy
from trading_bot.strategies.rebalance import RebalanceStrategy


SNAPSHOT = MarketSnapshot(
    symbol="BTC/USDT",
    price=68000.0,
    change_24h_pct=1.1,
    volume_24h=1000000.0,
    volatility_24h_pct=2.5,
    trend="sideways",
)
BALANCES = [Balance(asset="BTC", free=0.15), Balance(asset="USDT", free=5000.0)]


def test_grid_strategy_generates_orders_on_both_sides():
    strategy = GridStrategy(
        GridBotConfig(
            lower_price=62000.0,
            upper_price=74000.0,
            grid_count=7,
            spacing_pct=2.0,
        )
    )

    evaluation = strategy.evaluate(SNAPSHOT, BALANCES)

    assert evaluation.orders
    assert any(order.side.value == "buy" for order in evaluation.orders)
    assert any(order.side.value == "sell" for order in evaluation.orders)


def test_rebalance_strategy_skips_when_portfolio_is_near_target():
    strategy = RebalanceStrategy(
        RebalanceBotConfig(
            target_btc_ratio=0.67,
            rebalance_threshold_pct=5.0,
            interval_minutes=60,
        )
    )

    evaluation = strategy.evaluate(SNAPSHOT, BALANCES)

    assert evaluation.orders == []
    assert "within the configured rebalance threshold" in evaluation.summary.lower()


def test_infinity_grid_strategy_prepares_upward_grid_entries():
    strategy = InfinityGridStrategy(
        InfinityGridBotConfig(
            lower_start_price=61000.0,
            spacing_pct=1.5,
            profit_take_pct=1.2,
            trailing_stop_pct=7.0,
        )
    )

    evaluation = strategy.evaluate(SNAPSHOT, BALANCES)

    assert len(evaluation.orders) == 6
    assert evaluation.metrics["anchor_price"] == SNAPSHOT.price

