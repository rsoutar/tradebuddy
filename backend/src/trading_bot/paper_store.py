from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

from trading_bot.models import OrderIntent


DEFAULT_INITIAL_DEPOSIT_USD = 100.0


class PaperTradingStore:
    def __init__(self, database_path: Path) -> None:
        self._database_path = database_path
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS paper_accounts (
                    user_id TEXT PRIMARY KEY,
                    user_name TEXT NOT NULL,
                    usd_balance REAL NOT NULL,
                    active_strategy TEXT NOT NULL,
                    bot_status TEXT NOT NULL,
                    paper_run_count INTEGER NOT NULL,
                    last_paper_run_at TEXT,
                    last_backtest_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS paper_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    tone TEXT NOT NULL,
                    title TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    amount_usd REAL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES paper_accounts(user_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS bot_instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    strategy TEXT NOT NULL,
                    strategy_label TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    exchange TEXT NOT NULL,
                    status TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    stopped_at TEXT,
                    updated_at TEXT NOT NULL,
                    last_trade_at TEXT,
                    FOREIGN KEY(user_id) REFERENCES paper_accounts(user_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS paper_trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    bot_id INTEGER NOT NULL,
                    strategy TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    order_type TEXT NOT NULL,
                    amount REAL NOT NULL,
                    price REAL NOT NULL,
                    notional_usd REAL NOT NULL,
                    rationale TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES paper_accounts(user_id) ON DELETE CASCADE,
                    FOREIGN KEY(bot_id) REFERENCES bot_instances(id) ON DELETE CASCADE
                );
                """
            )

    def _insert_event(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        event_type: str,
        tone: str,
        title: str,
        detail: str,
        timestamp: str,
        amount_usd: Optional[float] = None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO paper_events (
                user_id,
                event_type,
                tone,
                title,
                detail,
                amount_usd,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, event_type, tone, title, detail, amount_usd, timestamp),
        )

    def _create_account(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        user_name: str,
        timestamp: str,
    ) -> sqlite3.Row:
        connection.execute(
            """
            INSERT INTO paper_accounts (
                user_id,
                user_name,
                usd_balance,
                active_strategy,
                bot_status,
                paper_run_count,
                last_paper_run_at,
                last_backtest_json,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, 'grid', 'idle', 0, NULL, NULL, ?, ?)
            """,
            (
                user_id,
                user_name,
                DEFAULT_INITIAL_DEPOSIT_USD,
                timestamp,
                timestamp,
            ),
        )
        self._insert_event(
            connection,
            user_id=user_id,
            event_type="initial_deposit",
            tone="positive",
            title="Paper wallet ready",
            detail="Initial deposit of $100.00 credited to the paper account.",
            amount_usd=DEFAULT_INITIAL_DEPOSIT_USD,
            timestamp=timestamp,
        )
        return connection.execute(
            "SELECT * FROM paper_accounts WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    def _ensure_account_row(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        user_name: str,
        timestamp: str,
    ) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM paper_accounts WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            return self._create_account(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )

        if row["user_name"] != user_name:
            connection.execute(
                """
                UPDATE paper_accounts
                SET user_name = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (user_name, timestamp, user_id),
            )
            row = connection.execute(
                "SELECT * FROM paper_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return row

    def _row_to_account_state(self, row: sqlite3.Row) -> dict[str, Any]:
        last_backtest = row["last_backtest_json"]
        return {
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "usd_balance": round(float(row["usd_balance"]), 2),
            "active_strategy": row["active_strategy"],
            "bot_status": row["bot_status"],
            "paper_run_count": int(row["paper_run_count"]),
            "last_paper_run_at": row["last_paper_run_at"],
            "last_backtest": json.loads(last_backtest) if last_backtest else None,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def ensure_account(self, *, user_id: str, user_name: str, timestamp: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = self._ensure_account_row(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )
            return self._row_to_account_state(row)

    def record_deposit(
        self,
        *,
        user_id: str,
        user_name: str,
        amount_usd: float,
        timestamp: str,
    ) -> dict[str, Any]:
        with self._connect() as connection:
            row = self._ensure_account_row(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )
            next_balance = round(float(row["usd_balance"]) + amount_usd, 2)
            connection.execute(
                """
                UPDATE paper_accounts
                SET usd_balance = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (next_balance, timestamp, user_id),
            )
            self._insert_event(
                connection,
                user_id=user_id,
                event_type="deposit",
                tone="positive",
                title="Deposit completed",
                detail=(
                    f"Added ${amount_usd:,.2f} to the paper wallet. "
                    f"Available cash is now ${next_balance:,.2f}."
                ),
                amount_usd=amount_usd,
                timestamp=timestamp,
            )
            row = connection.execute(
                "SELECT * FROM paper_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return self._row_to_account_state(row)

    def record_paper_run(
        self,
        *,
        user_id: str,
        user_name: str,
        strategy: str,
        strategy_label: str,
        timestamp: str,
    ) -> dict[str, Any]:
        with self._connect() as connection:
            row = self._ensure_account_row(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )
            connection.execute(
                """
                UPDATE paper_accounts
                SET active_strategy = ?,
                    bot_status = 'paper-running',
                    paper_run_count = ?,
                    last_paper_run_at = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (
                    strategy,
                    int(row["paper_run_count"]) + 1,
                    timestamp,
                    timestamp,
                    user_id,
                ),
            )
            self._insert_event(
                connection,
                user_id=user_id,
                event_type="paper_run",
                tone="positive",
                title=f"{strategy_label} paper run started",
                detail="Paper trading is active with simulated fills and live market snapshots.",
                timestamp=timestamp,
            )
            row = connection.execute(
                "SELECT * FROM paper_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return self._row_to_account_state(row)

    def record_bot_start(
        self,
        *,
        user_id: str,
        user_name: str,
        strategy: str,
        strategy_label: str,
        symbol: str,
        exchange: str,
        config: dict[str, Any],
        orders: list[OrderIntent],
        snapshot_price: float,
        timestamp: str,
    ) -> dict[str, Any]:
        with self._connect() as connection:
            row = self._ensure_account_row(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )
            instance_count = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM bot_instances
                WHERE user_id = ? AND strategy = ?
                """,
                (user_id, strategy),
            ).fetchone()["count"]
            bot_name = f"{strategy_label} #{int(instance_count) + 1:02d}"

            cursor = connection.execute(
                """
                INSERT INTO bot_instances (
                    user_id,
                    name,
                    strategy,
                    strategy_label,
                    symbol,
                    exchange,
                    status,
                    config_json,
                    created_at,
                    started_at,
                    stopped_at,
                    updated_at,
                    last_trade_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'paper-running', ?, ?, ?, NULL, ?, ?)
                """,
                (
                    user_id,
                    bot_name,
                    strategy,
                    strategy_label,
                    symbol,
                    exchange,
                    json.dumps(config, sort_keys=True),
                    timestamp,
                    timestamp,
                    timestamp,
                    timestamp if orders else None,
                ),
            )
            bot_id = int(cursor.lastrowid)

            for order in orders:
                execution_price = round(order.price or snapshot_price, 2)
                connection.execute(
                    """
                    INSERT INTO paper_trades (
                        user_id,
                        bot_id,
                        strategy,
                        symbol,
                        side,
                        order_type,
                        amount,
                        price,
                        notional_usd,
                        rationale,
                        status,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)
                    """,
                    (
                        user_id,
                        bot_id,
                        strategy,
                        order.symbol,
                        order.side.value,
                        order.order_type.value,
                        order.amount,
                        execution_price,
                        round(execution_price * order.amount, 2),
                        order.rationale,
                        timestamp,
                    ),
                )

            connection.execute(
                """
                UPDATE paper_accounts
                SET active_strategy = ?,
                    bot_status = 'paper-running',
                    paper_run_count = ?,
                    last_paper_run_at = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (
                    strategy,
                    int(row["paper_run_count"]) + 1,
                    timestamp,
                    timestamp,
                    user_id,
                ),
            )
            self._insert_event(
                connection,
                user_id=user_id,
                event_type="bot_started",
                tone="positive",
                title=f"{bot_name} started",
                detail=(
                    f"{strategy_label} is now active on {symbol}. "
                    f"{len(orders)} planned trade(s) were stored in the paper ledger."
                ),
                timestamp=timestamp,
            )
            row = connection.execute(
                "SELECT * FROM paper_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return self._row_to_account_state(row)

    def record_backtest(
        self,
        *,
        user_id: str,
        user_name: str,
        strategy: str,
        strategy_label: str,
        backtest_summary: dict[str, Any],
        tone: str,
        timestamp: str,
    ) -> dict[str, Any]:
        with self._connect() as connection:
            self._ensure_account_row(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )
            connection.execute(
                """
                UPDATE paper_accounts
                SET last_backtest_json = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (json.dumps(backtest_summary), timestamp, user_id),
            )
            self._insert_event(
                connection,
                user_id=user_id,
                event_type="backtest",
                tone=tone,
                title=f"{strategy_label} backtest completed",
                detail="A fresh strategy preview is available for the dashboard.",
                timestamp=timestamp,
            )
            row = connection.execute(
                "SELECT * FROM paper_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return self._row_to_account_state(row)

    def list_events(self, *, user_id: str, limit: int = 5) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, tone, title, detail, amount_usd, created_at
                FROM paper_events
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [
            {
                "id": f"evt-{row['id']}",
                "tone": row["tone"],
                "title": row["title"],
                "detail": row["detail"],
                "amountUsd": row["amount_usd"],
                "timestamp": row["created_at"],
            }
            for row in rows
        ]

    def list_active_strategies(self, *, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    b.id,
                    b.name,
                    b.strategy,
                    b.strategy_label,
                    b.symbol,
                    b.exchange,
                    b.status,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.updated_at,
                    b.last_trade_at,
                    COUNT(t.id) AS trade_count,
                    SUM(CASE WHEN t.side = 'buy' THEN 1 ELSE 0 END) AS buy_count,
                    SUM(CASE WHEN t.side = 'sell' THEN 1 ELSE 0 END) AS sell_count,
                    COALESCE(SUM(t.notional_usd), 0) AS total_notional_usd,
                    AVG(t.price) AS average_price
                FROM bot_instances b
                LEFT JOIN paper_trades t ON t.bot_id = b.id
                WHERE b.user_id = ? AND b.status = 'paper-running'
                GROUP BY
                    b.id,
                    b.name,
                    b.strategy,
                    b.strategy_label,
                    b.symbol,
                    b.exchange,
                    b.status,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.updated_at,
                    b.last_trade_at
                ORDER BY b.started_at DESC, b.id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [
            {
                "id": f"bot-{row['id']}",
                "name": row["name"],
                "strategy": row["strategy"],
                "strategyLabel": row["strategy_label"],
                "symbol": row["symbol"],
                "exchange": row["exchange"],
                "status": row["status"],
                "config": json.loads(row["config_json"]) if row["config_json"] else {},
                "createdAt": row["created_at"],
                "startedAt": row["started_at"],
                "updatedAt": row["updated_at"],
                "lastTradeAt": row["last_trade_at"],
                "tradeCount": int(row["trade_count"] or 0),
                "buyCount": int(row["buy_count"] or 0),
                "sellCount": int(row["sell_count"] or 0),
                "totalNotionalUsd": round(float(row["total_notional_usd"] or 0), 2),
                "averagePrice": round(float(row["average_price"] or 0), 2),
            }
            for row in rows
        ]

    def list_paper_trades(self, *, user_id: str, limit: int = 250) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    t.id,
                    t.bot_id,
                    b.name AS bot_name,
                    b.strategy_label,
                    b.config_json,
                    t.strategy,
                    t.symbol,
                    t.side,
                    t.order_type,
                    t.amount,
                    t.price,
                    t.notional_usd,
                    t.rationale,
                    t.status,
                    t.created_at
                FROM paper_trades t
                INNER JOIN bot_instances b ON b.id = t.bot_id
                WHERE t.user_id = ?
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [
            {
                "id": f"trade-{row['id']}",
                "botId": f"bot-{row['bot_id']}",
                "botName": row["bot_name"],
                "strategy": row["strategy"],
                "strategyLabel": row["strategy_label"],
                "config": json.loads(row["config_json"]) if row["config_json"] else {},
                "symbol": row["symbol"],
                "side": row["side"],
                "orderType": row["order_type"],
                "amount": round(float(row["amount"]), 6),
                "price": round(float(row["price"]), 2),
                "notionalUsd": round(float(row["notional_usd"]), 2),
                "rationale": row["rationale"],
                "status": row["status"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]
