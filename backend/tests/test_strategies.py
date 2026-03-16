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


def test_grid_config_uses_spacing_pct_to_build_levels():
    config = GridBotConfig(
        lower_price=100.0,
        upper_price=130.0,
        grid_count=5,
        spacing_pct=10.0,
    )

    assert config.price_levels() == [100.0, 110.0, 121.0, 130.0]


def test_grid_strategy_skips_stop_loss_warning_when_disabled():
    strategy = GridStrategy(
        GridBotConfig(
            lower_price=62000.0,
            upper_price=74000.0,
            grid_count=7,
            spacing_pct=2.0,
            stop_loss_enabled=False,
            stop_loss_pct=None,
        )
    )
    stressed_snapshot = MarketSnapshot(
        symbol="BTC/USDT",
        price=50000.0,
        change_24h_pct=-8.2,
        volume_24h=1000000.0,
        volatility_24h_pct=6.5,
        trend="bearish",
    )

    evaluation = strategy.evaluate(stressed_snapshot, BALANCES)

    assert "stop-loss threshold" not in " ".join(evaluation.warnings)


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
            reference_price=68000.0,
            spacing_pct=1.5,
            order_size_usd=100.0,
            levels_per_side=3,
        )
    )

    evaluation = strategy.evaluate(SNAPSHOT, BALANCES)

    assert len(evaluation.orders) == 6
    assert any(order.side.value == "buy" for order in evaluation.orders)
    assert any(order.side.value == "sell" for order in evaluation.orders)
    assert evaluation.metrics["reference_price"] == 68000.0
