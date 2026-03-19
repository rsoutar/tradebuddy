from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, AsyncGenerator, Optional

from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
)
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from trading_bot.models import StrategyType
from pydantic_ai.usage import UsageLimits

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Oscar's BTC strategy analyst. You help users understand \
market conditions and optimize their trading bot settings for BTC/USDT on Binance spot.

Critical behavioral rules:
- NEVER ask the user for preferences, budget, or which strategy they want. Take action immediately.
- NEVER repeat the same tool call with the same parameters. Call once, then answer.
- When asked "which bot" or "what strategy" or "best settings", you MUST:
  1. Call get_market_snapshot first to get current conditions.
  2. Call compare_strategies to evaluate all 3 strategies side-by-side.
  3. Recommend the ONE best strategy with specific parameter values based on the data.
- Always call tools to get real data before answering quantitative questions.
- After receiving tool results, answer the user. Do not call tools again unless the user asks a follow-up.
- Provide specific numbers and data-backed suggestions.
- Explain tradeoffs when recommending strategy parameters.
- This is not financial advice — frame recommendations as analysis, not directives.
- When suggesting settings, consider the current market regime (sideways, trending, volatile).
- Be concise. Use bullet points for multi-part answers.
- If asked about non-BTC or non-trading topics, politely redirect to your area of expertise."""


@dataclass
class AgentDeps:
    trading_app: Any
    user_id: str


def create_agent(settings_ai: Any) -> Agent[AgentDeps, str]:
    model = OpenAIChatModel(
        settings_ai.model_name,
        provider=OpenAIProvider(
            base_url=settings_ai.base_url,
            api_key=settings_ai.api_key,
        ),
    )
    agent = Agent(
        model,
        deps_type=AgentDeps,
        system_prompt=SYSTEM_PROMPT,
    )
    _register_tools(agent)
    return agent


def _register_tools(agent: Agent[AgentDeps, str]) -> None:

    @agent.tool
    async def get_market_snapshot(ctx: RunContext[AgentDeps]) -> str:
        """Get the current BTC/USDT market snapshot including price, 24h change, \
volume, volatility, and trend."""
        logger.info("[AI tool] get_market_snapshot()")
        try:
            app = ctx.deps.trading_app
            snapshot = app.market_data.get_snapshot(app.settings.runtime.symbol)
            data = asdict(snapshot)
            result = json.dumps(data, indent=2)
            logger.info(
                "[AI tool] get_market_snapshot → price=%.2f trend=%s",
                snapshot.price,
                snapshot.trend,
            )
            return result
        except Exception:
            logger.exception("[AI tool] get_market_snapshot failed")
            raise

    @agent.tool
    async def compare_strategies(ctx: RunContext[AgentDeps]) -> str:
        """Evaluate ALL three strategies (grid, rebalance, infinity-grid) with \
