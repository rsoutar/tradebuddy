from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from trading_bot.app import TradingBotApp, create_app
from trading_bot.models import StrategyType


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


class BotControlRequest(UserScopedRequest):
    pass


def create_api(trading_app: Optional[TradingBotApp] = None) -> FastAPI:
    app_state = trading_app or create_app()
    api = FastAPI(
        title="Oscar Trading Bot API",
        version="0.1.0",
        description="Dashboard-facing API for trading bot status, metrics, and actions.",
        docs_url="/swagger",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
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

    return api


app = create_api()
