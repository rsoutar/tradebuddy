from __future__ import annotations

from dataclasses import asdict

from trading_bot.logging_config import configure_logging
from trading_bot.models import (
    BotStatus,
    GridBotConfig,
    InfinityGridBotConfig,
    RebalanceBotConfig,
    StrategyType,
)
from trading_bot.services.exchange import CcxtExchangeClient, MockExchangeClient
from trading_bot.services.market_data import MarketDataService
from trading_bot.services.risk import RiskManager
from trading_bot.settings import AppSettings, load_settings
from trading_bot.strategies.grid import GridStrategy
from trading_bot.strategies.infinity_grid import InfinityGridStrategy
from trading_bot.strategies.rebalance import RebalanceStrategy


class TradingBotApp:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings
        configure_logging(settings.runtime.log_level, settings.runtime.log_dir)
        settings.runtime.state_dir.mkdir(parents=True, exist_ok=True)
        self.exchange_client = self._create_exchange_client()
        self.market_data = MarketDataService(self.exchange_client)
        self.risk_manager = RiskManager()

    def _create_exchange_client(self):
        if self.settings.exchange.api_key and self.settings.exchange.api_secret:
            return CcxtExchangeClient(self.settings.exchange)
        return MockExchangeClient()

    def status(self) -> BotStatus:
        return BotStatus(
            environment=self.settings.runtime.environment,
            symbol=self.settings.runtime.symbol,
            exchange=self.exchange_client.exchange_name,
            ai_enabled=self.settings.ai.enabled,
            simulation_ready=True,
        )

    def demo_strategy(self, strategy_type: StrategyType) -> dict:
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        balances = self.exchange_client.fetch_balances()

        if strategy_type is StrategyType.GRID:
            strategy = GridStrategy(
                GridBotConfig(
                    lower_price=snapshot.price * 0.92,
                    upper_price=snapshot.price * 1.08,
                    grid_count=8,
                    spacing_pct=2.0,
                )
            )
        elif strategy_type is StrategyType.REBALANCE:
            strategy = RebalanceStrategy(
                RebalanceBotConfig(
                    target_btc_ratio=0.5,
                    rebalance_threshold_pct=5.0,
                    interval_minutes=60,
                )
            )
        else:
            strategy = InfinityGridStrategy(
                InfinityGridBotConfig(
                    lower_start_price=snapshot.price * 0.9,
                    spacing_pct=1.5,
                    profit_take_pct=1.2,
                    trailing_stop_pct=7.0,
                )
            )

        evaluation = strategy.evaluate(snapshot, balances)
        risk = self.risk_manager.review(balances, evaluation.orders)
        payload = asdict(evaluation)
        payload["risk"] = asdict(risk)
        payload["snapshot"] = asdict(snapshot)
        payload["balances"] = [asdict(balance) for balance in balances]
        return payload


def create_app() -> TradingBotApp:
    return TradingBotApp(load_settings())

