from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


DEFAULT_INITIAL_DEPOSIT_USD = 100.0


class PaperTradingStore:
    def __init__(self, database_path: Path) -> None:
        self._database_path = database_path
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._database_path)
        connection.row_factory = sqlite3.Row
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
        amount_usd: float | None = None,
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
