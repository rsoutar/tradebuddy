from __future__ import annotations

import json
import sqlite3

from fastapi.testclient import TestClient

from trading_bot.api import create_api
from trading_bot.app import TradingBotApp
from trading_bot.models import MarketSnapshot, StrategyType
from trading_bot.runtime import utc_timestamp
from trading_bot.services.historical_data import BinanceHistoricalKlineLoader
from trading_bot.services.market_data import write_shared_snapshot
from trading_bot.settings import load_settings


def write_history_archive(base_dir, name: str, rows: list[list[str]]) -> None:
    from zipfile import ZipFile

    target_dir = base_dir / "BTCUSDT" / "15m"
    target_dir.mkdir(parents=True, exist_ok=True)
    archive_path = target_dir / name
    csv_name = name.replace(".zip", ".csv")
    csv_payload = "\n".join(",".join(row) for row in rows)
    with ZipFile(archive_path, "w") as archive:
        archive.writestr(csv_name, csv_payload)


def build_client(monkeypatch, tmp_path, historical_loader=None) -> TestClient:
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_KEY", raising=False)
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_SECRET", raising=False)
    monkeypatch.delenv("TRADING_BOT_API_CORS_ORIGINS", raising=False)
    monkeypatch.setenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "false")
    monkeypatch.setenv("TRADING_BOT_STATE_DIR", str(tmp_path / "state"))
    app = create_api(
        TradingBotApp(
            load_settings(),
            worker_autostart=False,
            historical_loader=historical_loader,
        )
    )
    return TestClient(app)


