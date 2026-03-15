from __future__ import annotations

from fastapi.testclient import TestClient

from trading_bot.api import create_api
from trading_bot.app import TradingBotApp
from trading_bot.settings import load_settings


def build_client(monkeypatch) -> TestClient:
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_KEY", raising=False)
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_SECRET", raising=False)
    monkeypatch.delenv("TRADING_BOT_API_CORS_ORIGINS", raising=False)
    monkeypatch.setenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "false")
    app = create_api(TradingBotApp(load_settings()))
    return TestClient(app)


def test_dashboard_endpoint_returns_dashboard_payload(monkeypatch) -> None:
    client = build_client(monkeypatch)

    response = client.get("/api/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"]["exchange"] == "binance"
    assert payload["market"]["symbol"] == "BTC/USDT"
    assert payload["dashboard"]["activeStrategy"] == "grid"
    assert payload["dashboard"]["botStatus"] == "idle"
    assert len(payload["dashboard"]["bots"]) == 3
    assert {bot["key"] for bot in payload["dashboard"]["bots"]} == {
        "grid",
        "rebalance",
        "infinity-grid",
    }


def test_swagger_endpoint_is_available(monkeypatch) -> None:
    client = build_client(monkeypatch)

    response = client.get("/swagger")

    assert response.status_code == 200
    assert "Swagger UI" in response.text


def test_paper_trading_endpoint_updates_dashboard_state(monkeypatch) -> None:
    client = build_client(monkeypatch)

    response = client.post("/api/paper-trading/run", json={"strategy": "rebalance"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["dashboard"]["activeStrategy"] == "rebalance"
    assert payload["dashboard"]["botStatus"] == "paper-running"
    assert payload["dashboard"]["paperRunCount"] == 1

    rebalance_bot = next(
        bot for bot in payload["dashboard"]["bots"] if bot["key"] == "rebalance"
    )
    assert rebalance_bot["status"] == "paper-running"


def test_backtest_endpoint_returns_latest_summary(monkeypatch) -> None:
    client = build_client(monkeypatch)

    response = client.post("/api/backtests/run", json={"strategy": "infinity-grid"})

    assert response.status_code == 200
    payload = response.json()
    summary = payload["dashboard"]["lastBacktest"]
    assert summary is not None
    assert summary["strategy"] == "infinity-grid"
    assert summary["periodLabel"] == "Last 90 days"
    assert summary["trades"] >= 8
