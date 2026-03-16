from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
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
from trading_bot.services.market_data import MarketDataService, SharedSnapshotFileMarketData
from trading_bot.services.risk import RiskManager
from trading_bot.settings import AppSettings, load_settings
from trading_bot.strategies.grid import GridStrategy
from trading_bot.strategies.infinity_grid import InfinityGridStrategy
from trading_bot.strategies.rebalance import RebalanceStrategy


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
        self.historical_loader = historical_loader or BinanceHistoricalKlineLoader()
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
        notional = sum((order.price or snapshot.price) * order.amount for order in evaluation.orders)
        return {
            "strategy": strategy_type,
            "config": strategy_config,
            "evaluation": evaluation,
            "risk": risk,
            "notional": notional,
        }

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
            max(0.8, (snapshot.volatility_24h_pct * drawdown_modifiers[strategy_type]) + warning_count),
            1,
        )
        win_rate_pct = round(max(35.0, min(92.0, 56.0 + (order_count * 1.7) - (warning_count * 6))), 1)
        sharpe_ratio = round(max(0.4, min(3.2, (paper_pnl_pct / max(max_drawdown_pct, 0.8)) + 0.55)), 2)
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
        events: list[dict[str, str]] = []
        for item in persisted_events[:3]:
            events.append(
                {
                    "id": item["id"],
                    "tone": item["tone"],
                    "title": item["title"],
                    "detail": item["detail"],
                    "timeLabel": self._format_time_label(item["timestamp"]),
                }
            )

        events.append(
            {
                "id": "evt-market",
                "tone": "positive" if snapshot.change_24h_pct >= 0 else "warning",
                "title": "Market snapshot refreshed",
                "detail": (
                    f"{snapshot.symbol} is at ${snapshot.price:,.2f} with "
                    f"{snapshot.change_24h_pct:+.2f}% 24h change."
                ),
                "timeLabel": "Now",
            }
        )
        events.append(
            {
                "id": "evt-volatility",
                "tone": "warning" if snapshot.volatility_24h_pct >= 3 else "neutral",
                "title": "Volatility monitor updated",
                "detail": (
                    f"24h volatility is {snapshot.volatility_24h_pct:.2f}% and the trend reads "
                    f"as {snapshot.trend}."
                ),
                "timeLabel": "Now",
            }
        )

        risk_warning = next(
            (
                warning
                for item in evaluation_data
                for warning in item["risk"].warnings
            ),
            None,
        )
        if risk_warning:
            events.append(
                {
                    "id": "evt-risk",
                    "tone": "warning",
                    "title": "Risk envelope needs attention",
                    "detail": risk_warning,
                    "timeLabel": "Now",
                }
            )

        return events[:5]

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

    def _executable_orders(
        self,
        snapshot: MarketSnapshot,
        balances: list[Balance],
        orders: list[OrderIntent],
    ) -> list[OrderIntent]:
        remaining_usdt = next((balance.free for balance in balances if balance.asset == "USDT"), 0.0)
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

        snapshot = self.market_data.get_snapshot(bot["symbol"])
        filled_orders: list[dict[str, Any]] = []
        strategy_type = StrategyType(bot["strategy"])

        if strategy_type is StrategyType.GRID:
            filled_orders = self.paper_store.fill_triggered_grid_orders(
                bot_id=bot_id,
                market_price=snapshot.price,
                timestamp=self._timestamp(),
            )
        else:
            filled_orders = self.paper_store.fill_triggered_orders(
                bot_id=bot_id,
                market_price=snapshot.price,
                timestamp=self._timestamp(),
            )

        account_state = self.paper_store.ensure_account(
            user_id=bot["userId"],
            user_name=bot["userName"],
            timestamp=self._timestamp(),
        )
        balances = self._paper_balances(account_state)
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
        return {
            "snapshot": snapshot,
            "balances": balances,
            "filledOrders": filled_orders,
            "lastTradeAt": refreshed_bot["lastTradeAt"] if refreshed_bot is not None else None,
            "evaluation": evaluation_data,
        }

    def _bot_position_metrics(
        self,
        bot_id: str,
        snapshot: MarketSnapshot,
    ) -> dict[str, Any]:
        trades = self.paper_store.list_executed_bot_trades(bot_id=bot_id)
        position_btc = 0.0
        position_cost_usd = 0.0

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

        position_value_usd = round(position_btc * snapshot.price, 2)
        unrealized_pnl_usd = round(position_value_usd - position_cost_usd, 2)
        unrealized_pnl_pct = (
            round((unrealized_pnl_usd / position_cost_usd) * 100, 2) if position_cost_usd > 0 else 0.0
        )

        return {
            "positionValueUsd": position_value_usd,
            "unrealizedPnlUsd": unrealized_pnl_usd,
            "unrealizedPnlPct": unrealized_pnl_pct,
            "lastTradeAt": trades[-1]["createdAt"] if trades else None,
        }

    def _active_strategy_summary(
        self,
        bot_row: dict[str, Any],
        snapshot: MarketSnapshot,
    ) -> dict[str, Any]:
        config = bot_row["config"]
        if bot_row["strategy"] == StrategyType.GRID.value:
            grid_config = self._grid_config_from_payload(config)
            level_count = len(grid_config.price_levels()) if grid_config is not None else int(config["grid_count"])
            stop_loss_summary = (
                f" • stop loss {config['stop_loss_pct']:.1f}%"
                if config.get("stop_loss_enabled") and config.get("stop_loss_pct") is not None
                else " • stop loss off"
            )
            upper_stop_summary = (
                " • stop at upper on" if config.get("stop_at_upper_enabled") else " • stop at upper off"
            )
            config_summary = (
                f"Range ${config['lower_price']:,.0f} to ${config['upper_price']:,.0f} "
                f"across {level_count} levels{stop_loss_summary}{upper_stop_summary}"
            )
            pnl_modifier = 0.18
        elif bot_row["strategy"] == StrategyType.REBALANCE.value:
            config_summary = (
                f"Target BTC {config['target_btc_ratio'] * 100:.0f}% with "
                f"{config['rebalance_threshold_pct']:.1f}% drift threshold"
            )
            pnl_modifier = 0.08
        else:
            config_summary = (
                f"Reference ${config.get('reference_price', config.get('lower_start_price', snapshot.price)):,.0f} • "
                f"{int(config.get('levels_per_side', config.get('max_active_grids', 6)))} levels per side • "
                f"${float(config.get('order_size_usd', 100.0)):,.0f} per order • "
                f"{float(config['spacing_pct']):.1f}% spacing"
            )
        position_metrics = self._bot_position_metrics(bot_row["id"], snapshot)
        return {
            **bot_row,
            "configSummary": config_summary,
            "totalNotionalUsd": position_metrics["positionValueUsd"],
            "unrealizedPnlUsd": position_metrics["unrealizedPnlUsd"],
            "unrealizedPnlPct": position_metrics["unrealizedPnlPct"],
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
        if "reference_price" in config_payload:
            reference_price = float(config_payload["reference_price"])
        else:
            reference_price = float(config_payload["lower_start_price"])
        return InfinityGridBotConfig(
            reference_price=reference_price,
            spacing_pct=float(config_payload["spacing_pct"]),
            order_size_usd=float(config_payload.get("order_size_usd", 100.0)),
            levels_per_side=int(config_payload.get("levels_per_side", config_payload.get("max_active_grids", 6))),
        )

    def dashboard(self, user_id: str = "demo-user", user_name: str = "Demo Trader") -> dict[str, Any]:
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
        active_strategies = [
            self._active_strategy_summary(bot, snapshot)
            for bot in self.paper_store.list_active_strategies(user_id=user_id)
        ]

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
                "capitalUsd": self._capital_usd(balances, snapshot),
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
                raise ValueError("No historical candles available for the requested backtest window.")
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
            tone = "warning" if backtest.stop_loss_triggered or backtest.upper_price_stop_triggered else "neutral"
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
                raise ValueError("No historical candles available for the requested backtest window.")
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
                raise ValueError("No historical candles available for the requested backtest window.")
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
        self.paper_store.record_deposit(
            user_id=user_id,
            user_name=user_name,
            amount_usd=round(amount_usd, 2),
            timestamp=self._timestamp(),
        )
        return self.dashboard(user_id=user_id, user_name=user_name)

    def trade_history(self, user_id: str = "demo-user", user_name: str = "Demo Trader") -> dict[str, Any]:
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
                "plannedTrades": sum(1 for item in trades if item["status"] == "planned"),
                "buyTrades": buy_trades,
                "sellTrades": sell_trades,
                "totalNotionalUsd": total_notional_usd,
                "activeBotCount": len(self.paper_store.list_active_strategies(user_id=user_id)),
                "latestTradeAt": latest_trade_at,
                "paperRunCount": account_state["paper_run_count"],
            },
            "trades": trades,
        }

    def bot_activity(self, user_id: str = "demo-user", user_name: str = "Demo Trader") -> dict[str, Any]:
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
        balances = self._paper_balances(account_state)
        config_override = None
        if strategy_type is StrategyType.GRID:
            config_override = self._grid_config_from_payload(grid_config)
        elif strategy_type is StrategyType.REBALANCE:
            config_override = self._rebalance_config_from_payload(rebalance_config)
        else:
            config_override = self._infinity_grid_config_from_payload(infinity_config)
        evaluation_data = self._evaluate_strategy(
            strategy_type,
            snapshot,
            balances,
            config_override=config_override,
        )
        planned_orders = self._executable_orders(
            snapshot,
            balances,
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
            orders=planned_orders,
            snapshot_price=snapshot.price,
            timestamp=timestamp,
        )
        created_bot_id = created_bot.get("created_bot_id")
        if isinstance(created_bot_id, str):
            self.process_bot_cycle(created_bot_id)
            self.process_manager.start_bot(created_bot_id)
        return self.dashboard(user_id=user_id, user_name=user_name)

    def start_bot(self, bot_id: str, user_id: str = "demo-user", user_name: str = "Demo Trader") -> dict[str, Any]:
        self.paper_store.ensure_account(user_id=user_id, user_name=user_name, timestamp=self._timestamp())
        bot = self.paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None or bot["userId"] != user_id:
            raise ValueError("Bot not found for this user.")
        self.process_manager.start_bot(bot_id)
        return self.dashboard(user_id=user_id, user_name=user_name)

    def stop_bot(self, bot_id: str, user_id: str = "demo-user", user_name: str = "Demo Trader") -> dict[str, Any]:
        self.paper_store.ensure_account(user_id=user_id, user_name=user_name, timestamp=self._timestamp())
        bot = self.paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None or bot["userId"] != user_id:
            raise ValueError("Bot not found for this user.")
        self.process_manager.request_stop(bot_id)
        return self.dashboard(user_id=user_id, user_name=user_name)


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
