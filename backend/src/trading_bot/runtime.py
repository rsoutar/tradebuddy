from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from trading_bot.paper_store import PaperTradingStore
from trading_bot.settings import AppSettings

logger = logging.getLogger(__name__)


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


def read_process_cmdline(pid: int) -> str:
    if pid <= 0:
        return ""
    try:
        raw = Path(f"/proc/{pid}/cmdline").read_bytes()
    except OSError:
        return ""
    if not raw:
        return ""
    return raw.replace(b"\x00", b" ").decode(errors="ignore").strip()


def is_bot_process_alive(pid: Optional[int], bot_id: str) -> bool:
    if not is_process_alive(pid):
        return False
    cmdline = read_process_cmdline(int(pid))
    if not cmdline:
        return False
    return (
        ("trading_bot.cli" in cmdline or "trading-bot" in cmdline)
        and "run-bot" in cmdline
        and bot_id in cmdline
    )


class BotProcessManager:
    def __init__(self, settings: AppSettings, paper_store: PaperTradingStore, enabled: bool = True) -> None:
        self._settings = settings
        self._paper_store = paper_store
        self._enabled = enabled

    def start_bot(self, bot_id: str) -> Optional[int]:
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            raise ValueError(f"Unknown bot id: {bot_id}")

        if bot["pid"] and is_bot_process_alive(bot["pid"], bot_id):
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
        if not pid or not is_bot_process_alive(pid, bot_id):
            self._paper_store.mark_bot_stopped(bot_id=bot_id, timestamp=timestamp)

    def force_stop(self, bot_id: str) -> None:
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            raise ValueError(f"Unknown bot id: {bot_id}")

        pid = bot["pid"]
        self.request_stop(bot_id)
        if pid and is_bot_process_alive(pid, bot_id):
            os.kill(pid, signal.SIGTERM)

    def reconcile_bot(self, bot_id: str) -> None:
        bot = self._paper_store.get_bot_instance(bot_id=bot_id)
        if bot is None:
            return

        pid = bot["pid"]
        if bot["status"] == "paper-running" and pid and not is_bot_process_alive(pid, bot_id):
            if bot["desiredStatus"] == "stopped":
                self._paper_store.mark_bot_stopped(bot_id=bot_id, timestamp=utc_timestamp())
            else:
                logger.error("Bot worker process exited unexpectedly for %s (pid=%s)", bot_id, pid)
                self._paper_store.mark_bot_crashed(
                    bot_id=bot_id,
                    error="Bot worker process exited unexpectedly.",
                    timestamp=utc_timestamp(),
                )

    def recover_running_bots(self) -> list[str]:
        if not self._enabled:
            return []

        recovered_bot_ids: list[str] = []
        for bot_id in self._paper_store.list_recoverable_bot_ids():
            pid = self.start_bot(bot_id)
            if pid is not None:
                recovered_bot_ids.append(bot_id)

        if recovered_bot_ids:
            logger.info("Recovered %s running bot(s) after startup.", len(recovered_bot_ids))
        return recovered_bot_ids
