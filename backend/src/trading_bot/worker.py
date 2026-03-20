from __future__ import annotations

import logging
import os
import time

from trading_bot.app import TradingBotApp
from trading_bot.error_utils import summarize_exception
from trading_bot.runtime import utc_timestamp
from trading_bot.settings import load_settings

logger = logging.getLogger(__name__)


class BotWorkerRunner:
    def __init__(self, bot_id: str, poll_interval_seconds: float = 5.0) -> None:
        self._bot_id = bot_id
        self._poll_interval_seconds = poll_interval_seconds
        self._app = TradingBotApp(load_settings(), enable_market_stream=False, worker_autostart=False)

    def run(self) -> None:
        pid = os.getpid()
        logger.info("Bot worker starting for %s (pid=%s)", self._bot_id, pid)
        self._app.paper_store.mark_bot_process_started(
            bot_id=self._bot_id,
            pid=pid,
            timestamp=utc_timestamp(),
        )

        try:
            cycle_count = 0
            while True:
                bot = self._app.paper_store.get_bot_instance(bot_id=self._bot_id)
                if bot is None:
                    logger.info("Bot %s not found, exiting", self._bot_id)
                    return
                if bot["desiredStatus"] == "stopped":
                    logger.info("Bot %s stopped, exiting", self._bot_id)
                    self._app.paper_store.mark_bot_stopped(
                        bot_id=self._bot_id,
                        timestamp=utc_timestamp(),
                    )
                    return
                if bot["pid"] not in (None, pid):
                    logger.info("Bot %s has different pid, exiting", self._bot_id)
                    return

                cycle_count += 1
                logger.debug("Bot %s cycle %d starting", self._bot_id, cycle_count)
                cycle_result = self._app.process_bot_cycle(self._bot_id)
                heartbeat_at = utc_timestamp()
                self._app.paper_store.record_bot_heartbeat(
                    bot_id=self._bot_id,
                    pid=pid,
                    timestamp=heartbeat_at,
                    last_trade_at=cycle_result["lastTradeAt"],
                )
                logger.debug("Bot %s cycle %d completed", self._bot_id, cycle_count)
                time.sleep(self._poll_interval_seconds)
        except Exception as exc:
            logger.exception("Bot worker crashed for %s", self._bot_id)
            self._app.paper_store.mark_bot_crashed(
                bot_id=self._bot_id,
                error=summarize_exception(exc),
                timestamp=utc_timestamp(),
            )
            raise
