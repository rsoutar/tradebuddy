from __future__ import annotations

from fastapi.testclient import TestClient

from trading_bot.api import create_api
from trading_bot.app import TradingBotApp
from trading_bot.settings import load_settings


def build_client(monkeypatch, tmp_path) -> TestClient:
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_KEY", raising=False)
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_SECRET", raising=False)
    monkeypatch.setenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "false")
    monkeypatch.setenv("TRADING_BOT_STATE_DIR", str(tmp_path / "state"))
    app = create_api(TradingBotApp(load_settings(), enable_market_stream=False, worker_autostart=False))
    return TestClient(app)


def test_upcheck_endpoint_returns_success(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.get("/up")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