def build_app(monkeypatch, tmp_path) -> TradingBotApp:
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_KEY", raising=False)
    monkeypatch.delenv("TRADING_BOT_EXCHANGE_API_SECRET", raising=False)
    monkeypatch.setenv("TRADING_BOT_MARKETDATA_WS_ENABLED", "false")
    monkeypatch.setenv("TRADING_BOT_STATE_DIR", str(tmp_path / "state"))
    return TradingBotApp(load_settings(), enable_market_stream=False, worker_autostart=False)


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
    assert payload["connection"]["transport"] == "rest"
    assert payload["connection"]["configured_streams"] == 0
    assert payload["dashboard"]["activeStrategy"] == "grid"
    assert payload["dashboard"]["botStatus"] == "idle"
    assert payload["dashboard"]["capitalUsd"] == 100.0
    assert payload["dashboard"]["availableBtc"] == 0.0
    assert len(payload["dashboard"]["bots"]) == 3
    assert payload["dashboard"]["activeStrategies"] == []
    assert {bot["key"] for bot in payload["dashboard"]["bots"]} == {
        "grid",
        "rebalance",
        "infinity-grid",
    }
    assert payload["dashboard"]["events"] == []
    assert payload["dashboard"]["profit24hUsd"] == 0.0
    assert payload["dashboard"]["portfolioPerformance"] == [
        {
            "equityUsd": 0.0,
            "timestamp": payload["dashboard"]["portfolioPerformance"][0]["timestamp"],
        }
    ]


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
    history_dir = tmp_path / "history"
    write_history_archive(
        history_dir,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "108.0",
                "99.0",
                "107.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "107.0",
                "114.0",
                "106.0",
                "112.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )
    client = build_client(
        monkeypatch,
        tmp_path,
        historical_loader=BinanceHistoricalKlineLoader(data_dir=history_dir),
    )

    response = client.post(
        "/api/backtests/run",
        json={
            "strategy": "infinity-grid",
            "user_id": "user-123",
            "user_name": "Test Trader",
            "start_at": "2024-01-01T00:00:00+00:00",
            "end_at": "2024-01-01T00:30:00+00:00",
            "initial_capital_usd": 250,
            "fee_rate": 0.0,
            "slippage_rate": 0.0,
            "infinity_config": {
                "reference_price": 100,
                "spacing_pct": 4,
                "order_size_usd": 25,
                "levels_per_side": 3,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["dashboard"]["lastBacktest"]
    assert summary is not None
    assert summary["strategy"] == "infinity-grid"
    assert summary["periodLabel"] == "2024-01-01 to 2024-01-01"
    assert summary["trades"] >= 1
    assert summary["startEquityUsd"] == 250.0
    assert summary["feeRate"] == 0.0
    assert summary["slippageRate"] == 0.0


def test_grid_backtest_endpoint_replays_historical_candles(monkeypatch, tmp_path) -> None:
    history_dir = tmp_path / "history"
    write_history_archive(
        history_dir,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "111.0",
                "89.0",
                "105.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "105.0",
                "112.0",
                "94.0",
                "110.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )
    client = build_client(
        monkeypatch,
        tmp_path,
        historical_loader=BinanceHistoricalKlineLoader(data_dir=history_dir),
    )

    response = client.post(
        "/api/backtests/run",
        json={"strategy": "grid", "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["dashboard"]["lastBacktest"]
    assert summary is not None
    assert summary["strategy"] == "grid"
    assert summary["trades"] >= 2
    assert summary["periodLabel"] == "2024-01-01 to 2024-01-01"
    assert summary["finalEquityUsd"] > summary["startEquityUsd"]


def test_grid_backtest_endpoint_accepts_custom_parameters(monkeypatch, tmp_path) -> None:
    history_dir = tmp_path / "history"
    write_history_archive(
        history_dir,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "111.0",
                "89.0",
                "105.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "105.0",
                "112.0",
                "94.0",
                "110.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )
    client = build_client(
        monkeypatch,
        tmp_path,
        historical_loader=BinanceHistoricalKlineLoader(data_dir=history_dir),
    )

    response = client.post(
        "/api/backtests/run",
        json={
            "strategy": "grid",
            "user_id": "user-123",
            "user_name": "Test Trader",
            "start_at": "2024-01-01T00:00:00+00:00",
            "end_at": "2024-01-01T00:30:00+00:00",
            "initial_capital_usd": 250,
            "fee_rate": 0.0,
            "slippage_rate": 0.0,
            "grid_config": {
                "lower_price": 90,
                "upper_price": 110,
                "grid_count": 3,
                "spacing_pct": 10,
                "stop_loss_enabled": True,
                "stop_loss_pct": 5,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["dashboard"]["lastBacktest"]
    assert summary is not None
    assert summary["startEquityUsd"] == 250.0
    assert summary["feeRate"] == 0.0
    assert summary["slippageRate"] == 0.0
    assert summary["trades"] >= 2


def test_rebalance_backtest_endpoint_accepts_custom_parameters(monkeypatch, tmp_path) -> None:
    history_dir = tmp_path / "history"
    write_history_archive(
        history_dir,
        "BTCUSDT-15m-2024-01.zip",
        [
            [
                "1704067200000",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "100.0",
                "1704068099999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704068100000",
                "100.0",
                "140.0",
                "100.0",
                "140.0",
                "100.0",
                "1704068999999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
            [
                "1704069000000",
                "140.0",
                "140.0",
                "70.0",
                "70.0",
                "100.0",
                "1704069899999",
                "10000.0",
                "100",
                "50.0",
                "5000.0",
                "0",
            ],
        ],
    )
    client = build_client(
        monkeypatch,
        tmp_path,
        historical_loader=BinanceHistoricalKlineLoader(data_dir=history_dir),
    )

    response = client.post(
        "/api/backtests/run",
        json={
            "strategy": "rebalance",
            "user_id": "user-123",
            "user_name": "Test Trader",
            "start_at": "2024-01-01T00:00:00+00:00",
            "end_at": "2024-01-01T00:45:00+00:00",
            "initial_capital_usd": 250,
            "fee_rate": 0.0,
            "slippage_rate": 0.0,
            "rebalance_config": {
                "target_btc_ratio": 0.5,
                "rebalance_threshold_pct": 5,
                "interval_minutes": 15,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["dashboard"]["lastBacktest"]
    assert summary is not None
    assert summary["strategy"] == "rebalance"
    assert summary["startedAt"] == "2024-01-01T00:00:00+00:00"
    assert summary["startEquityUsd"] == 250.0
    assert summary["feeRate"] == 0.0
    assert summary["slippageRate"] == 0.0
    assert summary["trades"] >= 2


def test_create_bot_persists_active_strategy_and_trades(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    deposit_response = client.post(
        "/api/paper-trading/deposits",
        json={"amount_usd": 200, "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert deposit_response.status_code == 200

    response = client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "budget_usd": 150,
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
    assert active_bot["budgetUsd"] == 150.0
    assert active_bot["tradeCount"] == 0
    assert active_bot["totalNotionalUsd"] == 0.0
    assert active_bot["currentEquityUsd"] == 150.0
    assert active_bot["unrealizedPnlUsd"] == 0.0
    assert active_bot["lastTradeAt"] is None
    assert "stop loss 9.5%" in active_bot["configSummary"]

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        bot_count = connection.execute("SELECT COUNT(*) FROM bot_instances").fetchone()[0]
        trade_count = connection.execute("SELECT COUNT(*) FROM paper_trades").fetchone()[0]

    assert bot_count == 1
    assert trade_count > active_bot["tradeCount"]


def test_create_rebalance_bot_persists_custom_config(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    response = client.post(
        "/api/bots",
        json={
            "strategy": "rebalance",
            "budget_usd": 100,
            "rebalance_config": {
                "target_btc_ratio": 0.6,
                "rebalance_threshold_pct": 3.5,
                "interval_minutes": 30,
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
    assert active_bot["strategy"] == "rebalance"
    assert active_bot["tradeCount"] == 0
    assert "Target BTC 60%" in active_bot["configSummary"]
    assert "3.5% drift threshold" in active_bot["configSummary"]


def test_create_infinity_grid_bot_persists_custom_config(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    deposit_response = client.post(
        "/api/paper-trading/deposits",
        json={"amount_usd": 1400, "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert deposit_response.status_code == 200

    response = client.post(
        "/api/bots",
        json={
            "strategy": "infinity-grid",
            "budget_usd": 1250,
            "infinity_config": {
                "reference_price": 62000,
                "spacing_pct": 1.5,
                "order_size_usd": 125,
                "levels_per_side": 5,
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
    assert active_bot["strategy"] == "infinity-grid"
    assert active_bot["tradeCount"] == 0
    assert active_bot["budgetUsd"] == 1250.0
    assert active_bot["currentEquityUsd"] == 1250.0
    assert active_bot["totalNotionalUsd"] == 625.0
    assert active_bot["unrealizedPnlUsd"] == 0.0
    assert "Reference $62,000" in active_bot["configSummary"]
    assert "5 levels per side" in active_bot["configSummary"]
    assert "$125 per order" in active_bot["configSummary"]


def test_grid_bot_cycle_fills_buy_limit_after_price_trades_down(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"
    app.deposit_paper_funds(150, user_id="user-123", user_name="Test Trader")

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=74000.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.GRID,
        budget_usd=150,
        user_id="user-123",
        user_name="Test Trader",
        grid_config={
            "lower_price": 70000,
            "upper_price": 80000,
            "grid_count": 10,
            "spacing_pct": 1.0,
            "stop_loss_enabled": False,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=73500.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="dip",
        ),
    )
    cycle = app.process_bot_cycle(bot_id)

    assert len(cycle["filledOrders"]) == 1
    assert cycle["filledOrders"][0]["side"] == "buy"
    assert cycle["filledOrders"][0]["price"] == 73570.7

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_count = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE status = 'filled'"
        ).fetchone()[0]
        rearmed_sell = connection.execute(
            """
            SELECT COUNT(*)
            FROM paper_trades
            WHERE bot_id = 1 AND status = 'planned' AND side = 'sell' AND price = 74306.41
            """
        ).fetchone()[0]
        usd_balance, btc_balance = connection.execute(
            "SELECT usd_balance, btc_balance FROM bot_instances WHERE id = 1"
        ).fetchone()

    assert filled_count == 1
    assert rearmed_sell == 1
    assert usd_balance < 150.0
    assert btc_balance > 0.0


def test_grid_bot_cycle_does_not_fill_buy_limit_while_price_is_above_it(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"
    app.deposit_paper_funds(150, user_id="user-123", user_name="Test Trader")

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=74000.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.GRID,
        budget_usd=150,
        user_id="user-123",
        user_name="Test Trader",
        grid_config={
            "lower_price": 70000,
            "upper_price": 80000,
            "grid_count": 10,
            "spacing_pct": 1.0,
            "stop_loss_enabled": False,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=73800.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="bounce",
        ),
    )
    cycle = app.process_bot_cycle(bot_id)

    assert cycle["filledOrders"] == []

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_count = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE status = 'filled'"
        ).fetchone()[0]

    assert filled_count == 0


def test_grid_bot_cycle_skips_stale_snapshot_instead_of_using_mock_price(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"
    app.deposit_paper_funds(250, user_id="user-123", user_name="Test Trader")

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=73800.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.GRID,
        budget_usd=250,
        user_id="user-123",
        user_name="Test Trader",
        grid_config={
            "lower_price": 60000,
            "upper_price": 85000,
            "grid_count": 30,
            "spacing_pct": 2.0,
            "stop_loss_enabled": False,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    stale_payload = json.loads(snapshot_path.read_text())
    stale_payload["written_at"] = 0
    snapshot_path.write_text(json.dumps(stale_payload))

    cycle = app.process_bot_cycle(bot_id)

    assert cycle["filledOrders"] == []
    assert cycle["skippedReason"] == "Fresh shared market snapshot unavailable."

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_count = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE status = 'filled'"
        ).fetchone()[0]

    assert filled_count == 0


def test_infinity_grid_bot_cycle_fills_buy_and_rearms_sell(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=105.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.INFINITY_GRID,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        infinity_config={
            "reference_price": 100,
            "spacing_pct": 10,
            "order_size_usd": 20,
            "levels_per_side": 2,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=99.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="pullback",
        ),
    )
    cycle = app.process_bot_cycle(bot_id)

    assert len(cycle["filledOrders"]) == 1
    assert cycle["filledOrders"][0]["side"] == "buy"
    assert cycle["filledOrders"][0]["price"] == 100.0

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_count = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE status = 'filled'"
        ).fetchone()[0]
        planned_sell_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM paper_trades
            WHERE bot_id = 1 AND status = 'planned' AND side = 'sell'
            """
        ).fetchone()[0]
        same_level_sell_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM paper_trades
            WHERE bot_id = 1 AND status = 'planned' AND side = 'sell' AND price = 100.0
            """
        ).fetchone()[0]
        usd_balance, btc_balance = connection.execute(
            "SELECT usd_balance, btc_balance FROM bot_instances WHERE id = 1"
        ).fetchone()

    assert filled_count == 1
    assert planned_sell_count >= 1
    assert same_level_sell_count == 0
    assert usd_balance < 100.0
    assert btc_balance > 0.0


def test_infinity_grid_bot_does_not_rebuy_same_level_without_higher_sell(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=105.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.INFINITY_GRID,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        infinity_config={
            "reference_price": 100,
            "spacing_pct": 10,
            "order_size_usd": 20,
            "levels_per_side": 2,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]
    app.paper_store.mark_bot_process_started(
        bot_id=bot_id,
        pid=123,
        timestamp=utc_timestamp(),
    )

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=99.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="pullback",
        ),
    )
    first_cycle = app.process_bot_cycle(bot_id)
    assert len(first_cycle["filledOrders"]) == 1
    assert first_cycle["filledOrders"][0]["side"] == "buy"
    assert first_cycle["filledOrders"][0]["price"] == 100.0

    app.paper_store.record_bot_heartbeat(
        bot_id=bot_id,
        pid=123,
        timestamp=utc_timestamp(),
        last_trade_at=first_cycle["lastTradeAt"],
    )

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=101.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="bounce",
        ),
    )
    second_cycle = app.process_bot_cycle(bot_id)
    assert second_cycle["filledOrders"] == []

    app.paper_store.record_bot_heartbeat(
        bot_id=bot_id,
        pid=123,
        timestamp=utc_timestamp(),
        last_trade_at=second_cycle["lastTradeAt"],
    )

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=99.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="retest",
        ),
    )
    third_cycle = app.process_bot_cycle(bot_id)

    assert third_cycle["filledOrders"] == []

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_buy_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM paper_trades
            WHERE bot_id = 1 AND status = 'filled' AND side = 'buy' AND price = 100.0
            """
        ).fetchone()[0]
        planned_buy_same_level = connection.execute(
            """
            SELECT COUNT(*)
            FROM paper_trades
            WHERE bot_id = 1 AND status = 'planned' AND side = 'buy' AND price = 100.0
            """
        ).fetchone()[0]

    assert filled_buy_count == 1
    assert planned_buy_same_level == 0


def test_rebalance_bot_cycle_fills_order_and_clears_planned_when_target_reached(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=100.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.REBALANCE,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        rebalance_config={
            "target_btc_ratio": 0.5,
            "rebalance_threshold_pct": 5.0,
            "interval_minutes": 60,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=99.8,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="dip",
        ),
    )
    cycle = app.process_bot_cycle(bot_id)

    assert cycle["filledOrders"] == []

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_count = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE status = 'filled'"
        ).fetchone()[0]
        remaining_planned = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE bot_id = 1 AND status = 'planned'"
        ).fetchone()[0]
        usd_balance, btc_balance = connection.execute(
            "SELECT usd_balance, btc_balance FROM bot_instances WHERE id = 1"
        ).fetchone()

    assert filled_count == 0
    assert remaining_planned == 0
    assert usd_balance == 50.0
    assert btc_balance == 0.5


def test_rebalance_bot_cycle_fills_after_dip_and_rebound_between_polls(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=100.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.REBALANCE,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        rebalance_config={
            "target_btc_ratio": 0.5,
            "rebalance_threshold_pct": 5.0,
            "interval_minutes": 60,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=99.8,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="dip",
        ),
    )
    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=100.2,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="rebound",
        ),
    )
    cycle = app.process_bot_cycle(bot_id)

    assert cycle["filledOrders"] == []

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        filled_count = connection.execute(
            "SELECT COUNT(*) FROM paper_trades WHERE status = 'filled'"
        ).fetchone()[0]

    assert filled_count == 0


def test_trade_history_endpoint_returns_recorded_trades(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    deposit_response = client.post(
        "/api/paper-trading/deposits",
        json={"amount_usd": 200, "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert deposit_response.status_code == 200

    client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "budget_usd": 150,
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
    assert payload["summary"]["pendingTrades"] == payload["summary"]["totalTrades"]
    assert payload["summary"]["activeBotCount"] == 1
    assert payload["trades"][0]["botName"].startswith("Grid Bot #")
    assert payload["trades"][0]["strategy"] == "grid"
    assert payload["trades"][0]["status"] == "pending"


def test_bot_history_tracks_multiple_active_bots(monkeypatch, tmp_path) -> None:
    client = build_client(monkeypatch, tmp_path)

    deposit_response = client.post(
        "/api/paper-trading/deposits",
        json={"amount_usd": 200, "user_id": "user-123", "user_name": "Test Trader"},
    )

    assert deposit_response.status_code == 200

    first_response = client.post(
        "/api/bots",
        json={
            "strategy": "grid",
            "budget_usd": 150,
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
            "budget_usd": 150,
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
    assert history_payload["activeBots"][0]["tradeCount"] == 0
    assert history_payload["activeBots"][0]["unrealizedPnlUsd"] == 0.0
    assert history_payload["activeBots"][1]["name"].endswith("#01")
    assert history_payload["activeBots"][1]["status"] == "paper-running"
    assert history_payload["previousBots"] == []


def test_stopped_bot_releases_btc_reserve_for_next_bot(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=100.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.INFINITY_GRID,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        infinity_config={
            "reference_price": 100,
            "spacing_pct": 10,
            "order_size_usd": 20,
            "levels_per_side": 2,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    app.paper_store.mark_bot_stopped(bot_id=bot_id, timestamp=utc_timestamp())

    account_state = app.paper_store.ensure_account(
        user_id="user-123",
        user_name="Test Trader",
        timestamp=utc_timestamp(),
    )
    assert account_state["usd_balance"] == 30.0
    assert account_state["btc_balance"] == 0.7

    next_dashboard = app.create_bot(
        StrategyType.REBALANCE,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        rebalance_config={
            "target_btc_ratio": 0.5,
            "rebalance_threshold_pct": 5.0,
            "interval_minutes": 60,
        },
    )

    assert next_dashboard["dashboard"]["availableReserveUsd"] == 0.0
    assert len(next_dashboard["dashboard"]["activeStrategies"]) == 1


def test_crashed_bot_releases_btc_reserve_for_next_bot(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=100.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.INFINITY_GRID,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        infinity_config={
            "reference_price": 100,
            "spacing_pct": 10,
            "order_size_usd": 20,
            "levels_per_side": 2,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    app.paper_store.mark_bot_crashed(
        bot_id=bot_id,
        error="Simulated worker failure.",
        timestamp=utc_timestamp(),
    )

    account_state = app.paper_store.ensure_account(
        user_id="user-123",
        user_name="Test Trader",
        timestamp=utc_timestamp(),
    )
    assert account_state["usd_balance"] == 30.0
    assert account_state["btc_balance"] == 0.7

    next_dashboard = app.create_bot(
        StrategyType.REBALANCE,
        budget_usd=100,
        user_id="user-123",
        user_name="Test Trader",
        rebalance_config={
            "target_btc_ratio": 0.5,
            "rebalance_threshold_pct": 5.0,
            "interval_minutes": 60,
        },
    )

    assert next_dashboard["dashboard"]["availableReserveUsd"] == 0.0
    assert len(next_dashboard["dashboard"]["activeStrategies"]) == 1


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


def test_dashboard_profit_and_performance_ignore_deposits_and_dashboard_reads(monkeypatch, tmp_path) -> None:
    app = build_app(monkeypatch, tmp_path)
    snapshot_path = tmp_path / "state" / "market_snapshot.json"

    app.deposit_paper_funds(5000, user_id="user-123", user_name="Test Trader")

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=100.0,
            change_24h_pct=0.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="flat",
        ),
    )
    app.create_bot(
        StrategyType.REBALANCE,
        budget_usd=1000,
        user_id="user-123",
        user_name="Test Trader",
        rebalance_config={
            "target_btc_ratio": 0.5,
            "rebalance_threshold_pct": 5.0,
            "interval_minutes": 60,
        },
    )
    bot_id = app.paper_store.list_bot_instances(user_id="user-123")[0]["id"]

    write_shared_snapshot(
        snapshot_path,
        MarketSnapshot(
            symbol="BTC/USDT",
            price=110.0,
            change_24h_pct=10.0,
            volume_24h=0.0,
            volatility_24h_pct=0.0,
            trend="up",
        ),
    )
    app.process_bot_cycle(bot_id)

    database_path = tmp_path / "state" / "paper_trading.sqlite3"
    with sqlite3.connect(database_path) as connection:
        snapshot_count_before_dashboard = connection.execute(
            "SELECT COUNT(*) FROM portfolio_snapshots"
        ).fetchone()[0]

    payload = app.dashboard(user_id="user-123", user_name="Test Trader")

    with sqlite3.connect(database_path) as connection:
        snapshot_count_after_dashboard = connection.execute(
            "SELECT COUNT(*) FROM portfolio_snapshots"
        ).fetchone()[0]

    assert snapshot_count_after_dashboard == snapshot_count_before_dashboard
    assert payload["dashboard"]["capitalUsd"] == 5150.0
    assert payload["dashboard"]["profit24hUsd"] == 50.0
    assert payload["dashboard"]["profit24hPct"] == 0.98
    assert payload["dashboard"]["portfolioPerformance"][-1]["equityUsd"] == 50.0
