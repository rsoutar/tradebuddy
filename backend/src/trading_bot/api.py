from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from trading_bot.app import TradingBotApp, create_app
from trading_bot.models import StrategyType
from trading_bot.services.ai import AgentDeps, create_agent, stream_chat


class UserScopedRequest(BaseModel):
    user_id: str = "demo-user"
    user_name: str = "Demo Trader"


class StrategyActionRequest(UserScopedRequest):
    strategy: StrategyType


class GridConfigRequest(BaseModel):
    lower_price: float = Field(gt=0)
    upper_price: float = Field(gt=0)
    grid_count: int = Field(ge=2)
    spacing_pct: float = Field(gt=0)
    stop_at_upper_enabled: bool = False
    stop_loss_enabled: bool = False
    stop_loss_pct: Optional[float] = Field(default=None, gt=0)


class RebalanceConfigRequest(BaseModel):
    target_btc_ratio: float = Field(ge=0, le=1)
    rebalance_threshold_pct: float = Field(gt=0)
    interval_minutes: int = Field(gt=0)


class InfinityGridConfigRequest(BaseModel):
    reference_price: float = Field(gt=0)
    spacing_pct: float = Field(gt=0)
    order_size_usd: float = Field(gt=0)
    levels_per_side: int = Field(ge=1)


class CreateBotRequest(UserScopedRequest):
    strategy: StrategyType
    budget_usd: float = Field(gt=0)
    grid_config: Optional[GridConfigRequest] = None
    rebalance_config: Optional[RebalanceConfigRequest] = None
    infinity_config: Optional[InfinityGridConfigRequest] = None


class ManagedBotDraftRequest(UserScopedRequest):
    strategy: StrategyType
    budget_usd: float = Field(gt=0)


class BacktestRequest(UserScopedRequest):
    strategy: StrategyType
    grid_config: Optional[GridConfigRequest] = None
    rebalance_config: Optional[RebalanceConfigRequest] = None
    infinity_config: Optional[InfinityGridConfigRequest] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    initial_capital_usd: Optional[float] = Field(default=None, gt=0)
    fee_rate: Optional[float] = Field(default=None, ge=0)
    slippage_rate: Optional[float] = Field(default=None, ge=0)


class DepositRequest(UserScopedRequest):
    amount_usd: float = Field(gt=0)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: Optional[str] = None
    user_id: str = "demo-user"


class BotControlRequest(UserScopedRequest):
    pass


