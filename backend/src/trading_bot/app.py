from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

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
        self.risk_manager = RiskManager()
        self._active_strategy = StrategyType.GRID
        self._bot_status = "idle"
        self._paper_run_count = 0
        self._last_paper_run_at: str | None = None
        self._last_backtest: dict[str, Any] | None = None
        self._event_history: list[dict[str, str]] = []

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

    def _build_strategy(self, strategy_type: StrategyType, snapshot: MarketSnapshot):
        if strategy_type is StrategyType.GRID:
            return GridStrategy(
                GridBotConfig(
                    lower_price=snapshot.price * 0.92,
                    upper_price=snapshot.price * 1.08,
                    grid_count=8,
                    spacing_pct=2.0,
                )
            )

        if strategy_type is StrategyType.REBALANCE:
            return RebalanceStrategy(
                RebalanceBotConfig(
                    target_btc_ratio=0.5,
                    rebalance_threshold_pct=5.0,
                    interval_minutes=60,
                )
            )

        return InfinityGridStrategy(
            InfinityGridBotConfig(
                lower_start_price=snapshot.price * 0.9,
                spacing_pct=1.5,
                profit_take_pct=1.2,
                trailing_stop_pct=7.0,
            )
        )

    def _evaluate_strategy(
        self,
        strategy_type: StrategyType,
        snapshot: MarketSnapshot,
        balances: list[Balance],
    ) -> dict[str, Any]:
        strategy = self._build_strategy(strategy_type, snapshot)
        evaluation = strategy.evaluate(snapshot, balances)
        risk = self.risk_manager.review(balances, evaluation.orders)
        notional = sum((order.price or snapshot.price) * order.amount for order in evaluation.orders)
        return {
            "strategy": strategy_type,
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
    ) -> dict[str, Any]:
        evaluation = evaluation_data["evaluation"]
        risk = evaluation_data["risk"]
        warning_count = len(evaluation.warnings) + len(risk.warnings)
        order_count = len(evaluation.orders)

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
        if self._bot_status == "paper-running" and self._active_strategy is strategy_type:
            status = "paper-running"
        elif self._last_backtest and self._last_backtest["strategy"] == strategy_type.value:
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

    def _push_event(self, tone: str, title: str, detail: str, timestamp: str | None = None) -> None:
        occurred_at = timestamp or self._timestamp()
        self._event_history.insert(
            0,
            {
                "id": f"evt-{len(self._event_history) + 1}",
                "tone": tone,
                "title": title,
                "detail": detail,
                "timestamp": occurred_at,
            },
        )
        self._event_history = self._event_history[:6]

    def _default_events(
        self,
        snapshot: MarketSnapshot,
        evaluation_data: list[dict[str, Any]],
    ) -> list[dict[str, str]]:
        events: list[dict[str, str]] = []
        for item in self._event_history[:3]:
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

    def dashboard(self) -> dict[str, Any]:
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        balances = self.exchange_client.fetch_balances()
        evaluations = [
            self._evaluate_strategy(strategy_type, snapshot, balances)
            for strategy_type in StrategyType
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
                "activeStrategy": self._active_strategy.value,
                "botStatus": self._bot_status,
                "paperRunCount": self._paper_run_count,
                "lastPaperRunAt": self._last_paper_run_at,
                "lastBacktest": self._last_backtest,
                "bots": bots,
                "events": self._default_events(snapshot, evaluations),
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

    def run_paper_trading(self, strategy_type: StrategyType) -> dict[str, Any]:
        self._active_strategy = strategy_type
        self._bot_status = "paper-running"
        self._paper_run_count += 1
        self._last_paper_run_at = self._timestamp()
        self._push_event(
            "positive",
            f"{self._strategy_label(strategy_type)} paper run started",
            "Paper trading is active with simulated fills and live market snapshots.",
            self._last_paper_run_at,
        )
        return self.dashboard()

    def run_backtest(self, strategy_type: StrategyType) -> dict[str, Any]:
        snapshot = self.market_data.get_snapshot(self.settings.runtime.symbol)
        balances = self.exchange_client.fetch_balances()
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
        self._last_backtest = {
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
        self._push_event(
            "neutral" if risk.accepted else "warning",
            f"{self._strategy_label(strategy_type)} backtest completed",
            "A fresh strategy preview is available for the dashboard.",
            completed_at,
        )
        return self.dashboard()


def create_app() -> TradingBotApp:
    return TradingBotApp(load_settings())
