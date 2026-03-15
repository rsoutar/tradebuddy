from __future__ import annotations

import sqlite3

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
    app = create_api(TradingBotApp(load_settings(), worker_autostart=False))
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
    assert payload["dashboard"]["activeStrategies"] == []
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


def test_create_bot_persists_active_strategy_and_trades(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "grid_config": {
                "lower_price": 62000,
                "upper_price": 72000,
                "grid_count": 6,
                "spacing_pct": 1.8,
                "stop_loss_enabled": True,
                "stop_loss_pct": 9.5,
            },
            "user_id": "user-123",
            "user_name": "Test Trader",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dashboard"]["botStatus"] == "paper-running"
    assert len(payload["dashboard"]["activeStrategies"]) == 1

    active_bot = payload["dashboard"]["activeStrategies"][0]
    assert active_bot["strategy"] == "grid"
    assert active_bot["tradeCount"] > 0
    assert "stop loss 9.5%" in active_bot["configSummary"]

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        bot_count = connection.execute("SELECT COUNT(*) FROM bot_instances").fetchone()[0]
        trade_count = connection.execute("SELECT COUNT(*) FROM paper_trades").fetchone()[0]

    assert bot_count == 1
    assert trade_count == active_bot["tradeCount"]


def test_trade_history_endpoint_returns_recorded_trades(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "grid_config": {
                "lower_price": 62000,
                "upper_price": 72000,
                "grid_count": 6,
                "spacing_pct": 1.8,
                "stop_loss_enabled": False,
            },
            "user_id": "user-123",
            "user_name": "Test Trader",
        },
    )

    response = client.get(
        "/api/trades",
        params={"user_id": "user-123", "user_name": "Test Trader"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["totalTrades"] > 0
    assert payload["summary"]["plannedTrades"] == payload["summary"]["totalTrades"]
    assert payload["summary"]["activeBotCount"] == 1
    assert payload["trades"][0]["botName"].startswith("Grid Bot #")
    assert payload["trades"][0]["strategy"] == "grid"
    assert payload["trades"][0]["status"] == "planned"


def test_bot_history_tracks_multiple_active_bots(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    first_response = client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "grid_config": {
                "lower_price": 62000,
                "upper_price": 72000,
                "grid_count": 6,
                "spacing_pct": 1.8,
                "stop_loss_enabled": False,
            },
            "user_id": "user-123",
            "user_name": "Test Trader",
        },
    )

    assert first_response.status_code == 200

    second_response = client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "grid_config": {
                "lower_price": 63000,
                "upper_price": 73000,
                "grid_count": 8,
                "spacing_pct": 2.0,
                "stop_loss_enabled": True,
                "stop_loss_pct": 9.5,
            },
            "user_id": "user-123",
            "user_name": "Test Trader",
        },
    )

    assert second_response.status_code == 200
    second_payload = second_response.json()
    assert len(second_payload["dashboard"]["activeStrategies"]) == 2
    assert second_payload["dashboard"]["activeStrategies"][0]["name"].endswith("#02")

    history_response = client.get(
        "/api/bots/history",
        params={"user_id": "user-123", "user_name": "Test Trader"},
    )

    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["summary"]["totalBots"] == 2
    assert history_payload["summary"]["activeBotCount"] == 2
    assert history_payload["summary"]["previousBotCount"] == 0
    assert history_payload["activeBots"][0]["name"].endswith("#02")
    assert history_payload["activeBots"][0]["status"] == "paper-running"
    assert history_payload["activeBots"][1]["name"].endswith("#01")
    assert history_payload["activeBots"][1]["status"] == "paper-running"
    assert history_payload["previousBots"] == []


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
