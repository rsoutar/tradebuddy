from __future__ import annotations

import os
import signal
import subprocess
import sys
from datetime import datetime, timezone
from typing import Optional

from trading_bot.paper_store import PaperTradingStore
from trading_bot.settings import AppSettings


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_process_alive(pid: Optional[int]) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


class BotProcessManager:
    def __init__(self, settings: AppSettings, paper_store: PaperTradingStore, enabled: bool = True) -> None:
        self._settings = settings
        self._paper_store = paper_store
        self._enabled = enabled

    def start_bot(self, bot_id: str) -> Optional[int]:
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            raise ValueError(f"Unknown bot id: {bot_id}")

        if bot["pid"] and is_process_alive(bot["pid"]):
            return int(bot["pid"])

        if not self._enabled:
            return None

        command = [sys.executable, "-m", "trading_bot.cli", "run-bot", "--bot-id", bot_id]
        env = os.environ.copy()
        env["TRADING_BOT_MARKETDATA_WS_ENABLED"] = "false"

        process = subprocess.Popen(command, env=env)  # noqa: S603
        self._paper_store.mark_bot_process_started(
            bot_id=bot_id,
            pid=process.pid,
            timestamp=utc_timestamp(),
        )
        return process.pid

    def request_stop(self, bot_id: str) -> None:
        timestamp = utc_timestamp()
        self._paper_store.request_bot_stop(bot_id=bot_id, timestamp=timestamp)
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            return
        pid = bot["pid"]
        if not pid or not is_process_alive(pid):
            self._paper_store.mark_bot_stopped(bot_id=bot_id, timestamp=timestamp)

    def force_stop(self, bot_id: str) -> None:
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            raise ValueError(f"Unknown bot id: {bot_id}")

        pid = bot["pid"]
        self.request_stop(bot_id)
        if pid and is_process_alive(pid):
            os.kill(pid, signal.SIGTERM)

    def reconcile_bot(self, bot_id: str) -> None:
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            return

        pid = bot["pid"]
        if bot["status"] == "paper-running" and pid and not is_process_alive(pid):
            if bot["desiredStatus"] == "stopped":
                self._paper_store.mark_bot_stopped(bot_id=bot_id, timestamp=utc_timestamp())
            else:
                self._paper_store.mark_bot_crashed(
                    bot_id=bot_id,
                    error="Bot worker process exited unexpectedly.",
                    timestamp=utc_timestamp(),
                )
