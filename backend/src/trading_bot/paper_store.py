from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

from trading_bot.models import GridBotConfig, InfinityGridBotConfig, OrderIntent, OrderSide


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
                    btc_balance REAL NOT NULL DEFAULT 0,
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
                    budget_usd REAL NOT NULL DEFAULT 0,
                    usd_balance REAL NOT NULL DEFAULT 0,
                    btc_balance REAL NOT NULL DEFAULT 0,
                    initial_usd_balance REAL NOT NULL DEFAULT 0,
                    initial_btc_balance REAL NOT NULL DEFAULT 0,
                    initial_btc_cost_usd REAL NOT NULL DEFAULT 0,
                    released_usd_balance REAL NOT NULL DEFAULT 0,
                    released_btc_balance REAL NOT NULL DEFAULT 0,
                    released_to_account INTEGER NOT NULL DEFAULT 0,
                    config_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    stopped_at TEXT,
                    desired_status TEXT NOT NULL DEFAULT 'running',
                    pid INTEGER,
                    heartbeat_at TEXT,
                    last_error TEXT,
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

                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    total_equity_usd REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES paper_accounts(user_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS chat_conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tool_name TEXT,
                    tool_args_json TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
                );
                """
            )
            self._ensure_column(connection, "paper_accounts", "btc_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "desired_status", "TEXT NOT NULL DEFAULT 'running'")
            self._ensure_column(connection, "bot_instances", "pid", "INTEGER")
            self._ensure_column(connection, "bot_instances", "heartbeat_at", "TEXT")
            self._ensure_column(connection, "bot_instances", "last_error", "TEXT")
            self._ensure_column(connection, "bot_instances", "budget_usd", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "usd_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "btc_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "initial_usd_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "initial_btc_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "initial_btc_cost_usd", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "released_usd_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "released_btc_balance", "REAL NOT NULL DEFAULT 0")
            self._ensure_column(connection, "bot_instances", "released_to_account", "INTEGER NOT NULL DEFAULT 0")

    def _ensure_column(
        self,
        connection: sqlite3.Connection,
        table_name: str,
        column_name: str,
        declaration: str,
    ) -> None:
        columns = {
            row["name"]
            for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        if column_name in columns:
            return
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {declaration}")

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

    def _insert_portfolio_snapshot(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        total_equity_usd: float,
        timestamp: str,
    ) -> None:
        connection.execute(
            """
            INSERT INTO portfolio_snapshots (user_id, total_equity_usd, created_at)
            VALUES (?, ?, ?)
            """,
            (user_id, round(total_equity_usd, 2), timestamp),
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
                btc_balance,
                active_strategy,
                bot_status,
                paper_run_count,
                last_paper_run_at,
                last_backtest_json,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, 'grid', 'idle', 0, NULL, NULL, ?, ?)
            """,
            (
                user_id,
                user_name,
                DEFAULT_INITIAL_DEPOSIT_USD,
                0.0,
                timestamp,
                timestamp,
            ),
        )
        self._insert_portfolio_snapshot(
            connection,
            user_id=user_id,
            total_equity_usd=DEFAULT_INITIAL_DEPOSIT_USD,
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
            "btc_balance": round(float(row["btc_balance"]), 8),
            "active_strategy": row["active_strategy"],
            "bot_status": row["bot_status"],
            "paper_run_count": int(row["paper_run_count"]),
            "last_paper_run_at": row["last_paper_run_at"],
            "last_backtest": json.loads(last_backtest) if last_backtest else None,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _refresh_account_bot_status(
        self,
        connection: sqlite3.Connection,
        *,
        user_id: str,
        timestamp: str,
    ) -> None:
        running_count = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM bot_instances
            WHERE user_id = ? AND status = 'paper-running'
            """,
            (user_id,),
        ).fetchone()["count"]
        next_status = "paper-running" if int(running_count or 0) > 0 else "idle"
        connection.execute(
            """
            UPDATE paper_accounts
            SET bot_status = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (next_status, timestamp, user_id),
        )

    def ensure_account(self, *, user_id: str, user_name: str, timestamp: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = self._ensure_account_row(
                connection,
                user_id=user_id,
                user_name=user_name,
                timestamp=timestamp,
            )
            return self._row_to_account_state(row)

    def record_portfolio_snapshot(
        self,
        *,
        user_id: str,
        total_equity_usd: float,
        timestamp: str,
    ) -> None:
        with self._connect() as connection:
            self._insert_portfolio_snapshot(
                connection,
                user_id=user_id,
                total_equity_usd=total_equity_usd,
                timestamp=timestamp,
            )

    def list_portfolio_snapshots(self, *, user_id: str, limit: int = 96) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT total_equity_usd, created_at
                FROM (
                    SELECT total_equity_usd, created_at, id
                    FROM portfolio_snapshots
                    WHERE user_id = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                )
                ORDER BY created_at ASC, id ASC
                """,
                (user_id, limit),
            ).fetchall()

        return [
            {
                "equityUsd": round(float(row["total_equity_usd"]), 2),
                "timestamp": row["created_at"],
            }
            for row in rows
        ]

    def reserve_equity_usd(self, *, user_id: str, price: float) -> float:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT usd_balance, btc_balance
                FROM paper_accounts
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        if row is None:
            return 0.0
        return round(float(row["usd_balance"]) + (float(row["btc_balance"]) * price), 2)

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
        budget_usd: float,
        reserve_usd_balance: float,
        reserve_btc_balance: float,
        initial_usd_balance: float,
        initial_btc_balance: float,
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
                    budget_usd,
                    usd_balance,
                    btc_balance,
                    initial_usd_balance,
                    initial_btc_balance,
                    initial_btc_cost_usd,
                    released_usd_balance,
                    released_btc_balance,
                    released_to_account,
                    config_json,
                    created_at,
                    started_at,
                    stopped_at,
                    updated_at,
                    last_trade_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'paper-running', ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    user_id,
                    bot_name,
                    strategy,
                    strategy_label,
                    symbol,
                    exchange,
                    round(budget_usd, 2),
                    round(initial_usd_balance, 8),
                    round(initial_btc_balance, 8),
                    round(initial_usd_balance, 8),
                    round(initial_btc_balance, 8),
                    round(max(budget_usd - initial_usd_balance, 0.0), 8),
                    json.dumps(config, sort_keys=True),
                    timestamp,
                    timestamp,
                    timestamp,
                    None,
                ),
            )
            bot_id = int(cursor.lastrowid)
            connection.execute(
                """
                UPDATE bot_instances
                SET desired_status = 'running'
                WHERE id = ?
                """,
                (bot_id,),
            )

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
                SET usd_balance = ?,
                    btc_balance = ?,
                    active_strategy = ?,
                    bot_status = 'paper-running',
                    paper_run_count = ?,
                    last_paper_run_at = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (
                    round(reserve_usd_balance, 8),
                    round(reserve_btc_balance, 8),
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
                    f"{strategy_label} is now active on {symbol} with ${budget_usd:,.2f} reserved. "
                    f"{len(orders)} planned trade(s) were stored in the paper ledger."
                ),
                timestamp=timestamp,
                amount_usd=budget_usd,
            )
            row = connection.execute(
                "SELECT * FROM paper_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            payload = self._row_to_account_state(row)
            payload["created_bot_id"] = f"bot-{bot_id}"
            return payload

    def fill_triggered_grid_orders(
        self,
        *,
        bot_id: str,
        market_price: float,
        timestamp: str,
    ) -> list[dict[str, Any]]:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        filled_orders: list[dict[str, Any]] = []

        with self._connect() as connection:
            bot_row = connection.execute(
                """
                SELECT
                    b.id,
                    b.user_id,
                    b.name,
                    b.strategy,
                    b.symbol,
                    b.config_json,
                    b.usd_balance,
                    b.btc_balance
                FROM bot_instances b
                WHERE b.id = ? AND b.status = 'paper-running'
                """,
                (numeric_id,),
            ).fetchone()
            if bot_row is None or bot_row["strategy"] != "grid":
                return []

            config = GridBotConfig(**json.loads(bot_row["config_json"]))
            levels = [round(level, 2) for level in config.price_levels()]
            level_index = {level: index for index, level in enumerate(levels)}
            usd_balance = float(bot_row["usd_balance"])
            btc_balance = float(bot_row["btc_balance"])

            planned_rows = connection.execute(
                """
                SELECT id, side, amount, price, notional_usd
                FROM paper_trades
                WHERE bot_id = ? AND status = 'planned'
                ORDER BY
                    CASE side WHEN 'buy' THEN price END DESC,
                    CASE side WHEN 'sell' THEN price END ASC,
                    id ASC
                """,
                (numeric_id,),
            ).fetchall()

            for row in planned_rows:
                side = row["side"]
                price = round(float(row["price"]), 2)
                amount = float(row["amount"])
                notional_usd = round(float(row["notional_usd"]), 2)

                is_triggered = (
                    side == OrderSide.BUY.value and market_price <= price
                ) or (
                    side == OrderSide.SELL.value and market_price >= price
                )
                if not is_triggered:
                    continue

                if side == OrderSide.BUY.value and usd_balance + 1e-9 < notional_usd:
                    continue
                if side == OrderSide.SELL.value and btc_balance + 1e-9 < amount:
                    continue

                connection.execute(
                    """
                    UPDATE paper_trades
                    SET status = 'filled',
                        created_at = ?
                    WHERE id = ?
                    """,
                    (timestamp, row["id"]),
                )

                if side == OrderSide.BUY.value:
                    usd_balance = round(usd_balance - notional_usd, 8)
                    btc_balance = round(btc_balance + amount, 8)
                    rearm_side = OrderSide.SELL.value
                    rearm_index = level_index.get(price, -1) + 1
                    rearm_rationale = "Take profit on the next higher grid level after a filled buy."
                    event_detail = (
                        f"Paper buy filled at ${price:,.2f} as BTC/USDT traded down into the grid."
                    )
                else:
                    usd_balance = round(usd_balance + notional_usd, 8)
                    btc_balance = round(max(btc_balance - amount, 0.0), 8)
                    rearm_side = OrderSide.BUY.value
                    rearm_index = level_index.get(price, len(levels)) - 1
                    rearm_rationale = "Re-arm the lower grid bid after taking profit on the sell."
                    event_detail = (
                        f"Paper sell filled at ${price:,.2f} as BTC/USDT traded up through the grid."
                    )

                self._insert_event(
                    connection,
                    user_id=bot_row["user_id"],
                    event_type="bot_fill",
                    tone="positive",
                    title=f"{bot_row['name']} filled {side}",
                    detail=event_detail,
                    amount_usd=notional_usd,
                    timestamp=timestamp,
                )

                filled_orders.append(
                    {
                        "tradeId": f"trade-{row['id']}",
                        "side": side,
                        "price": price,
                        "amount": round(amount, 6),
                        "notionalUsd": notional_usd,
                    }
                )

                if 0 <= rearm_index < len(levels):
                    rearm_price = levels[rearm_index]
                    existing_planned = connection.execute(
                        """
                        SELECT 1
                        FROM paper_trades
                        WHERE bot_id = ? AND status = 'planned' AND side = ? AND price = ?
                        LIMIT 1
                        """,
                        (numeric_id, rearm_side, rearm_price),
                    ).fetchone()
                    if existing_planned is None:
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
                            VALUES (?, ?, 'grid', ?, ?, 'limit', ?, ?, ?, ?, 'planned', ?)
                            """,
                            (
                                bot_row["user_id"],
                                numeric_id,
                                bot_row["symbol"],
                                rearm_side,
                                round(amount, 6),
                                rearm_price,
                                round(rearm_price * amount, 2),
                                rearm_rationale,
                                timestamp,
                            ),
                        )

            if not filled_orders:
                return []

            connection.execute(
                """
                UPDATE bot_instances
                SET usd_balance = ?,
                    btc_balance = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (usd_balance, btc_balance, timestamp, numeric_id),
            )
            connection.execute(
                """
                UPDATE bot_instances
                SET last_trade_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (timestamp, timestamp, numeric_id),
            )

        return filled_orders

    def fill_triggered_orders(
        self,
        *,
        bot_id: str,
        low_price: float,
        high_price: float,
        timestamp: str,
    ) -> list[dict[str, Any]]:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        filled_orders: list[dict[str, Any]] = []

        with self._connect() as connection:
            bot_row = connection.execute(
                """
                SELECT
                    b.id,
                    b.user_id,
                    b.name,
                    b.strategy,
                    b.symbol,
                    b.usd_balance,
                    b.btc_balance
                FROM bot_instances b
                WHERE b.id = ? AND b.status = 'paper-running'
                """,
                (numeric_id,),
            ).fetchone()
            if bot_row is None:
                return []

            usd_balance = float(bot_row["usd_balance"])
            btc_balance = float(bot_row["btc_balance"])

            planned_rows = connection.execute(
                """
                SELECT id, side, order_type, amount, price, notional_usd
                FROM paper_trades
                WHERE bot_id = ? AND status = 'planned'
                ORDER BY
                    CASE side WHEN 'buy' THEN price END DESC,
                    CASE side WHEN 'sell' THEN price END ASC,
                    id ASC
                """,
                (numeric_id,),
            ).fetchall()

            for row in planned_rows:
                side = row["side"]
                order_type = row["order_type"]
                price = round(float(row["price"]), 2)
                amount = float(row["amount"])
                notional_usd = round(float(row["notional_usd"]), 2)
                
                # MARKET orders are always triggered (immediate execution)
                if order_type == "market":
                    is_triggered = True
                else:
                    # LIMIT orders require price to reach order price
                    is_triggered = (
                        side == OrderSide.BUY.value and low_price <= price
                    ) or (
                        side == OrderSide.SELL.value and high_price >= price
                    )
                if not is_triggered:
                    continue
                if side == OrderSide.BUY.value and usd_balance + 1e-9 < notional_usd:
                    continue
                if side == OrderSide.SELL.value and btc_balance + 1e-9 < amount:
                    continue

                connection.execute(
                    """
                    UPDATE paper_trades
                    SET status = 'filled',
                        created_at = ?
                    WHERE id = ?
                    """,
                    (timestamp, row["id"]),
                )

                if side == OrderSide.BUY.value:
                    usd_balance = round(usd_balance - notional_usd, 8)
                    btc_balance = round(btc_balance + amount, 8)
                    if order_type == "market":
                        detail = (
                            f"Paper buy filled at ${price:,.2f} via market order (immediate execution)."
                        )
                    else:
                        detail = (
                            f"Paper buy filled at ${price:,.2f} as BTC/USDT traded down into the resting limit."
                        )
                else:
                    usd_balance = round(usd_balance + notional_usd, 8)
                    btc_balance = round(max(btc_balance - amount, 0.0), 8)
                    if order_type == "market":
                        detail = (
                            f"Paper sell filled at ${price:,.2f} via market order (immediate execution)."
                        )
                    else:
                        detail = (
                            f"Paper sell filled at ${price:,.2f} as BTC/USDT traded up into the resting limit."
                        )

                self._insert_event(
                    connection,
                    user_id=bot_row["user_id"],
                    event_type="bot_fill",
                    tone="positive",
                    title=f"{bot_row['name']} filled {side}",
                    detail=detail,
                    amount_usd=notional_usd,
                    timestamp=timestamp,
                )
                filled_orders.append(
                    {
                        "tradeId": f"trade-{row['id']}",
                        "side": side,
                        "price": price,
                        "amount": round(amount, 6),
                        "notionalUsd": notional_usd,
                    }
                )

            if not filled_orders:
                return []

            connection.execute(
                """
                UPDATE bot_instances
                SET usd_balance = ?,
                    btc_balance = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (usd_balance, btc_balance, timestamp, numeric_id),
            )
            connection.execute(
                """
                UPDATE bot_instances
                SET last_trade_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (timestamp, timestamp, numeric_id),
            )

        return filled_orders

    def sync_planned_orders(
        self,
        *,
        bot_id: str,
        orders: list[OrderIntent],
        timestamp: str,
    ) -> None:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            bot_row = connection.execute(
                """
                SELECT id, user_id, strategy, symbol, config_json
                FROM bot_instances
                WHERE id = ?
                """,
                (numeric_id,),
            ).fetchone()
            if bot_row is None:
                return

            if bot_row["strategy"] == "infinity-grid":
                filled_rows = connection.execute(
                    """
                    SELECT side, price, amount
                    FROM paper_trades
                    WHERE bot_id = ? AND status = 'filled'
                    ORDER BY created_at ASC, id ASC
                    """,
                    (numeric_id,),
                ).fetchall()
                if filled_rows:
                    config = InfinityGridBotConfig(**json.loads(bot_row["config_json"]))
                    last_filled = filled_rows[-1]
                    last_side = last_filled["side"]
                    last_price = round(float(last_filled["price"]), 2)
                    last_amount = round(float(last_filled["amount"]), 6)
                    blocked_side = (
                        OrderSide.SELL.value if last_side == OrderSide.BUY.value else OrderSide.BUY.value
                    )
                    level_index = config.index_below(last_price)
                    replacement_price = (
                        config.level_at(level_index + 1)
                        if last_side == OrderSide.BUY.value
                        else config.level_at(level_index - 1)
                    )

                    adjusted_orders: list[OrderIntent] = []
                    adjusted = False
                    for order in orders:
                        matches_last_fill = (
                            order.side.value == blocked_side
                            and round(order.price or 0.0, 2) == last_price
                        )
                        if not matches_last_fill:
                            adjusted_orders.append(order)
                            continue

                        adjusted = True
                        if any(
                            existing.side.value == blocked_side
                            and round(existing.price or 0.0, 2) == replacement_price
                            for existing in orders
                        ):
                            continue

                        adjusted_orders.append(
                            OrderIntent(
                                symbol=order.symbol,
                                side=order.side,
                                order_type=order.order_type,
                                amount=last_amount,
                                price=replacement_price,
                                rationale=order.rationale,
                            )
                        )

                    if adjusted:
                        orders = adjusted_orders

                    blocked_buy_prices: set[float] = set()
                    for filled in filled_rows:
                        filled_side = filled["side"]
                        filled_price = round(float(filled["price"]), 2)
                        if filled_side == OrderSide.BUY.value:
                            blocked_buy_prices.add(filled_price)
                            continue

                        blocked_buy_prices = {
                            buy_price for buy_price in blocked_buy_prices if filled_price <= buy_price
                        }

                    if blocked_buy_prices:
                        orders = [
                            order
                            for order in orders
                            if not (
                                order.side.value == OrderSide.BUY.value
                                and round(order.price or 0.0, 2) in blocked_buy_prices
                            )
                        ]

            existing_rows = connection.execute(
                """
                SELECT side, order_type, amount, price, rationale
                FROM paper_trades
                WHERE bot_id = ? AND status = 'planned'
                ORDER BY side, price, amount, rationale
                """,
                (numeric_id,),
            ).fetchall()

            existing_signature = [
                (
                    row["side"],
                    row["order_type"],
                    round(float(row["amount"]), 6),
                    round(float(row["price"]), 2),
                    row["rationale"],
                )
                for row in existing_rows
            ]
            desired_signature = sorted(
                (
                    order.side.value,
                    order.order_type.value,
                    round(order.amount, 6),
                    round(order.price or 0.0, 2),
                    order.rationale,
                )
                for order in orders
            )

            if existing_signature == desired_signature:
                return

            connection.execute(
                "DELETE FROM paper_trades WHERE bot_id = ? AND status = 'planned'",
                (numeric_id,),
            )
            for order in orders:
                execution_price = round(order.price or 0.0, 2)
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
                        bot_row["user_id"],
                        numeric_id,
                        bot_row["strategy"],
                        order.symbol or bot_row["symbol"],
                        order.side.value,
                        order.order_type.value,
                        round(order.amount, 6),
                        execution_price,
                        round(execution_price * order.amount, 2),
                        order.rationale,
                        timestamp,
                    ),
                )

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

    def list_deposit_events(self, *, user_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT amount_usd, created_at
                FROM paper_events
                WHERE user_id = ? AND event_type = 'deposit' AND amount_usd IS NOT NULL
                ORDER BY created_at ASC, id ASC
                """,
                (user_id,),
            ).fetchall()
        return [
            {
                "amountUsd": round(float(row["amount_usd"] or 0.0), 2),
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
                    b.budget_usd,
                    b.usd_balance,
                    b.btc_balance,
                    b.initial_usd_balance,
                    b.initial_btc_balance,
                    b.initial_btc_cost_usd,
                    b.released_usd_balance,
                    b.released_btc_balance,
                    b.released_to_account,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.desired_status,
                    b.pid,
                    b.heartbeat_at,
                    b.last_error,
                    b.updated_at,
                    b.last_trade_at,
                    COUNT(t.id) AS trade_count,
                    SUM(CASE WHEN t.side = 'buy' THEN 1 ELSE 0 END) AS buy_count,
                    SUM(CASE WHEN t.side = 'sell' THEN 1 ELSE 0 END) AS sell_count,
                    COALESCE(SUM(t.notional_usd), 0) AS total_notional_usd,
                    AVG(t.price) AS average_price
                FROM bot_instances b
                LEFT JOIN paper_trades t ON t.bot_id = b.id AND t.status != 'planned'
                WHERE b.user_id = ? AND b.status = 'paper-running'
                GROUP BY
                    b.id,
                    b.name,
                    b.strategy,
                    b.strategy_label,
                    b.symbol,
                    b.exchange,
                    b.status,
                    b.budget_usd,
                    b.usd_balance,
                    b.btc_balance,
                    b.initial_usd_balance,
                    b.initial_btc_balance,
                    b.initial_btc_cost_usd,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.desired_status,
                    b.pid,
                    b.heartbeat_at,
                    b.last_error,
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
                "budgetUsd": round(float(row["budget_usd"] or 0), 2),
                "usdBalance": round(float(row["usd_balance"] or 0), 8),
                "btcBalance": round(float(row["btc_balance"] or 0), 8),
                "initialUsdBalance": round(float(row["initial_usd_balance"] or 0), 8),
                "initialBtcBalance": round(float(row["initial_btc_balance"] or 0), 8),
                "initialBtcCostUsd": round(float(row["initial_btc_cost_usd"] or 0), 8),
                "releasedUsdBalance": round(float(row["released_usd_balance"] or 0), 8),
                "releasedBtcBalance": round(float(row["released_btc_balance"] or 0), 8),
                "releasedToAccount": bool(row["released_to_account"]),
                "config": json.loads(row["config_json"]) if row["config_json"] else {},
                "createdAt": row["created_at"],
                "startedAt": row["started_at"],
                "desiredStatus": row["desired_status"],
                "pid": row["pid"],
                "heartbeatAt": row["heartbeat_at"],
                "lastError": row["last_error"],
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

    def list_bot_instances(self, *, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
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
                    b.budget_usd,
                    b.usd_balance,
                    b.btc_balance,
                    b.initial_usd_balance,
                    b.initial_btc_balance,
                    b.initial_btc_cost_usd,
                    b.released_usd_balance,
                    b.released_btc_balance,
                    b.released_to_account,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.stopped_at,
                    b.desired_status,
                    b.pid,
                    b.heartbeat_at,
                    b.last_error,
                    b.updated_at,
                    b.last_trade_at,
                    COUNT(t.id) AS trade_count,
                    SUM(CASE WHEN t.side = 'buy' THEN 1 ELSE 0 END) AS buy_count,
                    SUM(CASE WHEN t.side = 'sell' THEN 1 ELSE 0 END) AS sell_count,
                    COALESCE(SUM(t.notional_usd), 0) AS total_notional_usd,
                    AVG(t.price) AS average_price
                FROM bot_instances b
                LEFT JOIN paper_trades t ON t.bot_id = b.id AND t.status != 'planned'
                WHERE b.user_id = ?
                GROUP BY
                    b.id,
                    b.name,
                    b.strategy,
                    b.strategy_label,
                    b.symbol,
                    b.exchange,
                    b.status,
                    b.budget_usd,
                    b.usd_balance,
                    b.btc_balance,
                    b.initial_usd_balance,
                    b.initial_btc_balance,
                    b.initial_btc_cost_usd,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.stopped_at,
                    b.desired_status,
                    b.pid,
                    b.heartbeat_at,
                    b.last_error,
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
                "budgetUsd": round(float(row["budget_usd"] or 0), 2),
                "usdBalance": round(float(row["usd_balance"] or 0), 8),
                "btcBalance": round(float(row["btc_balance"] or 0), 8),
                "initialUsdBalance": round(float(row["initial_usd_balance"] or 0), 8),
                "initialBtcBalance": round(float(row["initial_btc_balance"] or 0), 8),
                "initialBtcCostUsd": round(float(row["initial_btc_cost_usd"] or 0), 8),
                "releasedUsdBalance": round(float(row["released_usd_balance"] or 0), 8),
                "releasedBtcBalance": round(float(row["released_btc_balance"] or 0), 8),
                "releasedToAccount": bool(row["released_to_account"]),
                "config": json.loads(row["config_json"]) if row["config_json"] else {},
                "createdAt": row["created_at"],
                "startedAt": row["started_at"],
                "stoppedAt": row["stopped_at"],
                "desiredStatus": row["desired_status"],
                "pid": row["pid"],
                "heartbeatAt": row["heartbeat_at"],
                "lastError": row["last_error"],
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

    def get_bot_instance(self, *, bot_id: str) -> Optional[dict[str, Any]]:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    b.id,
                    b.user_id,
                    a.user_name,
                    b.name,
                    b.strategy,
                    b.strategy_label,
                    b.symbol,
                    b.exchange,
                    b.status,
                    b.desired_status,
                    b.pid,
                    b.heartbeat_at,
                    b.last_error,
                    b.budget_usd,
                    b.usd_balance,
                    b.btc_balance,
                    b.initial_usd_balance,
                    b.initial_btc_balance,
                    b.initial_btc_cost_usd,
                    b.released_usd_balance,
                    b.released_btc_balance,
                    b.released_to_account,
                    b.config_json,
                    b.created_at,
                    b.started_at,
                    b.stopped_at,
                    b.updated_at,
                    b.last_trade_at
                FROM bot_instances b
                INNER JOIN paper_accounts a ON a.user_id = b.user_id
                WHERE b.id = ?
                """,
                (numeric_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": f"bot-{row['id']}",
            "userId": row["user_id"],
            "userName": row["user_name"],
            "name": row["name"],
            "strategy": row["strategy"],
            "strategyLabel": row["strategy_label"],
            "symbol": row["symbol"],
            "exchange": row["exchange"],
            "status": row["status"],
            "desiredStatus": row["desired_status"],
            "pid": row["pid"],
            "heartbeatAt": row["heartbeat_at"],
            "lastError": row["last_error"],
            "budgetUsd": round(float(row["budget_usd"] or 0), 2),
            "usdBalance": round(float(row["usd_balance"] or 0), 8),
            "btcBalance": round(float(row["btc_balance"] or 0), 8),
            "initialUsdBalance": round(float(row["initial_usd_balance"] or 0), 8),
            "initialBtcBalance": round(float(row["initial_btc_balance"] or 0), 8),
            "initialBtcCostUsd": round(float(row["initial_btc_cost_usd"] or 0), 8),
            "releasedUsdBalance": round(float(row["released_usd_balance"] or 0), 8),
            "releasedBtcBalance": round(float(row["released_btc_balance"] or 0), 8),
            "releasedToAccount": bool(row["released_to_account"]),
            "config": json.loads(row["config_json"]) if row["config_json"] else {},
            "createdAt": row["created_at"],
            "startedAt": row["started_at"],
            "stoppedAt": row["stopped_at"],
            "updatedAt": row["updated_at"],
            "lastTradeAt": row["last_trade_at"],
        }

    def list_recoverable_bot_ids(self, *, limit: int = 100) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id
                FROM bot_instances
                WHERE (status = 'paper-running' OR status = 'crashed')
                  AND desired_status = 'running'
                ORDER BY started_at ASC, id ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [f"bot-{row['id']}" for row in rows]

    def mark_bot_process_started(self, *, bot_id: str, pid: int, timestamp: str) -> None:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE bot_instances
                SET status = 'paper-running',
                    desired_status = 'running',
                    pid = ?,
                    heartbeat_at = ?,
                    last_error = NULL,
                    stopped_at = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                (pid, timestamp, timestamp, numeric_id),
            )
            row = connection.execute(
                "SELECT user_id FROM bot_instances WHERE id = ?",
                (numeric_id,),
            ).fetchone()
            if row is not None:
                self._refresh_account_bot_status(
                    connection,
                    user_id=row["user_id"],
                    timestamp=timestamp,
                )

    def record_bot_heartbeat(
        self,
        *,
        bot_id: str,
        pid: int,
        timestamp: str,
        last_trade_at: Optional[str] = None,
    ) -> None:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            if last_trade_at is not None:
                connection.execute(
                    """
                    UPDATE bot_instances
                    SET pid = ?,
                        heartbeat_at = ?,
                        updated_at = ?,
                        last_trade_at = ?
                    WHERE id = ?
                    """,
                    (pid, timestamp, timestamp, last_trade_at, numeric_id),
                )
            else:
                connection.execute(
                    """
                    UPDATE bot_instances
                    SET pid = ?,
                        heartbeat_at = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (pid, timestamp, timestamp, numeric_id),
                )

    def request_bot_stop(self, *, bot_id: str, timestamp: str) -> None:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE bot_instances
                SET desired_status = 'stopped',
                    updated_at = ?
                WHERE id = ?
                """,
                (timestamp, numeric_id),
            )

    def _release_bot_balances_to_account(
        self,
        connection: sqlite3.Connection,
        *,
        numeric_id: int,
        timestamp: str,
    ) -> Optional[sqlite3.Row]:
        row = connection.execute(
            """
            SELECT
                b.name,
                b.user_id,
                b.usd_balance,
                b.btc_balance,
                b.released_to_account,
                a.usd_balance AS account_usd_balance,
                a.btc_balance AS account_btc_balance
            FROM bot_instances b
            INNER JOIN paper_accounts a ON a.user_id = b.user_id
            WHERE b.id = ?
            """,
            (numeric_id,),
        ).fetchone()
        if row is None or bool(row["released_to_account"]):
            return row

        released_usd_balance = round(float(row["usd_balance"] or 0), 8)
        released_btc_balance = round(float(row["btc_balance"] or 0), 8)
        next_account_usd = round(float(row["account_usd_balance"] or 0) + released_usd_balance, 8)
        next_account_btc = round(float(row["account_btc_balance"] or 0) + released_btc_balance, 8)

        connection.execute(
            """
            UPDATE paper_accounts
            SET usd_balance = ?,
                btc_balance = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (next_account_usd, next_account_btc, timestamp, row["user_id"]),
        )
        connection.execute(
            """
            UPDATE bot_instances
            SET released_usd_balance = ?,
                released_btc_balance = ?,
                released_to_account = 1,
                usd_balance = 0,
                btc_balance = 0,
                updated_at = ?
            WHERE id = ?
            """,
            (released_usd_balance, released_btc_balance, timestamp, numeric_id),
        )
        return row

    def mark_bot_stopped(self, *, bot_id: str, timestamp: str) -> None:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            self._release_bot_balances_to_account(
                connection,
                numeric_id=numeric_id,
                timestamp=timestamp,
            )
            connection.execute(
                """
                UPDATE bot_instances
                SET status = 'stopped',
                    desired_status = 'stopped',
                    pid = NULL,
                    heartbeat_at = ?,
                    stopped_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (timestamp, timestamp, timestamp, numeric_id),
            )
            row = connection.execute(
                """
                SELECT name, user_id, released_usd_balance, released_btc_balance
                FROM bot_instances
                WHERE id = ?
                """,
                (numeric_id,),
            ).fetchone()
            if row is not None:
                self._refresh_account_bot_status(
                    connection,
                    user_id=row["user_id"],
                    timestamp=timestamp,
                )
                self._insert_event(
                    connection,
                    user_id=row["user_id"],
                    event_type="bot_stopped",
                    tone="neutral",
                    title=f"{row['name']} stopped",
                    detail=(
                        "Bot worker exited cleanly after a stop request. "
                        f"Released ${float(row['released_usd_balance'] or 0):,.2f} and "
                        f"{float(row['released_btc_balance'] or 0):.6f} BTC back to the reserve."
                    ),
                    timestamp=timestamp,
                )

    def mark_bot_crashed(self, *, bot_id: str, error: str, timestamp: str) -> None:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            self._release_bot_balances_to_account(
                connection,
                numeric_id=numeric_id,
                timestamp=timestamp,
            )
            connection.execute(
                """
                UPDATE bot_instances
                SET status = 'crashed',
                    pid = NULL,
                    heartbeat_at = ?,
                    last_error = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (timestamp, error[:500], timestamp, numeric_id),
            )
            row = connection.execute(
                """
                SELECT name, user_id, released_usd_balance, released_btc_balance
                FROM bot_instances
                WHERE id = ?
                """,
                (numeric_id,),
            ).fetchone()
            if row is not None:
                self._refresh_account_bot_status(
                    connection,
                    user_id=row["user_id"],
                    timestamp=timestamp,
                )
                self._insert_event(
                    connection,
                    user_id=row["user_id"],
                    event_type="bot_crashed",
                    tone="warning",
                    title=f"{row['name']} crashed",
                    detail=(
                        f"{error[:380]} "
                        f"Released ${float(row['released_usd_balance'] or 0):,.2f} and "
                        f"{float(row['released_btc_balance'] or 0):.6f} BTC back to the reserve."
                    ),
                    timestamp=timestamp,
                )

    def reallocate_bot_balances(self, *, bot_id: str, timestamp: str) -> bool:
        """Re-allocate balances to a bot that was previously released.
        
        Returns True if balances were reallocated, False otherwise.
        """
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    b.user_id,
                    b.initial_usd_balance,
                    b.initial_btc_balance,
                    b.released_to_account,
                    a.usd_balance AS account_usd_balance,
                    a.btc_balance AS account_btc_balance
                FROM bot_instances b
                INNER JOIN paper_accounts a ON a.user_id = b.user_id
                WHERE b.id = ?
                """,
                (numeric_id,),
            ).fetchone()
            
            if row is None:
                return False
            
            if not bool(row["released_to_account"]):
                return False
            
            initial_usd = float(row["initial_usd_balance"] or 0)
            initial_btc = float(row["initial_btc_balance"] or 0)
            account_usd = float(row["account_usd_balance"] or 0)
            account_btc = float(row["account_btc_balance"] or 0)
            
            # Check if account has enough balance
            if account_usd + 1e-9 < initial_usd or account_btc + 1e-9 < initial_btc:
                return False
            
            # Deduct from account
            next_account_usd = round(account_usd - initial_usd, 8)
            next_account_btc = round(account_btc - initial_btc, 8)
            
            connection.execute(
                """
                UPDATE paper_accounts
                SET usd_balance = ?,
                    btc_balance = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (next_account_usd, next_account_btc, timestamp, row["user_id"]),
            )
            
            # Re-allocate to bot
            connection.execute(
                """
                UPDATE bot_instances
                SET usd_balance = ?,
                    btc_balance = ?,
                    released_usd_balance = 0,
                    released_btc_balance = 0,
                    released_to_account = 0,
                    updated_at = ?
                WHERE id = ?
                """,
                (initial_usd, initial_btc, timestamp, numeric_id),
            )
            
            return True

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
                "status": "pending" if row["status"] == "planned" else row["status"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def list_executed_bot_trades(self, *, bot_id: str) -> list[dict[str, Any]]:
        numeric_id = int(bot_id.replace("bot-", "", 1))
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    side,
                    amount,
                    price,
                    notional_usd,
                    created_at
                FROM paper_trades
                WHERE bot_id = ? AND status != 'planned'
                ORDER BY created_at ASC, id ASC
                """,
                (numeric_id,),
            ).fetchall()

        return [
            {
                "side": row["side"],
                "amount": round(float(row["amount"]), 6),
                "price": round(float(row["price"]), 2),
                "notionalUsd": round(float(row["notional_usd"]), 2),
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    # ── Chat persistence ──────────────────────────────────────────────

    def create_chat_conversation(
        self,
        *,
        conversation_id: str,
        user_id: str,
        title: str,
        timestamp: str,
    ) -> dict[str, Any]:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (conversation_id, user_id, title, timestamp, timestamp),
            )
        return {
            "id": conversation_id,
            "userId": user_id,
            "title": title,
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }

    def save_chat_message(
        self,
        *,
        conversation_id: str,
        role: str,
        content: str,
        tool_name: Optional[str] = None,
        tool_args_json: Optional[str] = None,
        timestamp: str,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO chat_messages (conversation_id, role, content, tool_name, tool_args_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, role, content, tool_name, tool_args_json, timestamp),
            )
            connection.execute(
                """
                UPDATE chat_conversations SET updated_at = ? WHERE id = ?
                """,
                (timestamp, conversation_id),
            )

    def list_chat_messages(
        self, *, conversation_id: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT role, content, tool_name, tool_args_json, created_at
                FROM chat_messages
                WHERE conversation_id = ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (conversation_id, limit),
            ).fetchall()
        return [
            {
                "role": row["role"],
                "content": row["content"],
                "toolName": row["tool_name"],
                "toolArgsJson": row["tool_args_json"],
                "timestamp": row["created_at"],
            }
            for row in rows
        ]

    def list_chat_conversations(
        self, *, user_id: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM chat_conversations
                WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]

    def get_chat_conversation(
        self, *, conversation_id: str
    ) -> Optional[dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, user_id, title, created_at, updated_at
                FROM chat_conversations
                WHERE id = ?
                """,
                (conversation_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "userId": row["user_id"],
            "title": row["title"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
