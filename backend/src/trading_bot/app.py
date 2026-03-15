from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Optional, Union

from trading_bot.logging_config import configure_logging
from trading_bot.models import (
    BotStatus,
    Balance,
    GridBotConfig,
    InfinityGridBotConfig,
    MarketSnapshot,
    RebalanceBotConfig,
    StrategyType,
)
from trading_bot.paper_store import PaperTradingStore
from trading_bot.services.exchange import CcxtExchangeClient, MockExchangeClient
from trading_bot.services.binance_ws import BinanceSpotWebSocketMarketData
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
        self.market_data = MarketDataService(
            self.exchange_client,
            market_stream=self._create_market_stream(),
        )
        self.paper_store = PaperTradingStore(settings.runtime.state_dir / "paper_trading.sqlite3")
        self.risk_manager = RiskManager()

    def _create_exchange_client(self):
        if self.settings.exchange.api_key and self.settings.exchange.api_secret:
            return CcxtExchangeClient(self.settings.exchange)
        return MockExchangeClient()

    def _create_market_stream(self):
        if (
            self.settings.exchange.exchange_id == "binance"
            and self.settings.exchange.market_type == "spot"
            and self.settings.market_data.websocket_enabled
        ):
            return BinanceSpotWebSocketMarketData(
                symbol=self.settings.runtime.symbol,
                websocket_url=self.settings.market_data.websocket_url,
                initial_timeout_seconds=self.settings.market_data.websocket_timeout_seconds,
            )
        return None

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
            lower_start_price=snapshot.price * 0.9,
            spacing_pct=1.5,
            profit_take_pct=1.2,
            trailing_stop_pct=7.0,
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
            Balance(asset="BTC", free=0.0, locked=0.0),
            Balance(asset="USDT", free=account_state["usd_balance"], locked=0.0),
        ]

    def _active_strategy_summary(
        self,
        bot_row: dict[str, Any],
        snapshot: MarketSnapshot,
    ) -> dict[str, Any]:
        config = bot_row["config"]
        if bot_row["strategy"] == StrategyType.GRID.value:
            stop_loss_summary = (
                f" • stop loss {config['stop_loss_pct']:.1f}%"
                if config.get("stop_loss_enabled") and config.get("stop_loss_pct") is not None
                else " • stop loss off"
            )
            config_summary = (
                f"Range ${config['lower_price']:,.0f} to ${config['upper_price']:,.0f} "
                f"across {config['grid_count']} levels{stop_loss_summary}"
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
                f"Anchor ${config['lower_start_price']:,.0f} with "
                f"{config['max_active_grids']} active grids"
            )
            pnl_modifier = 0.22

        unrealized_pnl_pct = round(snapshot.change_24h_pct * pnl_modifier, 2)
        unrealized_pnl_usd = round(bot_row["totalNotionalUsd"] * (unrealized_pnl_pct / 100), 2)
        return {
            **bot_row,
            "configSummary": config_summary,
            "unrealizedPnlUsd": unrealized_pnl_usd,
            "unrealizedPnlPct": unrealized_pnl_pct,
        }

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
            stop_loss_enabled=bool(config_payload.get("stop_loss_enabled", False)),
            stop_loss_pct=(
                float(config_payload["stop_loss_pct"])
                if config_payload.get("stop_loss_pct") is not None
                else None
            ),
        )

    def dashboard(self, user_id: str = "demo-user", user_name: str = "Demo Trader") -> dict[str, Any]:
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
    ) -> dict[str, Any]:
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        account_state = self.paper_store.ensure_account(
            user_id=user_id,
            user_name=user_name,
            timestamp=self._timestamp(),
        )
        balances = self._paper_balances(account_state)
        evaluation_data = self._evaluate_strategy(strategy_type, snapshot, balances)
        evaluation = evaluation_data["evaluation"]
        risk = evaluation_data["risk"]
        completed_at = self._timestamp()

        roi_pct = round(
            (snapshot.change_24h_pct * 4.2)
            + (len(evaluation.orders) * 0.35)
            - ((len(evaluation.warnings) + len(risk.warnings)) * 0.9),
            2,
        )
        max_drawdown_pct = round(max(1.0, snapshot.volatility_24h_pct * 2.1), 2)
        trades = max(len(evaluation.orders) * 12, 8)
        last_backtest = {
            "strategy": strategy_type.value,
            "periodLabel": "Last 90 days",
            "roiPct": roi_pct,
            "maxDrawdownPct": max_drawdown_pct,
            "profitFactor": round(max(1.0, 1.1 + (len(evaluation.orders) * 0.08)), 2),
            "winRatePct": round(max(40.0, 57.5 + (len(evaluation.orders) * 0.7)), 1),
            "trades": trades,
            "annualizedPct": round(roi_pct * 1.35, 2),
            "completedAt": completed_at,
        }
        self.paper_store.record_backtest(
            user_id=user_id,
            user_name=user_name,
            strategy=strategy_type.value,
            strategy_label=self._strategy_label(strategy_type),
            backtest_summary=last_backtest,
            tone="neutral" if risk.accepted else "warning",
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

    def create_bot(
        self,
        strategy_type: StrategyType,
        *,
        user_id: str = "demo-user",
        user_name: str = "Demo Trader",
        grid_config: Optional[dict[str, Any]] = None,
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
        evaluation_data = self._evaluate_strategy(
            strategy_type,
            snapshot,
            balances,
            config_override=config_override,
        )
        self.paper_store.record_bot_start(
            user_id=user_id,
            user_name=user_name,
            strategy=strategy_type.value,
            strategy_label=self._strategy_label(strategy_type),
            symbol=snapshot.symbol,
            exchange=self.settings.exchange.exchange_id.title(),
            config=asdict(evaluation_data["config"]),
            orders=evaluation_data["evaluation"].orders,
            snapshot_price=snapshot.price,
            timestamp=timestamp,
        )
        return self.dashboard(user_id=user_id, user_name=user_name)


def create_app() -> TradingBotApp:
    return TradingBotApp(load_settings())
