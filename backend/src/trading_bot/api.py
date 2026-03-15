from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from trading_bot.app import TradingBotApp, create_app
from trading_bot.models import StrategyType


class StrategyActionRequest(BaseModel):
    strategy: StrategyType


def create_api(trading_app: TradingBotApp | None = None) -> FastAPI:
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

    @api.get("/docs", include_in_schema=False)
    def swagger_redirect() -> RedirectResponse:
        return RedirectResponse(url="/swagger")

    @api.get("/api/status")
    def get_status() -> dict:
        return asdict(app_state.status())

    @api.get("/api/dashboard")
    def get_dashboard() -> dict:
        return app_state.dashboard()

    @api.get("/api/strategies/{strategy}")
    def get_strategy_preview(strategy: StrategyType) -> dict:
        return app_state.demo_strategy(strategy)

    @api.post("/api/paper-trading/run")
    def run_paper_trading(payload: StrategyActionRequest) -> dict:
        return app_state.run_paper_trading(payload.strategy)

    @api.post("/api/backtests/run")
    def run_backtest(payload: StrategyActionRequest) -> dict:
        return app_state.run_backtest(payload.strategy)

    return api


app = create_api()
