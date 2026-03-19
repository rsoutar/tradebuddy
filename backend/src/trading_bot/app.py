from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional, Union

from trading_bot.logging_config import configure_logging
from trading_bot.models import (
    BotStatus,
    Balance,
    GridBotConfig,
    InfinityGridBotConfig,
    MarketSnapshot,
    OrderIntent,
    RebalanceBotConfig,
    StrategyType,
)
from trading_bot.paper_store import PaperTradingStore
from trading_bot.runtime import BotProcessManager
from trading_bot.services.backtesting import (
    GridBacktestRunner,
    InfinityGridBacktestRunner,
    RebalanceBacktestRunner,
)
from trading_bot.services.exchange import CcxtExchangeClient, MockExchangeClient
from trading_bot.services.historical_data import BinanceHistoricalKlineLoader
from trading_bot.services.binance_ws import BinanceSpotWebSocketMarketData
from trading_bot.services.market_data import (
    MarketDataService,
    SharedSnapshotFileMarketData,
    read_shared_price_window,
)
from trading_bot.services.risk import RiskManager
from trading_bot.settings import AppSettings, load_settings
from trading_bot.strategies.grid import GridStrategy
from trading_bot.strategies.infinity_grid import InfinityGridStrategy
from trading_bot.strategies.rebalance import RebalanceStrategy

MIN_EFFECTIVE_ORDER_USD = 10.0


