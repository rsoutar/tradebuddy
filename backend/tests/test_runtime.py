from __future__ import annotations

from trading_bot.app import TradingBotApp
from trading_bot.runtime import utc_timestamp
from trading_bot.settings import load_settings


def build_app(monkeypatch, tmp_path, *, worker_autostart: bool) -> TradingBotApp:
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_KEY", raising=False)
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_SECRET", raising=False)
    monkeypatch.setenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "false")
    monkeypatch.setenv("TRADING_BOT_STATE_DIR", str(tmp_path / "state"))
    return TradingBotApp(load_settings(), enable_market_stream=False, worker_autostart=worker_autostart)


def seed_running_bot(app: TradingBotApp) -> str:
    timestamp = utc_timestamp()
    payload = app.paper_store.record_bot_start(
        user_id="user-123",
        user_name="Test Trader",
        strategy="grid",
        strategy_label="Grid Bot",
        symbol="BTC/USDT",
        exchange="Binance",
        config={
            "lower_price": 90000.0,
            "upper_price": 110000.0,
            "grid_count": 8,
            "spacing_pct": 2.0,
            "stop_at_upper_enabled": False,
            "stop_loss_enabled": False,
            "stop_loss_pct": None,
        },
        budget_usd=100.0,
        reserve_usd_balance=0.0,
        reserve_btc_balance=0.0,
        initial_usd_balance=100.0,
        initial_btc_balance=0.0,
        orders=[],
        snapshot_price=100000.0,
        timestamp=timestamp,
    )
    created_bot_id = payload.get("created_bot_id")
    assert isinstance(created_bot_id, str)
    return created_bot_id


def test_recover_running_bots_restarts_persisted_workers(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path, worker_autostart=False)
    bot_id = seed_running_bot(app)

    class FakeProcess:
        pid = 4321

    popen_calls: list[list[str]] = []

    def fake_popen(command, env):  # noqa: ANN001
        popen_calls.append(command)
        assert env["TRADING_BOT_MARKETDATA_WS_ENABLED"] == "false"
        return FakeProcess()

    monkeypatch.setattr("trading_bot.runtime.subprocess.Popen", fake_popen)

    recovering_app = build_app(monkeypatch, tmp_path, worker_autostart=True)
    recovered = recovering_app.recover_running_bots()

    assert recovered == [bot_id]
    assert len(popen_calls) == 1
    assert popen_calls[0][1:] == ["-m", "trading_bot.cli", "run-bot", "--bot-id", bot_id]
    restored_bot = recovering_app.paper_store.get_bot_instance(bot_id=bot_id)
    assert restored_bot is not None
    assert restored_bot["pid"] == 4321
    assert restored_bot["status"] == "paper-running"
    assert restored_bot["desiredStatus"] == "running"


def test_start_bot_does_not_trust_unrelated_reused_pid(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path, worker_autostart=False)
    bot_id = seed_running_bot(app)
    app.paper_store.mark_bot_process_started(bot_id=bot_id, pid=123, timestamp=utc_timestamp())

    class FakeProcess:
        pid = 6789

    def fake_popen(command, env):  # noqa: ANN001
        return FakeProcess()

    monkeypatch.setattr("trading_bot.runtime.is_process_alive", lambda pid: pid == 123)
    monkeypatch.setattr("trading_bot.runtime.read_process_cmdline", lambda pid: "python -m uvicorn")
    monkeypatch.setattr("trading_bot.runtime.subprocess.Popen", fake_popen)

    recovering_app = build_app(monkeypatch, tmp_path, worker_autostart=True)
    pid = recovering_app.process_manager.start_bot(bot_id)

    assert pid == 6789
    restored_bot = recovering_app.paper_store.get_bot_instance(bot_id=bot_id)
    assert restored_bot is not None
    assert restored_bot["pid"] == 6789
