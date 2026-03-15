from __future__ import annotations

from fastapi.testclient import TestClient

from trading_bot.api import create_api
from trading_bot.app import TradingBotApp
from trading_bot.settings import load_settings


def build_client(monkeypatch, tmp_path) -> TestClient:
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_KEY", raising=False)
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_SECRET", raising=False)
    monkeypatch.delenv("TRADING_BOT_API_CORS_ORIGINS", raising=False)
    monkeypatch.setenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "false")
    monkeypatch.setenv("TRADING_BOT_STATE_DIR", str(tmp_path / "state"))
    app = create_api(TradingBotApp(load_settings()))
    return TestClient(app)


def test_dashboard_endpoint_returns_dashboard_payload(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.get(
        "/api/dashboard",
        params={"user_id": "user-123", "user_name": "Test Trader"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"]["exchange"] == "binance"
    assert payload["market"]["symbol"] == "BTC/USDT"
    assert payload["dashboard"]["activeStrategy"] == "grid"
    assert payload["dashboard"]["botStatus"] == "idle"
    assert payload["dashboard"]["capitalUsd"] == 100.0
    assert len(payload["dashboard"]["bots"]) == 3
    assert {bot["key"] for bot in payload["dashboard"]["bots"]} == {
        "grid",
        "rebalance",
        "infinity-grid",
    }
    assert payload["dashboard"]["events"][0]["title"] == "Paper wallet ready"


def test_swagger_endpoint_is_available(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.get("/swagger")

    assert response.status_code == 200
    assert "Swagger UI" in response.text


def test_paper_trading_endpoint_updates_dashboard_state(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.post(
        "/api/paper-trading/run",
        json={"strategy": "rebalance", "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dashboard"]["activeStrategy"] == "rebalance"
    assert payload["dashboard"]["botStatus"] == "paper-running"
    assert payload["dashboard"]["paperRunCount"] == 1

    rebalance_bot = next(
        bot for bot in payload["dashboard"]["bots"] if bot["key"] == "rebalance"
    )
    assert rebalance_bot["status"] == "paper-running"


def test_backtest_endpoint_returns_latest_summary(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.post(
        "/api/backtests/run",
        json={"strategy": "infinity-grid", "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["dashboard"]["lastBacktest"]
    assert summary is not None
    assert summary["strategy"] == "infinity-grid"
    assert summary["periodLabel"] == "Last 90 days"
    assert summary["trades"] >= 8


def test_deposit_endpoint_persists_balance_and_log(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    deposit_response = client.post(
        "/api/paper-trading/deposits",
        json={"amount_usd": 250, "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert deposit_response.status_code == 200
    deposit_payload = deposit_response.json()
    assert deposit_payload["dashboard"]["capitalUsd"] == 350.0
    assert deposit_payload["dashboard"]["events"][0]["title"] == "Deposit completed"

    dashboard_response = client.get(
        "/api/dashboard",
        params={"user_id": "user-123", "user_name": "Test Trader"},
    )

    assert dashboard_response.status_code == 200
    dashboard_payload = dashboard_response.json()
    assert dashboard_payload["dashboard"]["capitalUsd"] == 350.0
    assert dashboard_payload["dashboard"]["events"][0]["detail"].startswith(
        "Added $250.00 to the paper wallet."
    )