class TradingBotApp:
    def __init__(
        self,
        settings: AppSettings,
        *,
        enable_market_stream: bool = True,
        worker_autostart: bool = True,
        historical_loader: Optional[BinanceHistoricalKlineLoader] = None,
    ) -> None:
        self.settings = settings
        self._enable_market_stream = enable_market_stream
        configure_logging(settings.runtime.log_level, settings.runtime.log_dir)
        settings.runtime.state_dir.mkdir(parents=True, exist_ok=True)
        self.exchange_client = self._create_exchange_client()
        self.market_data = MarketDataService(
            self.exchange_client,
            market_stream=self._create_market_stream(),
        )
        self.paper_store = PaperTradingStore(settings.runtime.state_dir / "paper_trading.sqlite3")
        self.risk_manager = RiskManager()
        self.historical_loader = historical_loader or BinanceHistoricalKlineLoader(
            data_dir=settings.runtime.history_dir
        )
        self.grid_backtest_runner = GridBacktestRunner(self.historical_loader)
        self.rebalance_backtest_runner = RebalanceBacktestRunner(self.historical_loader)
        self.infinity_grid_backtest_runner = InfinityGridBacktestRunner(self.historical_loader)
        self.process_manager = BotProcessManager(
            settings,
            self.paper_store,
            enabled=worker_autostart,
        )

    def _create_exchange_client(self):
        if self.settings.exchange.api_key and self.settings.exchange.api_secret:
            return CcxtExchangeClient(self.settings.exchange)
        return MockExchangeClient()

    def _shared_snapshot_path(self) -> Path:
        return self.settings.runtime.state_dir / "market_snapshot.json"

    def _market_connection_summary(self) -> dict[str, Any]:
        stream = getattr(self.market_data, "_market_stream", None)
        if isinstance(stream, BinanceSpotWebSocketMarketData):
            return stream.connection_status()

        return {
            "transport": "wss" if self.settings.market_data.websocket_enabled else "rest",
            "healthy": stream is not None,
            "connected_streams": 0,
            "configured_streams": 1 if self.settings.market_data.websocket_enabled else 0,
            "source": "snapshot-file-fallback" if stream is not None else "exchange-rest",
            "lastError": None,
        }

    def _create_market_stream(self):
        if not self._enable_market_stream:
            return SharedSnapshotFileMarketData(self._shared_snapshot_path())
        if (
            self.settings.exchange.exchange_id == "binance"
            and self.settings.exchange.market_type == "spot"
            and self.settings.market_data.websocket_enabled
        ):
            return BinanceSpotWebSocketMarketData(
                symbol=self.settings.runtime.symbol,
                websocket_url=self.settings.market_data.websocket_url,
                initial_timeout_seconds=self.settings.market_data.websocket_timeout_seconds,
                snapshot_path=self._shared_snapshot_path(),
            )
        return SharedSnapshotFileMarketData(self._shared_snapshot_path())

    def status(self) -> BotStatus:
        return BotStatus(
            environment=self.settings.runtime.environment,
            symbol=self.settings.runtime.symbol,
            exchange=self.settings.exchange.exchange_id,
            ai_enabled=self.settings.ai.enabled,
            simulation_ready=True,
        )

    def _utcnow(self) -> datetime:
        return datetime.now(timezone.utc)

    def _timestamp(self) -> str:
        return self._utcnow().isoformat()

    def _normalize_datetime(self, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _reconcile_user_bots(self, user_id: str) -> None:
        for bot in self.paper_store.list_bot_instances(user_id=user_id):
            self.process_manager.reconcile_bot(bot["id"])

    def _strategy_label(self, strategy_type: StrategyType) -> str:
        return {
            StrategyType.GRID: "Grid Bot",
            StrategyType.REBALANCE: "Rebalance Bot",
            StrategyType.INFINITY_GRID: "Infinity Grid",
        }[strategy_type]

    def _strategy_mode(self, strategy_type: StrategyType) -> str:
        return {
            StrategyType.GRID: "Sideways",
            StrategyType.REBALANCE: "Steady",
            StrategyType.INFINITY_GRID: "Trend",
        }[strategy_type]

    def _resolve_strategy_config(
        self,
        strategy_type: StrategyType,
        snapshot: MarketSnapshot,
        config_override: Optional[Any] = None,
    ) -> Union[GridBotConfig, RebalanceBotConfig, InfinityGridBotConfig]:
        if strategy_type is StrategyType.GRID:
            if isinstance(config_override, GridBotConfig):
                return config_override
            return GridBotConfig(
                lower_price=snapshot.price * 0.92,
                upper_price=snapshot.price * 1.08,
                grid_count=8,
                spacing_pct=2.0,
                stop_loss_enabled=False,
            )

        if strategy_type is StrategyType.REBALANCE:
            if isinstance(config_override, RebalanceBotConfig):
                return config_override
            return RebalanceBotConfig(
                target_btc_ratio=0.5,
                rebalance_threshold_pct=5.0,
                interval_minutes=60,
            )

        if isinstance(config_override, InfinityGridBotConfig):
            return config_override
        return InfinityGridBotConfig(
            reference_price=snapshot.price,
            spacing_pct=1.5,
            order_size_usd=100.0,
            levels_per_side=6,
        )

    def _build_strategy(
        self,
        strategy_type: StrategyType,
        snapshot: MarketSnapshot,
        config_override: Optional[Any] = None,
    ):
        strategy_config = self._resolve_strategy_config(strategy_type, snapshot, config_override)
        if strategy_type is StrategyType.GRID:
            return GridStrategy(strategy_config)

        if strategy_type is StrategyType.REBALANCE:
            return RebalanceStrategy(strategy_config)

        return InfinityGridStrategy(strategy_config)

    def _evaluate_strategy(
        self,
        strategy_type: StrategyType,
        snapshot: MarketSnapshot,
        balances: list[Balance],
        config_override: Optional[Any] = None,
    ) -> dict[str, Any]:
        strategy_config = self._resolve_strategy_config(strategy_type, snapshot, config_override)
        strategy = self._build_strategy(strategy_type, snapshot, strategy_config)
        evaluation = strategy.evaluate(snapshot, balances)
        risk = self.risk_manager.review(balances, evaluation.orders)
        notional = sum(
            (order.price or snapshot.price) * order.amount for order in evaluation.orders
        )
        return {
            "strategy": strategy_type,
            "config": strategy_config,
            "evaluation": evaluation,
            "risk": risk,
            "notional": notional,
        }

    def _minimum_budget_required(
        self,
        strategy_type: StrategyType,
        snapshot: MarketSnapshot,
        config: Union[GridBotConfig, RebalanceBotConfig, InfinityGridBotConfig],
    ) -> tuple[float, Optional[str]]:
        if strategy_type is StrategyType.GRID:
            if not isinstance(config, GridBotConfig):
                raise ValueError("Grid budget validation requires a grid configuration.")
            buy_levels = [level for level in config.price_levels() if level < snapshot.price]
            if not buy_levels:
                return (
                    0.0,
                    "Grid range needs at least one buy level below the live price to deploy budget.",
                )
            required_budget = (len(buy_levels) * MIN_EFFECTIVE_ORDER_USD) / 0.45
            return round(required_budget, 2), None

        if strategy_type is StrategyType.REBALANCE:
            if not isinstance(config, RebalanceBotConfig):
                raise ValueError("Rebalance budget validation requires a rebalance configuration.")
            active_legs = int(config.target_btc_ratio > 0) + int(config.target_btc_ratio < 1)
            required_budget = max(MIN_EFFECTIVE_ORDER_USD, active_legs * MIN_EFFECTIVE_ORDER_USD)
            return round(required_budget, 2), None

        if not isinstance(config, InfinityGridBotConfig):
            raise ValueError(
                "Infinity grid budget validation requires an infinity grid configuration."
            )
        required_budget = config.order_size_usd * config.levels_per_side * 2
        return round(required_budget, 2), None

    def _config_summary(
        self,
        strategy_type: StrategyType,
        config: dict[str, Any],
        snapshot: MarketSnapshot,
    ) -> str:
        if strategy_type is StrategyType.GRID:
            level_count = int(config.get("grid_count", 0))
            grid_config = self._grid_config_from_payload(config)
            if grid_config is not None:
                level_count = len(grid_config.price_levels())
            stop_loss_summary = (
                f" • stop loss {config['stop_loss_pct']:.1f}%"
                if config.get("stop_loss_enabled") and config.get("stop_loss_pct") is not None
                else " • stop loss off"
            )
            upper_stop_summary = (
                " • stop at upper on"
                if config.get("stop_at_upper_enabled")
                else " • stop at upper off"
            )
            return (
                f"Range ${config['lower_price']:,.0f} to ${config['upper_price']:,.0f} "
                f"across {level_count} levels{stop_loss_summary}{upper_stop_summary}"
            )

        if strategy_type is StrategyType.REBALANCE:
            return (
                f"Target BTC {config['target_btc_ratio'] * 100:.0f}% with "
                f"{config['rebalance_threshold_pct']:.1f}% drift threshold"
            )

        return (
            f"Reference ${config.get('reference_price', config.get('lower_start_price', snapshot.price)):,.0f} • "
            f"{int(config.get('levels_per_side', config.get('max_active_grids', 6)))} levels per side • "
            f"${float(config.get('order_size_usd', 100.0)):,.0f} per order • "
            f"{float(config['spacing_pct']):.1f}% spacing"
        )

    def _build_managed_bot_setup(
        self,
        strategy_type: StrategyType,
        *,
        budget_usd: float,
        snapshot: MarketSnapshot,
    ) -> tuple[
        Union[GridBotConfig, RebalanceBotConfig, InfinityGridBotConfig],
        str,
        str,
        list[str],
    ]:
        def clamp(value: float, minimum: float, maximum: float) -> float:
            return max(minimum, min(maximum, value))

        volatility = clamp(snapshot.volatility_24h_pct or 0.0, 1.5, 12.0)
        trend = snapshot.trend.lower()
        is_bullish = "bull" in trend or "up" in trend
        is_bearish = "bear" in trend or "down" in trend

        if strategy_type is StrategyType.GRID:
            downside_width_pct = clamp(volatility * (1.9 if is_bearish else 1.55), 4.5, 16.0)
            upside_width_pct = clamp(volatility * (1.9 if is_bullish else 1.45), 4.5, 16.0)
            spacing_pct = round(clamp(volatility * 0.55, 1.2, 3.4), 1)
            grid_count = int(round(clamp((downside_width_pct + upside_width_pct) / spacing_pct, 6, 14)))
            stop_loss_enabled = volatility >= 6.0 or is_bearish
            stop_loss_pct = round(clamp(downside_width_pct + 2.5, 6.0, 18.0), 1)

            config = GridBotConfig(
                lower_price=round(snapshot.price * (1 - downside_width_pct / 100), 2),
                upper_price=round(snapshot.price * (1 + upside_width_pct / 100), 2),
                grid_count=grid_count,
                spacing_pct=spacing_pct,
                stop_loss_enabled=stop_loss_enabled,
                stop_loss_pct=stop_loss_pct if stop_loss_enabled else None,
            )

            required_budget_usd, _ = self._minimum_budget_required(strategy_type, snapshot, config)
            while required_budget_usd > budget_usd and config.grid_count > 4:
                config = GridBotConfig(
                    lower_price=config.lower_price,
                    upper_price=config.upper_price,
                    grid_count=config.grid_count - 1,
                    spacing_pct=round(config.spacing_pct + 0.2, 1),
                    stop_loss_enabled=config.stop_loss_enabled,
                    stop_loss_pct=config.stop_loss_pct,
                )
                required_budget_usd, _ = self._minimum_budget_required(strategy_type, snapshot, config)

            buy_levels = len([level for level in config.price_levels() if level < snapshot.price])
            headline = "AI Pilot widened the ladder around the live BTC regime."
            rationale = (
                f"BTC/USDT is printing {snapshot.trend} conditions with {snapshot.volatility_24h_pct:.1f}% "
                f"24h volatility, so the launch range now stretches from ${config.lower_price:,.0f} "
                f"to ${config.upper_price:,.0f} with {config.grid_count} levels and {config.spacing_pct:.1f}% spacing."
            )
            highlights = [
                f"{buy_levels} buy levels sit below the current ${snapshot.price:,.0f} spot for immediate deployment.",
                f"Budget target: ${budget_usd:,.0f} against an estimated minimum of ${required_budget_usd:,.0f}.",
                (
                    f"Safety rail enabled at {config.stop_loss_pct:.1f}% below the working band."
                    if config.stop_loss_enabled and config.stop_loss_pct is not None
                    else "Stop-loss is disabled so the grid can stay fully range-focused."
                ),
            ]
            return config, headline, rationale, highlights

        if strategy_type is StrategyType.REBALANCE:
            target_btc_ratio = 0.5
            if is_bullish:
                target_btc_ratio = 0.58
            elif is_bearish:
                target_btc_ratio = 0.42
            target_btc_ratio = round(
                clamp(target_btc_ratio + (snapshot.change_24h_pct * 0.01), 0.35, 0.65), 2
            )
            rebalance_threshold_pct = round(clamp(volatility * 0.8, 2.5, 8.0), 1)
            interval_minutes = 30 if volatility >= 7.5 else 45 if volatility >= 4.5 else 60

            config = RebalanceBotConfig(
                target_btc_ratio=target_btc_ratio,
                rebalance_threshold_pct=rebalance_threshold_pct,
                interval_minutes=interval_minutes,
            )
            required_budget_usd, _ = self._minimum_budget_required(strategy_type, snapshot, config)
            headline = "AI Pilot centered the BTC allocation for steadier drift control."
            rationale = (
                f"With {snapshot.volatility_24h_pct:.1f}% daily volatility and a {snapshot.trend} tape, "
                f"the setup keeps {target_btc_ratio * 100:.0f}% of the budget in BTC, waits for "
                f"{rebalance_threshold_pct:.1f}% drift, and reviews exposure every {interval_minutes} minutes."
            )
            highlights = [
                f"Budget target: ${budget_usd:,.0f} against an estimated minimum of ${required_budget_usd:,.0f}.",
                f"Spot change is {snapshot.change_24h_pct:+.1f}% over 24h, so the ratio leans {'slightly long' if target_btc_ratio >= 0.5 else 'slightly defensive'}.",
                "Switch to manual mode if you want a custom BTC allocation rather than the market-aware default.",
            ]
            return config, headline, rationale, highlights

        levels_per_side = 3
        if budget_usd >= 1200:
            levels_per_side = 6
        elif budget_usd >= 800:
            levels_per_side = 5
        elif budget_usd >= 500:
            levels_per_side = 4
        spacing_pct = round(clamp(volatility * 0.45, 0.9, 2.6), 1)
        order_size_usd = round(max(MIN_EFFECTIVE_ORDER_USD, budget_usd * 0.42 / levels_per_side), 2)
        config = InfinityGridBotConfig(
            reference_price=round(snapshot.price, 2),
            spacing_pct=spacing_pct,
            order_size_usd=order_size_usd,
            levels_per_side=levels_per_side,
        )
        required_budget_usd, _ = self._minimum_budget_required(strategy_type, snapshot, config)
        if required_budget_usd > budget_usd:
            config = InfinityGridBotConfig(
                reference_price=config.reference_price,
                spacing_pct=config.spacing_pct,
                order_size_usd=round(max(MIN_EFFECTIVE_ORDER_USD, budget_usd * 0.48 / levels_per_side), 2),
                levels_per_side=levels_per_side,
            )
            required_budget_usd, _ = self._minimum_budget_required(strategy_type, snapshot, config)

        headline = "AI Pilot tuned a geometric ladder for trend follow-through."
        rationale = (
            f"BTC/USDT is carrying a {snapshot.trend} profile, so the ladder stays anchored at "
            f"${config.reference_price:,.0f} with {config.levels_per_side} levels per side, "
            f"{config.spacing_pct:.1f}% spacing, and ${config.order_size_usd:,.0f} clips."
        )
        highlights = [
            f"Budget target: ${budget_usd:,.0f} against an estimated minimum of ${required_budget_usd:,.0f}.",
            f"The ladder is split evenly around spot so it can keep re-arming both sides after fills.",
            "Wider spacing here reduces churn and leaves more room for continuation when volatility expands.",
        ]
        return config, headline, rationale, highlights

    def _initial_bot_balances(
        self,
        strategy_type: StrategyType,
        budget_usd: float,
        snapshot: MarketSnapshot,
        config: Union[GridBotConfig, RebalanceBotConfig, InfinityGridBotConfig],
    ) -> list[Balance]:
        if strategy_type is StrategyType.GRID:
            return [
                Balance(asset="BTC", free=0.0, locked=0.0),
                Balance(asset="USDT", free=round(budget_usd, 8), locked=0.0),
            ]

        if strategy_type is StrategyType.REBALANCE:
            if not isinstance(config, RebalanceBotConfig):
                raise ValueError("Rebalance allocation requires a rebalance configuration.")
            btc_value = round(budget_usd * config.target_btc_ratio, 8)
            usdt_value = round(max(budget_usd - btc_value, 0.0), 8)
            btc_amount = round((btc_value / snapshot.price) if snapshot.price > 0 else 0.0, 8)
            return [
                Balance(asset="BTC", free=btc_amount, locked=0.0),
                Balance(asset="USDT", free=usdt_value, locked=0.0),
            ]

        half_budget = round(budget_usd / 2, 8)
        btc_amount = round((half_budget / snapshot.price) if snapshot.price > 0 else 0.0, 8)
        usdt_value = round(budget_usd - half_budget, 8)
        return [
            Balance(asset="BTC", free=btc_amount, locked=0.0),
            Balance(asset="USDT", free=usdt_value, locked=0.0),
        ]

    def _estimate_bot_metrics(
        self,
        strategy_type: StrategyType,
        evaluation_data: dict[str, Any],
        snapshot: MarketSnapshot,
        allocation_pct: int,
        account_state: dict[str, Any],
    ) -> dict[str, Any]:
        evaluation = evaluation_data["evaluation"]
        risk = evaluation_data["risk"]
        warning_count = len(evaluation.warnings) + len(risk.warnings)
        order_count = len(evaluation.orders)
        last_backtest = account_state["last_backtest"]

        pnl_modifiers = {
            StrategyType.GRID: 0.65,
            StrategyType.REBALANCE: 0.35,
            StrategyType.INFINITY_GRID: 0.9,
        }
        drawdown_modifiers = {
            StrategyType.GRID: 1.15,
            StrategyType.REBALANCE: 0.75,
            StrategyType.INFINITY_GRID: 1.35,
        }

        paper_pnl_pct = round(
            (snapshot.change_24h_pct * pnl_modifiers[strategy_type])
            + (order_count * 0.14)
            - (warning_count * 0.55),
            2,
        )
        max_drawdown_pct = round(
            max(
                0.8,
                (snapshot.volatility_24h_pct * drawdown_modifiers[strategy_type]) + warning_count,
            ),
            1,
        )
        win_rate_pct = round(
            max(35.0, min(92.0, 56.0 + (order_count * 1.7) - (warning_count * 6))), 1
        )
        sharpe_ratio = round(
            max(0.4, min(3.2, (paper_pnl_pct / max(max_drawdown_pct, 0.8)) + 0.55)), 2
        )
        status = "idle"
        if (
            account_state["bot_status"] == "paper-running"
            and account_state["active_strategy"] == strategy_type.value
        ):
            status = "paper-running"
        elif last_backtest and last_backtest["strategy"] == strategy_type.value:
            status = "backtest-ready"

        last_signal = (
            evaluation.warnings[0]
            if evaluation.warnings
            else risk.warnings[0]
            if risk.warnings
            else evaluation.orders[0].rationale
            if evaluation.orders
            else evaluation.summary
        )

        return {
            "key": strategy_type.value,
            "name": self._strategy_label(strategy_type),
            "summary": evaluation.summary,
            "mode": self._strategy_mode(strategy_type),
            "status": status,
            "paperPnlPct": paper_pnl_pct,
            "winRatePct": win_rate_pct,
            "maxDrawdownPct": max_drawdown_pct,
            "sharpeRatio": sharpe_ratio,
            "trades": max(order_count * 4, 1),
            "allocationPct": allocation_pct,
            "lastSignal": last_signal,
        }

    def _format_time_label(self, timestamp: str) -> str:
        event_time = datetime.fromisoformat(timestamp)
        diff_seconds = int((self._utcnow() - event_time).total_seconds())
        if diff_seconds < 60:
            return "Now"

        diff_minutes = diff_seconds // 60
        if diff_minutes < 60:
            suffix = "" if diff_minutes == 1 else "s"
            return f"{diff_minutes} min{suffix} ago"

        diff_hours = diff_minutes // 60
        if diff_hours < 24:
            suffix = "" if diff_hours == 1 else "s"
            return f"{diff_hours} hour{suffix} ago"

        diff_days = diff_hours // 24
        suffix = "" if diff_days == 1 else "s"
        return f"{diff_days} day{suffix} ago"

    def _default_events(
        self,
        snapshot: MarketSnapshot,
        evaluation_data: list[dict[str, Any]],
        persisted_events: list[dict[str, Any]],
    ) -> list[dict[str, str]]:
        return [
            {
                "id": item["id"],
                "tone": item["tone"],
                "title": item["title"],
                "detail": item["detail"],
                "timeLabel": self._format_time_label(item["timestamp"]),
            }
            for item in persisted_events[:5]
        ]

    def _capital_usd(self, balances: list[Balance], snapshot: MarketSnapshot) -> float:
        total = 0.0
        for balance in balances:
            if balance.asset == "BTC":
                total += balance.free * snapshot.price
            elif balance.asset == "USDT":
                total += balance.free
        return round(total, 2)

    def _paper_balances(self, account_state: dict[str, Any]) -> list[Balance]:
        return [
            Balance(asset="BTC", free=account_state["btc_balance"], locked=0.0),
            Balance(asset="USDT", free=account_state["usd_balance"], locked=0.0),
        ]

    def _bot_balances(self, bot_state: dict[str, Any]) -> list[Balance]:
        return [
            Balance(asset="BTC", free=float(bot_state.get("btcBalance", 0.0)), locked=0.0),
            Balance(asset="USDT", free=float(bot_state.get("usdBalance", 0.0)), locked=0.0),
        ]

    def _bot_equity_usd(self, bot_state: dict[str, Any], snapshot: MarketSnapshot) -> float:
        usd_balance = float(bot_state.get("usdBalance", 0.0))
        btc_balance = float(bot_state.get("btcBalance", 0.0))
        return round(usd_balance + (btc_balance * snapshot.price), 2)

    def _reserve_total_usd(self, account_state: dict[str, Any], snapshot: MarketSnapshot) -> float:
        return round(
            float(account_state["usd_balance"])
            + (float(account_state["btc_balance"]) * snapshot.price),
            2,
        )

    def _record_portfolio_snapshot(
        self,
        *,
        user_id: str,
        account_state: dict[str, Any],
        active_strategies: list[dict[str, Any]],
        snapshot: MarketSnapshot,
        timestamp: Optional[str] = None,
    ) -> float:
        reserve_total = self._reserve_total_usd(account_state, snapshot)
        active_bot_total = round(sum(bot["currentEquityUsd"] for bot in active_strategies), 2)
        total_portfolio_usd = round(reserve_total + active_bot_total, 2)
        self.paper_store.record_portfolio_snapshot(
            user_id=user_id,
            total_equity_usd=total_portfolio_usd,
            timestamp=timestamp or self._timestamp(),
        )
        return total_portfolio_usd

    def _portfolio_performance_points(
        self,
        portfolio_snapshots: list[dict[str, Any]],
        deposit_events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not portfolio_snapshots:
            return []

        cumulative_deposits_usd = 0.0
        deposit_index = 0
        ordered_deposits = sorted(
            deposit_events,
            key=lambda item: (item["timestamp"], item["amountUsd"]),
        )
        initial_contribution_usd = float(portfolio_snapshots[0]["equityUsd"])
        performance_points: list[dict[str, Any]] = []

        for index, point in enumerate(portfolio_snapshots):
            point_time = datetime.fromisoformat(point["timestamp"])
            while deposit_index < len(ordered_deposits):
                deposit = ordered_deposits[deposit_index]
                deposit_time = datetime.fromisoformat(deposit["timestamp"])
                if deposit_time > point_time:
                    break
                if index == 0 and deposit_time == point_time:
                    break
                cumulative_deposits_usd = round(
                    cumulative_deposits_usd + float(deposit["amountUsd"]), 2
                )
                deposit_index += 1

            net_contributions_usd = round(initial_contribution_usd + cumulative_deposits_usd, 2)
            performance_points.append(
                {
                    "timestamp": point["timestamp"],
                    "equityUsd": round(float(point["equityUsd"]) - net_contributions_usd, 2),
                    "totalEquityUsd": round(float(point["equityUsd"]), 2),
                }
            )

        return performance_points

    def _reserve_after_funding_bot(
        self,
        account_state: dict[str, Any],
        budget_usd: float,
        snapshot: MarketSnapshot,
    ) -> tuple[float, float]:
        next_usd_balance = round(float(account_state["usd_balance"]), 8)
        next_btc_balance = round(float(account_state["btc_balance"]), 8)
        remaining_budget_usd = round(budget_usd, 8)

        usd_consumed = min(next_usd_balance, remaining_budget_usd)
        next_usd_balance = round(next_usd_balance - usd_consumed, 8)
        remaining_budget_usd = round(remaining_budget_usd - usd_consumed, 8)

        if remaining_budget_usd > 0:
            btc_needed = (
                round(remaining_budget_usd / snapshot.price, 8) if snapshot.price > 0 else 0.0
            )
            if next_btc_balance + 1e-9 < btc_needed:
                raise ValueError("Reserve BTC is insufficient to cover the requested budget.")
            next_btc_balance = round(max(next_btc_balance - btc_needed, 0.0), 8)

        return next_usd_balance, next_btc_balance

    def _process_snapshot(self, symbol: str) -> Optional[MarketSnapshot]:
        if not self._enable_market_stream and isinstance(self.exchange_client, MockExchangeClient):
            return SharedSnapshotFileMarketData(self._shared_snapshot_path()).get_snapshot(symbol)
        return self.market_data.get_snapshot(symbol)

    def _executable_orders(
        self,
        snapshot: MarketSnapshot,
        balances: list[Balance],
        orders: list[OrderIntent],
    ) -> list[OrderIntent]:
        remaining_usdt = next(
            (balance.free for balance in balances if balance.asset == "USDT"), 0.0
        )
        remaining_btc = next((balance.free for balance in balances if balance.asset == "BTC"), 0.0)
        executable: list[OrderIntent] = []

        for order in orders:
            execution_price = order.price or snapshot.price
            if order.side.value == "buy":
                notional_usd = execution_price * order.amount
                if notional_usd <= remaining_usdt + 1e-9:
                    executable.append(order)
                    remaining_usdt = round(remaining_usdt - notional_usd, 8)
                continue

            if order.amount <= remaining_btc + 1e-9:
                executable.append(order)
                remaining_btc = round(remaining_btc - order.amount, 8)

        return executable

    def process_bot_cycle(self, bot_id: str) -> dict[str, Any]:
        bot = self.paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            raise ValueError(f"Unknown bot id: {bot_id}")

        snapshot = self._process_snapshot(bot["symbol"])
        if snapshot is None:
            refreshed_bot = self.paper_store.get_bot_instance(bot_id=bot_id)
            return {
                "snapshot": None,
                "balances": [],
                "filledOrders": [],
                "lastTradeAt": refreshed_bot["lastTradeAt"] if refreshed_bot is not None else None,
                "evaluation": None,
                "skippedReason": "Fresh shared market snapshot unavailable.",
            }
        filled_orders: list[dict[str, Any]] = []
        strategy_type = StrategyType(bot["strategy"])
        price_window = read_shared_price_window(
            self._shared_snapshot_path(),
            bot["symbol"],
            since=bot["heartbeatAt"] or bot["createdAt"],
        ) or {
            "low_price": snapshot.price,
            "high_price": snapshot.price,
            "current_price": snapshot.price,
        }

        if strategy_type is StrategyType.GRID:
            filled_orders = self.paper_store.fill_triggered_grid_orders(
                bot_id=bot_id,
                market_price=snapshot.price,
                timestamp=self._timestamp(),
            )
        else:
            filled_orders = self.paper_store.fill_triggered_orders(
                bot_id=bot_id,
                low_price=price_window["low_price"],
                high_price=price_window["high_price"],
                timestamp=self._timestamp(),
            )

        balances = self._bot_balances(bot)
        if strategy_type is StrategyType.GRID:
            config_override = self._grid_config_from_payload(bot["config"])
        elif strategy_type is StrategyType.REBALANCE:
            config_override = self._rebalance_config_from_payload(bot["config"])
        else:
            config_override = self._infinity_grid_config_from_payload(bot["config"])
        evaluation_data = self._evaluate_strategy(
            strategy_type,
            snapshot,
            balances,
            config_override=config_override,
        )
        if strategy_type is not StrategyType.GRID:
            executable_orders = self._executable_orders(
                snapshot,
                balances,
                evaluation_data["evaluation"].orders,
            )
            self.paper_store.sync_planned_orders(
                bot_id=bot_id,
                orders=executable_orders,
                timestamp=self._timestamp(),
            )
        refreshed_bot = self.paper_store.get_bot_instance(bot_id=bot_id)
        refreshed_balances = self._bot_balances(refreshed_bot) if refreshed_bot is not None else []
        if refreshed_bot is not None:
            refreshed_account_state = self.paper_store.ensure_account(
                user_id=refreshed_bot["userId"],
                user_name=refreshed_bot["userName"],
                timestamp=self._timestamp(),
            )
            refreshed_active_strategies = [
                self._active_strategy_summary(active_bot, snapshot)
                for active_bot in self.paper_store.list_active_strategies(
                    user_id=refreshed_bot["userId"]
                )
            ]
            self._record_portfolio_snapshot(
                user_id=refreshed_bot["userId"],
                account_state=refreshed_account_state,
                active_strategies=refreshed_active_strategies,
                snapshot=snapshot,
            )
        return {
            "snapshot": snapshot,
            "balances": refreshed_balances or balances,
            "filledOrders": filled_orders,
            "lastTradeAt": refreshed_bot["lastTradeAt"] if refreshed_bot is not None else None,
            "evaluation": evaluation_data,
        }

    def _bot_position_metrics(
        self,
        bot_row: dict[str, Any],
        snapshot: MarketSnapshot,
    ) -> dict[str, Any]:
        trades = self.paper_store.list_executed_bot_trades(bot_id=bot_row["id"])
        position_btc = float(bot_row.get("initialBtcBalance", 0.0))
        position_cost_usd = float(bot_row.get("initialBtcCostUsd", 0.0))

        for trade in trades:
            amount = float(trade["amount"])
            notional_usd = float(trade["notionalUsd"])

            if trade["side"] == "buy":
                position_btc += amount
                position_cost_usd += notional_usd
                continue

            if position_btc <= 0:
                position_btc = 0.0
                position_cost_usd = 0.0
                continue

            sell_amount = min(amount, position_btc)
            average_cost = position_cost_usd / position_btc if position_btc > 0 else 0.0
            position_btc = max(position_btc - sell_amount, 0.0)
            position_cost_usd = max(position_cost_usd - (average_cost * sell_amount), 0.0)

        current_btc_balance = float(bot_row.get("btcBalance", 0.0))
        current_usd_balance = float(bot_row.get("usdBalance", 0.0))
        if bool(bot_row.get("releasedToAccount")) and bot_row.get("status") != "paper-running":
            current_btc_balance = float(bot_row.get("releasedBtcBalance", current_btc_balance))
            current_usd_balance = float(bot_row.get("releasedUsdBalance", current_usd_balance))
        current_equity_usd = round(current_usd_balance + (current_btc_balance * snapshot.price), 2)
        budget_usd = round(float(bot_row.get("budgetUsd", 0.0)), 2)
        position_value_usd = round(current_btc_balance * snapshot.price, 2)
        unrealized_pnl_usd = round(position_value_usd - position_cost_usd, 2)
        unrealized_pnl_pct = (
            round((unrealized_pnl_usd / position_cost_usd) * 100, 2)
            if position_cost_usd > 0
            else 0.0
        )
        total_pnl_usd = round(current_equity_usd - budget_usd, 2)
        total_pnl_pct = round((total_pnl_usd / budget_usd) * 100, 2) if budget_usd > 0 else 0.0

        return {
            "positionValueUsd": position_value_usd,
            "currentEquityUsd": current_equity_usd,
            "availableUsd": round(current_usd_balance, 2),
            "btcBalance": round(current_btc_balance, 8),
            "budgetUsd": budget_usd,
            "unrealizedPnlUsd": unrealized_pnl_usd,
            "unrealizedPnlPct": unrealized_pnl_pct,
            "totalPnlUsd": total_pnl_usd,
            "totalPnlPct": total_pnl_pct,
            "lastTradeAt": trades[-1]["createdAt"] if trades else None,
        }

    def _active_strategy_summary(
        self,
        bot_row: dict[str, Any],
        snapshot: MarketSnapshot,
    ) -> dict[str, Any]:
        config = bot_row["config"]
        config_summary = self._config_summary(StrategyType(bot_row["strategy"]), config, snapshot)
        position_metrics = self._bot_position_metrics(bot_row, snapshot)
        return {
            **bot_row,
            "configSummary": config_summary,
            "budgetUsd": position_metrics["budgetUsd"],
            "currentEquityUsd": position_metrics["currentEquityUsd"],
            "availableUsd": position_metrics["availableUsd"],
            "btcBalance": position_metrics["btcBalance"],
            "totalNotionalUsd": position_metrics["positionValueUsd"],
            "unrealizedPnlUsd": position_metrics["unrealizedPnlUsd"],
            "unrealizedPnlPct": position_metrics["unrealizedPnlPct"],
            "totalPnlUsd": position_metrics["totalPnlUsd"],
            "totalPnlPct": position_metrics["totalPnlPct"],
            "lastTradeAt": position_metrics["lastTradeAt"],
        }

    def _bot_instance_summary(
        self,
        bot_row: dict[str, Any],
        snapshot: MarketSnapshot,
    ) -> dict[str, Any]:
        return self._active_strategy_summary(bot_row, snapshot)

    def _grid_config_from_payload(
        self, config_payload: Optional[dict[str, Any]]
    ) -> Optional[GridBotConfig]:
        if not config_payload:
            return None
        required = ("lower_price", "upper_price", "grid_count", "spacing_pct")
        if not all(k in config_payload for k in required):
            return None
        return GridBotConfig(
            lower_price=float(config_payload["lower_price"]),
            upper_price=float(config_payload["upper_price"]),
            grid_count=int(config_payload["grid_count"]),
            spacing_pct=float(config_payload["spacing_pct"]),
            stop_at_upper_enabled=bool(config_payload.get("stop_at_upper_enabled", False)),
            stop_loss_enabled=bool(config_payload.get("stop_loss_enabled", False)),
            stop_loss_pct=(
                float(config_payload["stop_loss_pct"])
                if config_payload.get("stop_loss_pct") is not None
                else None
            ),
        )

    def _rebalance_config_from_payload(
        self, config_payload: Optional[dict[str, Any]]
    ) -> Optional[RebalanceBotConfig]:
        if not config_payload:
            return None
        required = ("target_btc_ratio", "rebalance_threshold_pct", "interval_minutes")
        if not all(k in config_payload for k in required):
            return None
        return RebalanceBotConfig(
            target_btc_ratio=float(config_payload["target_btc_ratio"]),
            rebalance_threshold_pct=float(config_payload["rebalance_threshold_pct"]),
            interval_minutes=int(config_payload["interval_minutes"]),
        )

    def _infinity_grid_config_from_payload(
        self, config_payload: Optional[dict[str, Any]]
    ) -> Optional[InfinityGridBotConfig]:
        if not config_payload:
            return None
        has_reference = "reference_price" in config_payload or "lower_start_price" in config_payload
        if not has_reference or "spacing_pct" not in config_payload:
            return None
        if "reference_price" in config_payload:
            reference_price = float(config_payload["reference_price"])
        else:
            reference_price = float(config_payload["lower_start_price"])
        return InfinityGridBotConfig(
            reference_price=reference_price,
            spacing_pct=float(config_payload["spacing_pct"]),
            order_size_usd=float(config_payload.get("order_size_usd", 100.0)),
            levels_per_side=int(
                config_payload.get("levels_per_side", config_payload.get("max_active_grids", 6))
            ),
        )

    def dashboard(
        self, user_id: str = "demo-user", user_name: str = "Demo Trader"
    ) -> dict[str, Any]:
        self._reconcile_user_bots(user_id)
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        account_state = self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=self._timestamp(),
        )
        balances = self._paper_balances(account_state)
        evaluations = [
            self._evaluate_strategy(strategy_type, snapshot, balances)
            for strategy_type in StrategyType
        ]
        persisted_events = self.paper_store.list_events(user_id=user_id)
        deposit_events = self.paper_store.list_deposit_events(user_id=user_id)
        active_strategies = [
            self._active_strategy_summary(bot, snapshot)
            for bot in self.paper_store.list_active_strategies(user_id=user_id)
        ]
        available_reserve_usd = self._reserve_total_usd(account_state, snapshot)
        total_portfolio_usd = round(
            available_reserve_usd + sum(bot["currentEquityUsd"] for bot in active_strategies),
            2,
        )
        allocated_capital_usd = round(
            sum(bot.get("budgetUsd", 0.0) for bot in active_strategies), 2
        )
        portfolio_snapshots = self.paper_store.list_portfolio_snapshots(user_id=user_id, limit=96)
        if not portfolio_snapshots:
            portfolio_snapshots = [
                {
                    "equityUsd": total_portfolio_usd,
                    "timestamp": self._timestamp(),
                }
            ]
        performance_points = self._portfolio_performance_points(portfolio_snapshots, deposit_events)
        current_snapshot = performance_points[-1]
        prior_cutoff = self._utcnow() - timedelta(hours=24)
        prior_portfolio_snapshot = next(
            (
                item
                for item in reversed(performance_points)
                if datetime.fromisoformat(item["timestamp"]) <= prior_cutoff
            ),
            None,
        )
        if prior_portfolio_snapshot is None:
            prior_portfolio_snapshot = performance_points[0]
        profit_24h_usd = round(
            current_snapshot["equityUsd"] - prior_portfolio_snapshot["equityUsd"], 2
        )
        baseline_equity = (
            prior_portfolio_snapshot["totalEquityUsd"]
            if datetime.fromisoformat(prior_portfolio_snapshot["timestamp"]) <= prior_cutoff
            else round(total_portfolio_usd - current_snapshot["equityUsd"], 2)
        )
        profit_24h_pct = (
            round((profit_24h_usd / baseline_equity) * 100, 2) if baseline_equity > 0 else 0.0
        )

        total_notional = sum(item["notional"] for item in evaluations)
        if total_notional <= 0:
            allocation_map = {
                StrategyType.GRID: 34,
                StrategyType.REBALANCE: 33,
                StrategyType.INFINITY_GRID: 33,
            }
        else:
            allocation_map = {
                item["strategy"]: round((item["notional"] / total_notional) * 100)
                for item in evaluations
            }
            shortfall = 100 - sum(allocation_map.values())
            allocation_map[StrategyType.GRID] = allocation_map.get(StrategyType.GRID, 0) + shortfall

        bots = [
            self._estimate_bot_metrics(
                item["strategy"],
                item,
                snapshot,
                allocation_map.get(item["strategy"], 0),
                account_state,
            )
            for item in evaluations
        ]

        return {
            "generatedAt": self._timestamp(),
            "status": asdict(self.status()),
            "market": asdict(snapshot),
            "connection": self._market_connection_summary(),
            "balances": [asdict(balance) for balance in balances],
            "dashboard": {
                "capitalUsd": total_portfolio_usd,
                "availableCashUsd": round(account_state["usd_balance"], 2),
                "availableReserveUsd": available_reserve_usd,
                "availableBtc": round(account_state["btc_balance"], 8),
                "allocatedCapitalUsd": allocated_capital_usd,
                "profit24hUsd": profit_24h_usd,
                "profit24hPct": profit_24h_pct,
                "portfolioPerformance": [
                    {
                        "equityUsd": point["equityUsd"],
                        "timestamp": point["timestamp"],
                    }
                    for point in performance_points
                ],
                "activeStrategy": account_state["active_strategy"],
                "botStatus": account_state["bot_status"],
                "paperRunCount": account_state["paper_run_count"],
                "lastPaperRunAt": account_state["last_paper_run_at"],
                "lastBacktest": account_state["last_backtest"],
                "bots": bots,
                "activeStrategies": active_strategies,
                "events": self._default_events(snapshot, evaluations, persisted_events),
            },
        }

    def demo_strategy(self, strategy_type: StrategyType) -> dict:
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        balances = self.exchange_client.fetch_balances()
        evaluation_data = self._evaluate_strategy(strategy_type, snapshot, balances)
        evaluation = evaluation_data["evaluation"]
        risk = evaluation_data["risk"]
        payload = asdict(evaluation)
        payload["risk"] = asdict(risk)
        payload["snapshot"] = asdict(snapshot)
        payload["balances"] = [asdict(balance) for balance in balances]
        return payload

    def run_paper_trading(
        self,
        strategy_type: StrategyType,
        user_id: str = "demo-user",
        user_name: str = "Demo Trader",
    ) -> dict[str, Any]:
        timestamp = self._timestamp()
        self.paper_store.record_paper_run(
            user_id=user_id,
            user_name=user_name,
            strategy=strategy_type.value,
            strategy_label=self._strategy_label(strategy_type),
            timestamp=timestamp,
        )
        return self.dashboard(user_id=user_id, user_name=user_name)

    def run_backtest(
        self,
        strategy_type: StrategyType,
        user_id: str = "demo-user",
        user_name: str = "Demo Trader",
        grid_config: Optional[dict[str, Any]] = None,
        rebalance_config: Optional[dict[str, Any]] = None,
        infinity_config: Optional[dict[str, Any]] = None,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        initial_capital_usd: Optional[float] = None,
        fee_rate: Optional[float] = None,
        slippage_rate: Optional[float] = None,
    ) -> dict[str, Any]:
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        account_state = self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=self._timestamp(),
        )
        completed_at = self._timestamp()
        if strategy_type is StrategyType.GRID:
            runner = GridBacktestRunner(
                self.historical_loader,
                fee_rate=fee_rate if fee_rate is not None else self.grid_backtest_runner._fee_rate,
                slippage_rate=(
                    slippage_rate
                    if slippage_rate is not None
                    else self.grid_backtest_runner._slippage_rate
                ),
            )
            normalized_start = self._normalize_datetime(start_at)
            normalized_end = self._normalize_datetime(end_at)
            if normalized_start is None or normalized_end is None:
                normalized_start, normalized_end = runner.default_window()
            window_candles = self.historical_loader.load_candles(
                start=normalized_start,
                end=normalized_end,
            )
            if not window_candles:
                raise ValueError(
                    "No historical candles available for the requested backtest window."
                )
            initial_snapshot = MarketSnapshot(
                symbol=self.settings.runtime.symbol,
                price=window_candles[0].open,
                change_24h_pct=0.0,
                volume_24h=0.0,
                volatility_24h_pct=0.0,
                trend="historical-replay",
            )
            config = self._resolve_strategy_config(
                strategy_type,
                initial_snapshot,
                self._grid_config_from_payload(grid_config),
            )
            if not isinstance(config, GridBotConfig):
                raise ValueError("Grid backtest requires a grid configuration.")
            backtest = runner.run(
                config,
                initial_capital_usd=(
                    round(initial_capital_usd, 2)
                    if initial_capital_usd is not None
                    else max(account_state["usd_balance"], 100.0)
                ),
                start=normalized_start,
                end=normalized_end,
                completed_at=datetime.fromisoformat(completed_at),
            )
            last_backtest = backtest.to_summary()
            tone = (
                "warning"
                if backtest.stop_loss_triggered or backtest.upper_price_stop_triggered
                else "neutral"
            )
        elif strategy_type is StrategyType.REBALANCE:
            runner = RebalanceBacktestRunner(
                self.historical_loader,
                fee_rate=(
                    fee_rate if fee_rate is not None else self.rebalance_backtest_runner._fee_rate
                ),
                slippage_rate=(
                    slippage_rate
                    if slippage_rate is not None
                    else self.rebalance_backtest_runner._slippage_rate
                ),
            )
            normalized_start = self._normalize_datetime(start_at)
            normalized_end = self._normalize_datetime(end_at)
            if normalized_start is None or normalized_end is None:
                normalized_start, normalized_end = runner.default_window()
            window_candles = self.historical_loader.load_candles(
                start=normalized_start,
                end=normalized_end,
            )
            if not window_candles:
                raise ValueError(
                    "No historical candles available for the requested backtest window."
                )
            initial_snapshot = MarketSnapshot(
                symbol=self.settings.runtime.symbol,
                price=window_candles[0].open,
                change_24h_pct=0.0,
                volume_24h=0.0,
                volatility_24h_pct=0.0,
                trend="historical-replay",
            )
            config = self._resolve_strategy_config(
                strategy_type,
                initial_snapshot,
                self._rebalance_config_from_payload(rebalance_config),
            )
            if not isinstance(config, RebalanceBotConfig):
                raise ValueError("Rebalance backtest requires a rebalance configuration.")
            backtest = runner.run(
                config,
                initial_capital_usd=(
                    round(initial_capital_usd, 2)
                    if initial_capital_usd is not None
                    else max(account_state["usd_balance"], 100.0)
                ),
                start=normalized_start,
                end=normalized_end,
                completed_at=datetime.fromisoformat(completed_at),
            )
            last_backtest = backtest.to_summary()
            tone = "warning" if backtest.warnings else "neutral"
        else:
            runner = InfinityGridBacktestRunner(
                self.historical_loader,
                fee_rate=(
                    fee_rate
                    if fee_rate is not None
                    else self.infinity_grid_backtest_runner._fee_rate
                ),
                slippage_rate=(
                    slippage_rate
                    if slippage_rate is not None
                    else self.infinity_grid_backtest_runner._slippage_rate
                ),
            )
            normalized_start = self._normalize_datetime(start_at)
            normalized_end = self._normalize_datetime(end_at)
            if normalized_start is None or normalized_end is None:
                normalized_start, normalized_end = runner.default_window()
            window_candles = self.historical_loader.load_candles(
                start=normalized_start,
                end=normalized_end,
            )
            if not window_candles:
                raise ValueError(
                    "No historical candles available for the requested backtest window."
                )
            initial_snapshot = MarketSnapshot(
                symbol=self.settings.runtime.symbol,
                price=window_candles[0].open,
                change_24h_pct=0.0,
                volume_24h=0.0,
                volatility_24h_pct=0.0,
                trend="historical-replay",
            )
            config = self._resolve_strategy_config(
                strategy_type,
                initial_snapshot,
                self._infinity_grid_config_from_payload(infinity_config),
            )
            if not isinstance(config, InfinityGridBotConfig):
                raise ValueError("Infinity Grid backtest requires an infinity grid configuration.")
            backtest = runner.run(
                config,
                initial_capital_usd=(
                    round(initial_capital_usd, 2)
                    if initial_capital_usd is not None
                    else max(account_state["usd_balance"], 100.0)
                ),
                start=normalized_start,
                end=normalized_end,
                completed_at=datetime.fromisoformat(completed_at),
            )
            last_backtest = backtest.to_summary()
            tone = "warning" if backtest.warnings else "neutral"
        self.paper_store.record_backtest(
            user_id=user_id,
            user_name=user_name,
            strategy=strategy_type.value,
            strategy_label=self._strategy_label(strategy_type),
            backtest_summary=last_backtest,
            tone=tone,
            timestamp=completed_at,
        )
        return self.dashboard(user_id=user_id, user_name=user_name)

    def deposit_paper_funds(
        self,
        amount_usd: float,
        user_id: str = "demo-user",
        user_name: str = "Demo Trader",
    ) -> dict[str, Any]:
        timestamp = self._timestamp()
        account_state = self.paper_store.record_deposit(
            user_id=user_id,
            user_name=user_name,
            amount_usd=round(amount_usd, 2),
            timestamp=timestamp,
        )
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        active_strategies = [
            self._active_strategy_summary(bot, snapshot)
            for bot in self.paper_store.list_active_strategies(user_id=user_id)
        ]
        self._record_portfolio_snapshot(
            user_id=user_id,
            account_state=account_state,
            active_strategies=active_strategies,
            snapshot=snapshot,
            timestamp=timestamp,
        )
        return self.dashboard(user_id=user_id, user_name=user_name)

    def trade_history(
        self, user_id: str = "demo-user", user_name: str = "Demo Trader"
    ) -> dict[str, Any]:
        self._reconcile_user_bots(user_id)
        account_state = self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=self._timestamp(),
        )
        trades = self.paper_store.list_paper_trades(user_id=user_id)
        total_notional_usd = round(sum(item["notionalUsd"] for item in trades), 2)
        buy_trades = sum(1 for item in trades if item["side"] == "buy")
        sell_trades = sum(1 for item in trades if item["side"] == "sell")
        latest_trade_at = trades[0]["createdAt"] if trades else None

        return {
            "generatedAt": self._timestamp(),
            "summary": {
                "totalTrades": len(trades),
                "pendingTrades": sum(1 for item in trades if item["status"] == "pending"),
                "buyTrades": buy_trades,
                "sellTrades": sell_trades,
                "totalNotionalUsd": total_notional_usd,
                "activeBotCount": len(self.paper_store.list_active_strategies(user_id=user_id)),
                "latestTradeAt": latest_trade_at,
                "paperRunCount": account_state["paper_run_count"],
            },
            "trades": trades,
        }

    def bot_activity(
        self, user_id: str = "demo-user", user_name: str = "Demo Trader"
    ) -> dict[str, Any]:
        self._reconcile_user_bots(user_id)
        self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=self._timestamp(),
        )
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        bot_rows = self.paper_store.list_bot_instances(user_id=user_id)
        bot_runs = [self._bot_instance_summary(bot_row, snapshot) for bot_row in bot_rows]
        active_bots = [bot for bot in bot_runs if bot["status"] == "paper-running"]
        previous_bots = [bot for bot in bot_runs if bot["status"] != "paper-running"]

        return {
            "generatedAt": self._timestamp(),
            "summary": {
                "totalBots": len(bot_runs),
                "activeBotCount": len(active_bots),
                "previousBotCount": len(previous_bots),
                "lastStartedAt": bot_runs[0]["startedAt"] if bot_runs else None,
            },
            "activeBots": active_bots,
            "previousBots": previous_bots,
        }

    def create_bot(
        self,
        strategy_type: StrategyType,
        *,
        budget_usd: float,
        user_id: str = "demo-user",
        user_name: str = "Demo Trader",
        grid_config: Optional[dict[str, Any]] = None,
        rebalance_config: Optional[dict[str, Any]] = None,
        infinity_config: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        timestamp = self._timestamp()
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        account_state = self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=timestamp,
        )
        budget_usd = round(budget_usd, 2)
        available_reserve_usd = self._reserve_total_usd(account_state, snapshot)
        if available_reserve_usd + 1e-9 < budget_usd:
            raise ValueError(
                f"Available reserve is ${available_reserve_usd:,.2f}, so the requested budget of ${budget_usd:,.2f} cannot be reserved."
            )
        config_override = None
        if strategy_type is StrategyType.GRID:
            config_override = self._grid_config_from_payload(grid_config)
        elif strategy_type is StrategyType.REBALANCE:
            config_override = self._rebalance_config_from_payload(rebalance_config)
        else:
            config_override = self._infinity_grid_config_from_payload(infinity_config)
        if config_override is None:
            raise ValueError("Bot configuration is required before reserving budget.")
        required_budget_usd, blocking_reason = self._minimum_budget_required(
            strategy_type,
            snapshot,
            config_override,
        )
        if blocking_reason:
            raise ValueError(blocking_reason)
        if budget_usd + 1e-9 < required_budget_usd:
            raise ValueError(
                f"This configuration needs at least ${required_budget_usd:,.2f} to run, but only ${budget_usd:,.2f} was provided."
            )
        bot_balances = self._initial_bot_balances(
            strategy_type,
            budget_usd,
            snapshot,
            config_override,
        )
        reserve_usd_balance, reserve_btc_balance = self._reserve_after_funding_bot(
            account_state,
            budget_usd,
            snapshot,
        )
        evaluation_data = self._evaluate_strategy(
            strategy_type,
            snapshot,
            bot_balances,
            config_override=config_override,
        )
        planned_orders = self._executable_orders(
            snapshot,
            bot_balances,
            evaluation_data["evaluation"].orders,
        )
        created_bot = self.paper_store.record_bot_start(
            user_id=user_id,
            user_name=user_name,
            strategy=strategy_type.value,
            strategy_label=self._strategy_label(strategy_type),
            symbol=snapshot.symbol,
            exchange=self.settings.exchange.exchange_id.title(),
            config=asdict(evaluation_data["config"]),
            budget_usd=budget_usd,
            reserve_usd_balance=reserve_usd_balance,
            reserve_btc_balance=reserve_btc_balance,
            initial_usd_balance=next(
                (balance.free for balance in bot_balances if balance.asset == "USDT"),
                0.0,
            ),
            initial_btc_balance=next(
                (balance.free for balance in bot_balances if balance.asset == "BTC"),
                0.0,
            ),
            orders=planned_orders,
            snapshot_price=snapshot.price,
            timestamp=timestamp,
        )
        created_bot_id = created_bot.get("created_bot_id")
        if isinstance(created_bot_id, str):
            self.process_bot_cycle(created_bot_id)
            self.process_manager.start_bot(created_bot_id)
        return self.dashboard(user_id=user_id, user_name=user_name)

    def build_managed_bot_setup(
        self,
        strategy_type: StrategyType,
        *,
        budget_usd: float,
        user_id: str = "demo-user",
        user_name: str = "Demo Trader",
    ) -> dict[str, Any]:
        timestamp = self._timestamp()
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        account_state = self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=timestamp,
        )
        normalized_budget_usd = round(budget_usd, 2)
        config, headline, rationale, highlights = self._build_managed_bot_setup(
            strategy_type,
            budget_usd=normalized_budget_usd,
            snapshot=snapshot,
        )
        config_payload = asdict(config)
        required_budget_usd, blocking_reason = self._minimum_budget_required(
            strategy_type,
            snapshot,
            config,
        )

        return {
            "generatedAt": timestamp,
            "strategy": strategy_type.value,
            "strategyLabel": self._strategy_label(strategy_type),
            "budgetUsd": normalized_budget_usd,
            "availableReserveUsd": round(self._reserve_total_usd(account_state, snapshot), 2),
            "requiredBudgetUsd": required_budget_usd,
            "fitsBudget": blocking_reason is None and normalized_budget_usd + 1e-9 >= required_budget_usd,
            "marketSnapshot": {
                "symbol": snapshot.symbol,
                "price": round(snapshot.price, 2),
                "change24hPct": round(snapshot.change_24h_pct, 2),
                "volatility24hPct": round(snapshot.volatility_24h_pct, 2),
                "trend": snapshot.trend,
            },
            "headline": headline,
            "rationale": rationale,
            "highlights": highlights,
            "configSummary": self._config_summary(strategy_type, config_payload, snapshot),
            "gridConfig": config_payload if strategy_type is StrategyType.GRID else None,
            "rebalanceConfig": config_payload if strategy_type is StrategyType.REBALANCE else None,
            "infinityConfig": config_payload if strategy_type is StrategyType.INFINITY_GRID else None,
        }

    def start_bot(
        self, bot_id: str, user_id: str = "demo-user", user_name: str = "Demo Trader"
    ) -> dict[str, Any]:
        self.paper_store.ensure_account(
            user_id=user_id, user_name=user_name, timestamp=self._timestamp()
        )
        bot = self.paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None or bot["userId"] != user_id:
            raise ValueError("Bot not found for this user.")
        self.process_manager.start_bot(bot_id)
        return self.dashboard(user_id=user_id, user_name=user_name)

    def stop_bot(
        self, bot_id: str, user_id: str = "demo-user", user_name: str = "Demo Trader"
    ) -> dict[str, Any]:
        self.paper_store.ensure_account(
            user_id=user_id, user_name=user_name, timestamp=self._timestamp()
        )
        bot = self.paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None or bot["userId"] != user_id:
            raise ValueError("Bot not found for this user.")
        self.process_manager.request_stop(bot_id)
        return self.dashboard(user_id=user_id, user_name=user_name)

    def recover_running_bots(self) -> list[str]:
        return self.process_manager.recover_running_bots()


def create_app(
    *,
    enable_market_stream: bool = True,
    worker_autostart: bool = True,
) -> TradingBotApp:
    return TradingBotApp(
        load_settings(),
        enable_market_stream=enable_market_stream,
        worker_autostart=worker_autostart,
    )