def create_api(trading_app: Optional[TradingBotApp] = None) -> FastAPI:
    app_state = trading_app or create_app()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        app_state.recover_running_bots()
        yield

    api = FastAPI(
        title="Oscar Trading Bot API",
        version="0.1.0",
        description="Dashboard-facing API for trading bot status, metrics, and actions.",
        docs_url="/swagger",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    api.add_middleware(
        CORSMiddleware,
        allow_origins=app_state.settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    def healthcheck() -> dict[str, bool]:
        return {"ok": True}

    @api.get("/up", include_in_schema=False)
    def upcheck() -> dict[str, bool]:
        return {"ok": True}

    @api.get("/docs", include_in_schema=False)
    def swagger_redirect() -> RedirectResponse:
        return RedirectResponse(url="/swagger")

    @api.get("/api/status")
    def get_status() -> dict:
        return asdict(app_state.status())

    @api.get("/api/dashboard")
    def get_dashboard(
        user_id: str = Query(default="demo-user"),
        user_name: str = Query(default="Demo Trader"),
    ) -> dict:
        return app_state.dashboard(user_id=user_id, user_name=user_name)

    @api.get("/api/trades")
    def get_trade_history(
        user_id: str = Query(default="demo-user"),
        user_name: str = Query(default="Demo Trader"),
    ) -> dict:
        return app_state.trade_history(user_id=user_id, user_name=user_name)

    @api.get("/api/bots/history")
    def get_bot_activity(
        user_id: str = Query(default="demo-user"),
        user_name: str = Query(default="Demo Trader"),
    ) -> dict:
        return app_state.bot_activity(user_id=user_id, user_name=user_name)

    @api.get("/api/strategies/compare")
    def compare_strategies() -> dict:
        return app_state.compare_strategies()

    @api.get("/api/support-resistance")
    def get_support_resistance() -> dict:
        return app_state.detect_support_resistance()

    @api.get("/api/strategies/{strategy}")
    def get_strategy_preview(strategy: StrategyType) -> dict:
        return app_state.demo_strategy(strategy)

    @api.post("/api/paper-trading/run")
    def run_paper_trading(payload: StrategyActionRequest) -> dict:
        return app_state.run_paper_trading(
            payload.strategy,
            user_id=payload.user_id,
            user_name=payload.user_name,
        )

    @api.post("/api/bots")
    def create_bot(payload: CreateBotRequest) -> dict:
        try:
            return app_state.create_bot(
                payload.strategy,
                budget_usd=payload.budget_usd,
                user_id=payload.user_id,
                user_name=payload.user_name,
                grid_config=payload.grid_config.model_dump() if payload.grid_config else None,
                rebalance_config=(
                    payload.rebalance_config.model_dump() if payload.rebalance_config else None
                ),
                infinity_config=(
                    payload.infinity_config.model_dump() if payload.infinity_config else None
                ),
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/bots/draft")
    def draft_bot_setup(payload: ManagedBotDraftRequest) -> dict:
        try:
            return app_state.build_managed_bot_setup_with_cache(
                payload.strategy,
                budget_usd=payload.budget_usd,
                user_id=payload.user_id,
                user_name=payload.user_name,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/bots/recommendations")
    def invalidate_recommendation_cache() -> dict:
        app_state._rec_cache.invalidate()
        return {"ok": True, "message": "Recommendation cache invalidated. Next draft request will generate fresh recommendations."}

    @api.get("/api/bots/recommendations/status")
    def get_recommendation_cache_status() -> dict:
        is_fresh = app_state._is_cache_fresh()
        cache = app_state._get_cached_recommendation()
        return {
            "is_fresh": is_fresh,
            "generated_at": cache.recommendation.generated_at if cache else None,
            "is_llm_generated": cache.recommendation.is_llm_generated if cache else False,
            "recommended_strategy": cache.recommendation.recommended_strategy if cache else None,
        }

    @api.post("/api/bots/{bot_id}/start")
    def start_bot(bot_id: str, payload: BotControlRequest) -> dict:
        try:
            return app_state.start_bot(
                bot_id,
                user_id=payload.user_id,
                user_name=payload.user_name,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/bots/{bot_id}/stop")
    def stop_bot(bot_id: str, payload: BotControlRequest) -> dict:
        try:
            return app_state.stop_bot(
                bot_id,
                user_id=payload.user_id,
                user_name=payload.user_name,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/backtests/run")
    def run_backtest(payload: BacktestRequest) -> dict:
        try:
            return app_state.run_backtest(
                payload.strategy,
                user_id=payload.user_id,
                user_name=payload.user_name,
                grid_config=payload.grid_config.model_dump() if payload.grid_config else None,
                rebalance_config=(
                    payload.rebalance_config.model_dump() if payload.rebalance_config else None
                ),
                infinity_config=(
                    payload.infinity_config.model_dump() if payload.infinity_config else None
                ),
                start_at=payload.start_at,
                end_at=payload.end_at,
                initial_capital_usd=payload.initial_capital_usd,
                fee_rate=payload.fee_rate,
                slippage_rate=payload.slippage_rate,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/paper-trading/deposits")
    def deposit_paper_funds(payload: DepositRequest) -> dict:
        return app_state.deposit_paper_funds(
            payload.amount_usd,
            user_id=payload.user_id,
            user_name=payload.user_name,
        )

    # ── AI Chat ───────────────────────────────────────────────────────

    if not app_state.settings.ai.enabled:

        @api.post("/api/ai/chat")
        def ai_chat_disabled(payload: ChatRequest) -> dict:
            raise HTTPException(
                status_code=503,
                detail="AI chat is disabled. Set TRADING_BOT_AI_ENABLED=true to enable.",
            )

        @api.get("/api/ai/history")
        def ai_history_disabled(
            conversation_id: str = Query(...),
        ) -> dict:
            raise HTTPException(
                status_code=503,
                detail="AI chat is disabled. Set TRADING_BOT_AI_ENABLED=true to enable.",
            )
    else:
        ai_agent = create_agent(app_state.settings.ai)

        @api.post("/api/ai/chat")
        async def ai_chat(payload: ChatRequest):
            timestamp = datetime.now(timezone.utc).isoformat()
            paper_store = app_state.paper_store
            deps = AgentDeps(trading_app=app_state, user_id=payload.user_id)

            conversation_id = payload.conversation_id
            if not conversation_id:
                conversation_id = f"conv-{uuid.uuid4().hex[:12]}"
                paper_store.create_chat_conversation(
                    conversation_id=conversation_id,
                    user_id=payload.user_id,
                    title=payload.message[:80],
                    timestamp=timestamp,
                )

            paper_store.save_chat_message(
                conversation_id=conversation_id,
                role="user",
                content=payload.message,
                timestamp=timestamp,
            )

            raw_messages = paper_store.list_chat_messages(
                conversation_id=conversation_id,
            )
            message_history = _build_message_history(raw_messages)

            async def event_generator():
                full_response = ""
                async for event in stream_chat(ai_agent, deps, payload.message, message_history):
                    event_type = event["type"]
                    if event_type == "token":
                        full_response += event["content"]
                        yield {
                            "event": "token",
                            "data": json.dumps({"content": event["content"]}),
                        }
                    elif event_type == "tool_call":
                        yield {
                            "event": "tool_call",
                            "data": json.dumps(
                                {
                                    "tool": event["tool"],
                                    "args": event["args"],
                                }
                            ),
                        }
                    elif event_type == "tool_result":
                        yield {
                            "event": "tool_result",
                            "data": json.dumps(
                                {
                                    "tool": event["tool"],
                                    "content": event["content"],
                                }
                            ),
                        }
                    elif event_type == "error":
                        yield {
                            "event": "error",
                            "data": json.dumps({"content": event["content"]}),
                        }
                    elif event_type == "done":
                        ts = datetime.now(timezone.utc).isoformat()
                        paper_store.save_chat_message(
                            conversation_id=conversation_id,
                            role="assistant",
                            content=full_response,
                            timestamp=ts,
                        )
                        yield {
                            "event": "done",
                            "data": json.dumps({"conversation_id": conversation_id}),
                        }

            return EventSourceResponse(event_generator())

        @api.get("/api/ai/history")
        def ai_history(
            conversation_id: str = Query(...),
        ) -> dict:
            paper_store = app_state.paper_store
            conversation = paper_store.get_chat_conversation(
                conversation_id=conversation_id,
            )
            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found.")
            messages = paper_store.list_chat_messages(
                conversation_id=conversation_id,
            )
            return {
                "conversation": conversation,
                "messages": messages,
            }

        @api.get("/api/ai/conversations")
        def ai_conversations(
            user_id: str = Query(default="demo-user"),
        ) -> dict:
            paper_store = app_state.paper_store
            conversations = paper_store.list_chat_conversations(user_id=user_id)
            return {"conversations": conversations}

    return api


app = create_api()


def _build_message_history(raw_messages: list[dict]) -> list:
    """Convert persisted chat messages into PydanticAI message history format."""
    from pydantic_ai.messages import (
        ModelRequest,
        ModelResponse,
        TextPart,
        ToolReturnPart,
        UserPromptPart,
    )

    messages = []
    for msg in raw_messages:
        if msg["role"] == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=msg["content"])]))
        elif msg["role"] == "assistant":
            messages.append(ModelResponse(parts=[TextPart(content=msg["content"])]))
        elif msg["role"] == "tool" and msg.get("toolName"):
            messages.append(
                ModelRequest(
                    parts=[
                        ToolReturnPart(
                            tool_name=msg["toolName"],
                            content=msg["content"],
                            tool_call_id=f"tool-{msg.get('toolName', 'unknown')}",
                        )
                    ]
                )
            )
    return messages