auto-configured parameters based on the current market price. Returns a side-by-side \
comparison of each strategy's proposed orders, risk, and metrics so you can recommend \
the single best bot for current conditions. USE THIS when asked which bot/strategy to use."""
        logger.info("[AI tool] compare_strategies()")
        try:
            app = ctx.deps.trading_app
            snapshot = app.market_data.get_snapshot(app.settings.runtime.symbol)
            balances = app.exchange_client.fetch_balances()

            comparisons = []
            for strategy_type in StrategyType:
                config = app._resolve_strategy_config(strategy_type, snapshot)
                evaluation_data = app._evaluate_strategy(strategy_type, snapshot, balances)
                evaluation = evaluation_data["evaluation"]
                risk = evaluation_data["risk"]
                notional = evaluation_data["notional"]
                budget = app._minimum_budget_required(strategy_type, snapshot, config)

                comparisons.append(
                    {
                        "strategy": strategy_type.value,
                        "mode": app._strategy_mode(strategy_type),
                        "config_summary": str(config),
                        "order_count": len(evaluation.orders),
                        "summary": evaluation.summary,
                        "orders": [
                            {
                                "side": o.side.value,
                                "price": o.price,
                                "amount": o.amount,
                            }
                            for o in evaluation.orders[:5]
                        ],
                        "risk_warnings": risk.warnings,
                        "strategy_warnings": evaluation.warnings,
                        "notional_usd": round(notional, 2),
                        "min_budget_usd": budget[0],
                        "budget_note": budget[1],
                    }
                )

            result = {
                "market": asdict(snapshot),
                "recommendation_basis": (
                    "Grid suits sideways/choppy markets with bounded price action. "
                    "Rebalance suits steady markets or long-term portfolio management. "
                    "Infinity Grid suits trending/breakout markets with sustained moves. "
                    "Higher volatility_24h_pct favors grid/infinity-grid. "
                    "Lower volatility favors rebalance."
                ),
                "strategies": comparisons,
            }
            logger.info(
                "[AI tool] compare_strategies → %d strategies, price=%.2f",
                len(comparisons),
                snapshot.price,
            )
            return json.dumps(result, indent=2, default=str)
        except Exception:
            logger.exception("[AI tool] compare_strategies failed")
            raise

    @agent.tool
    async def evaluate_strategy(
        ctx: RunContext[AgentDeps],
        strategy: str,
        lower_price: Optional[float] = None,
        upper_price: Optional[float] = None,
        grid_count: Optional[int] = None,
        spacing_pct: Optional[float] = None,
        target_btc_ratio: Optional[float] = None,
        rebalance_threshold_pct: Optional[float] = None,
        interval_minutes: Optional[int] = None,
        reference_price: Optional[float] = None,
        order_size_usd: Optional[float] = None,
        levels_per_side: Optional[int] = None,
    ) -> str:
        """Evaluate a trading strategy (grid, rebalance, or infinity-grid) with \
optional custom parameters. Returns the strategy's proposed orders, risk assessment, \
and key metrics. Use this to check what the bot would do right now with given settings."""
        logger.info(
            "[AI tool] evaluate_strategy(strategy=%s, lower_price=%s, upper_price=%s, grid_count=%s, spacing_pct=%s)",
            strategy,
            lower_price,
            upper_price,
            grid_count,
            spacing_pct,
        )
        app = ctx.deps.trading_app
        try:
            strategy_type = StrategyType(strategy)
        except ValueError:
            return f"Invalid strategy '{strategy}'. Must be one of: grid, rebalance, infinity-grid"

        try:
            snapshot = app.market_data.get_snapshot(app.settings.runtime.symbol)
            balances = app.exchange_client.fetch_balances()

            config_override = None
            if strategy_type is StrategyType.GRID and any(
                v is not None for v in [lower_price, upper_price, grid_count, spacing_pct]
            ):
                from trading_bot.models import GridBotConfig

                config_override = GridBotConfig(
                    lower_price=lower_price or round(snapshot.price * 0.92, 2),
                    upper_price=upper_price or round(snapshot.price * 1.08, 2),
                    grid_count=grid_count or 8,
                    spacing_pct=spacing_pct or 2.0,
                )
            elif strategy_type is StrategyType.REBALANCE and any(
                v is not None for v in [target_btc_ratio, rebalance_threshold_pct, interval_minutes]
            ):
                from trading_bot.models import RebalanceBotConfig

                config_override = RebalanceBotConfig(
                    target_btc_ratio=target_btc_ratio if target_btc_ratio is not None else 0.5,
                    rebalance_threshold_pct=rebalance_threshold_pct or 5.0,
                    interval_minutes=interval_minutes or 60,
                )
            elif strategy_type is StrategyType.INFINITY_GRID and any(
                v is not None
                for v in [reference_price, spacing_pct, order_size_usd, levels_per_side]
            ):
                from trading_bot.models import InfinityGridBotConfig

                config_override = InfinityGridBotConfig(
                    reference_price=reference_price or snapshot.price,
                    spacing_pct=spacing_pct or 1.5,
                    order_size_usd=order_size_usd or 100.0,
                    levels_per_side=levels_per_side or 6,
                )

            evaluation_data = app._evaluate_strategy(
                strategy_type, snapshot, balances, config_override
            )
            evaluation = evaluation_data["evaluation"]
            risk = evaluation_data["risk"]

            result = {
                "strategy": strategy_type.value,
                "config": str(evaluation_data["config"]),
                "summary": evaluation.summary,
                "order_count": len(evaluation.orders),
                "orders": [
                    {
                        "side": o.side.value,
                        "type": o.order_type.value,
                        "price": o.price,
                        "amount": o.amount,
                        "rationale": o.rationale,
                    }
                    for o in evaluation.orders[:10]
                ],
                "risk_warnings": risk.warnings,
                "strategy_warnings": evaluation.warnings,
                "metrics": evaluation.metrics,
            }
            logger.info(
                "[AI tool] evaluate_strategy → %s, %d orders",
                strategy_type.value,
                len(evaluation.orders),
            )
            return json.dumps(result, indent=2, default=str)
        except Exception:
            logger.exception("[AI tool] evaluate_strategy failed")
            raise

    @agent.tool
    async def run_quick_backtest(
        ctx: RunContext[AgentDeps],
        strategy: str,
        lower_price: Optional[float] = None,
        upper_price: Optional[float] = None,
        grid_count: Optional[int] = None,
        spacing_pct: Optional[float] = None,
        target_btc_ratio: Optional[float] = None,
        rebalance_threshold_pct: Optional[float] = None,
        interval_minutes: Optional[int] = None,
        reference_price: Optional[float] = None,
        spacing_pct_inf: Optional[float] = None,
        order_size_usd: Optional[float] = None,
        levels_per_side: Optional[int] = None,
        initial_capital_usd: Optional[float] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> str:
        """Run a historical backtest for a strategy. Defaults to the last 90 days. \
Use start_date and end_date (ISO format, e.g. "2025-09-01") for a custom window. \
Returns ROI, max drawdown, win rate, profit factor, and trade count."""
        logger.info(
            "[AI tool] run_quick_backtest(strategy=%s, start=%s, end=%s, capital=%s)",
            strategy,
            start_date,
            end_date,
            initial_capital_usd,
        )
        app = ctx.deps.trading_app
        try:
            strategy_type = StrategyType(strategy)
        except ValueError:
            return f"Invalid strategy '{strategy}'. Must be one of: grid, rebalance, infinity-grid"

        grid_config = None
        rebalance_config = None
        infinity_config = None

        if strategy_type is StrategyType.GRID and any(
            v is not None for v in [lower_price, upper_price, grid_count, spacing_pct]
        ):
            grid_config = {}
            if lower_price is not None:
                grid_config["lower_price"] = lower_price
            if upper_price is not None:
                grid_config["upper_price"] = upper_price
            if grid_count is not None:
                grid_config["grid_count"] = grid_count
            if spacing_pct is not None:
                grid_config["spacing_pct"] = spacing_pct
        elif strategy_type is StrategyType.REBALANCE and any(
            v is not None for v in [target_btc_ratio, rebalance_threshold_pct, interval_minutes]
        ):
            rebalance_config = {}
            if target_btc_ratio is not None:
                rebalance_config["target_btc_ratio"] = target_btc_ratio
            if rebalance_threshold_pct is not None:
                rebalance_config["rebalance_threshold_pct"] = rebalance_threshold_pct
            if interval_minutes is not None:
                rebalance_config["interval_minutes"] = interval_minutes
        elif strategy_type is StrategyType.INFINITY_GRID and any(
            v is not None
            for v in [reference_price, spacing_pct_inf, order_size_usd, levels_per_side]
        ):
            infinity_config = {}
            if reference_price is not None:
                infinity_config["reference_price"] = reference_price
            if spacing_pct_inf is not None:
                infinity_config["spacing_pct"] = spacing_pct_inf
            if order_size_usd is not None:
                infinity_config["order_size_usd"] = order_size_usd
            if levels_per_side is not None:
                infinity_config["levels_per_side"] = levels_per_side

        try:
            start_at = datetime.fromisoformat(start_date) if start_date else None
            end_at = datetime.fromisoformat(end_date) if end_date else None
        except ValueError as exc:
            return f"Invalid date format: {exc}. Use ISO format like '2025-09-01'."

        try:
            result = app.run_backtest(
                strategy_type,
                user_id=ctx.deps.user_id,
                user_name="AI Analyst",
                grid_config=grid_config,
                rebalance_config=rebalance_config,
                infinity_config=infinity_config,
                initial_capital_usd=initial_capital_usd,
                start_at=start_at,
                end_at=end_at,
            )
        except Exception as exc:
            logger.exception("[AI tool] run_quick_backtest failed")
            return f"Backtest failed: {exc}"

        backtest = result.get("dashboard", {}).get("lastBacktest", result)
        summary_keys = [
            "strategy",
            "roiPct",
            "maxDrawdownPct",
            "profitFactor",
            "winRatePct",
            "trades",
            "annualizedPct",
            "startEquityUsd",
            "finalEquityUsd",
            "periodLabel",
        ]
        filtered = {k: backtest.get(k) for k in summary_keys if k in backtest}
        logger.info(
            "[AI tool] run_quick_backtest → strategy=%s, roi=%.2f%%",
            strategy_type.value,
            filtered.get("roiPct", 0),
        )
        return json.dumps(filtered, indent=2, default=str)

    @agent.tool
    async def get_historical_summary(ctx: RunContext[AgentDeps]) -> str:
        """Get a summary of available historical BTC/USDT data including date range, \
number of candles, and basic price statistics (open, high, low, close range)."""
        logger.info("[AI tool] get_historical_summary()")
        try:
            app = ctx.deps.trading_app
            loader = app.historical_loader
            archives = loader.discover_archives()
            if not archives:
                logger.warning("[AI tool] get_historical_summary → no archives found")
                return "No historical data archives found."

            first = archives[0]
            last = archives[-1]
            total_candles = 0
            for archive in archives[-3:]:
                candles = loader.load_candles_from_archive(archive)
                total_candles += len(candles)

            recent_candles = loader.load_candles_from_archive(last) if last else []
            price_stats = {}
            if recent_candles:
                prices = [c.close for c in recent_candles]
                price_stats = {
                    "latest_close": prices[-1],
                    "period_high": max(c.high for c in recent_candles),
                    "period_low": min(c.low for c in recent_candles),
                    "period_open": recent_candles[0].open,
                }

            return json.dumps(
                {
                    "symbol": loader.symbol,
                    "interval": loader.interval,
                    "earliest": f"{first.year}-{first.month:02d}" if first else None,
                    "latest": f"{last.year}-{last.month:02d}" if last else None,
                    "total_archives": len(archives),
                    "recent_candles_count": len(recent_candles),
                    "latest_month_stats": price_stats,
                },
                indent=2,
                default=str,
            )
        except Exception as exc:
            logger.exception("[AI tool] get_historical_summary failed")
            return f"Could not load historical summary: {exc}"

    @agent.tool
    async def get_bot_status(ctx: RunContext[AgentDeps]) -> str:
        """Get the current paper trading account status including balances, \
active bots, active strategies, and recent events."""
        logger.info("[AI tool] get_bot_status()")
        try:
            app = ctx.deps.trading_app
            dashboard = app.dashboard(user_id=ctx.deps.user_id, user_name="AI Analyst")
            status = {
                "environment": dashboard.get("status", {}).get("environment"),
                "symbol": dashboard.get("status", {}).get("symbol"),
                "capital_usd": dashboard.get("dashboard", {}).get("capitalUsd"),
                "available_cash_usd": dashboard.get("dashboard", {}).get("availableCashUsd"),
                "available_btc": dashboard.get("dashboard", {}).get("availableBtc"),
                "active_strategy": dashboard.get("dashboard", {}).get("activeStrategy"),
                "bot_status": dashboard.get("dashboard", {}).get("botStatus"),
                "paper_run_count": dashboard.get("dashboard", {}).get("paperRunCount"),
                "profit_24h_usd": dashboard.get("dashboard", {}).get("profit24hUsd"),
                "profit_24h_pct": dashboard.get("dashboard", {}).get("profit24hPct"),
                "active_bots": [
                    {
                        "id": b.get("id"),
                        "name": b.get("name"),
                        "strategy": b.get("strategy"),
                        "status": b.get("status"),
                        "budget_usd": b.get("budgetUsd"),
                        "trade_count": b.get("tradeCount"),
                    }
                    for b in dashboard.get("dashboard", {}).get("activeStrategies", [])
                ],
                "last_backtest": dashboard.get("dashboard", {}).get("lastBacktest"),
            }
            logger.info(
                "[AI tool] get_bot_status → capital=%.2f, bots=%d",
                status["capital_usd"],
                len(status["active_bots"]),
            )
            return json.dumps(status, indent=2, default=str)
        except Exception:
            logger.exception("[AI tool] get_bot_status failed")
            raise


async def stream_chat(
    agent: Agent[AgentDeps, str],
    deps: AgentDeps,
    message: str,
    message_history: Optional[list] = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a chat response as structured SSE-compatible events.

    Yields dicts with:
      - {"type": "token", "content": str}
      - {"type": "tool_call", "tool": str, "args": str}
      - {"type": "tool_result", "tool": str, "content": str}
      - {"type": "error", "content": str}
      - {"type": "done"}
    """
    try:
        async with agent.iter(
            message,
            deps=deps,
            message_history=message_history,
            usage_limits=UsageLimits(request_limit=8),
        ) as run:
            async for node in run:
                if Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        async for event in request_stream:
                            if isinstance(event, PartStartEvent):
                                if isinstance(event.part, TextPart) and event.part.content:
                                    yield {"type": "token", "content": event.part.content}
                            elif isinstance(event, PartDeltaEvent):
                                if isinstance(event.delta, TextPartDelta):
                                    yield {"type": "token", "content": event.delta.content_delta}
                elif Agent.is_call_tools_node(node):
                    async with node.stream(run.ctx) as tool_stream:
                        async for event in tool_stream:
                            if isinstance(event, FunctionToolCallEvent):
                                yield {
                                    "type": "tool_call",
                                    "tool": event.part.tool_name,
                                    "args": event.part.args_as_json_str(),
                                }
                            elif isinstance(event, FunctionToolResultEvent):
                                result_part = event.result
                                tool_name = getattr(result_part, "tool_name", "unknown")
                                result_content = str(getattr(result_part, "content", ""))
                                if len(result_content) > 500:
                                    result_content = result_content[:500] + "..."
                                yield {
                                    "type": "tool_result",
                                    "tool": tool_name,
                                    "content": result_content,
                                }
            yield {"type": "done"}
    except Exception as exc:
        yield {"type": "error", "content": str(exc)}
