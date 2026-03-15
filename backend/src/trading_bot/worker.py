from __future__ import annotations

import os
import time

from trading_bot.app import TradingBotApp
from trading_bot.models import GridBotConfig, InfinityGridBotConfig, RebalanceBotConfig, StrategyType
from trading_bot.runtime import utc_timestamp
from trading_bot.settings import load_settings


class BotWorkerRunner:
    def __init__(self, bot_id: str, poll_interval_seconds: float = 5.0) -> None:
        self._bot_id = bot_id
        self._poll_interval_seconds = poll_interval_seconds
        self._app = TradingBotApp(load_settings(), enable_market_stream=False, worker_autostart=False)

    def run(self) -> None:
        pid = os.getpid()
        self._app.paper_store.mark_bot_process_started(
            bot_id=self._bot_id,
            pid=pid,
            timestamp=utc_timestamp(),
        )

        try:
            while True:
                bot = self._app.paper_store.get_bot_instance(bot_id=self._bot_id)
                if bot is None:
                    return
                if bot["desiredStatus"] == "stopped":
                    self._app.paper_store.mark_bot_stopped(
                        bot_id=self._bot_id,
                        timestamp=utc_timestamp(),
                    )
                    return
                if bot["pid"] not in (None, pid):
                    return

                account_state = self._app.paper_store.ensure_account(
                    user_id=bot["userId"],
                    user_name=bot["userName"],
                    timestamp=utc_timestamp(),
                )
                balances = self._app._paper_balances(account_state)
                snapshot = self._app.market_data.get_snapshot(bot["symbol"])
                strategy_type = StrategyType(bot["strategy"])
                config_override = self._config_override(strategy_type, bot["config"])
                evaluation_data = self._app._evaluate_strategy(
                    strategy_type,
                    snapshot,
                    balances,
                    config_override=config_override,
                )
                heartbeat_at = utc_timestamp()
                last_trade_at = heartbeat_at if evaluation_data["evaluation"].orders else bot["lastTradeAt"]
                self._app.paper_store.record_bot_heartbeat(
                    bot_id=self._bot_id,
                    pid=pid,
                    timestamp=heartbeat_at,
                    last_trade_at=last_trade_at,
                )
                time.sleep(self._poll_interval_seconds)
        except Exception as exc:
            self._app.paper_store.mark_bot_crashed(
                bot_id=self._bot_id,
                error=str(exc),
                timestamp=utc_timestamp(),
            )
            raise

    def _config_override(self, strategy_type: StrategyType, payload: dict):
        if strategy_type is StrategyType.GRID:
            return GridBotConfig(**payload)
        if strategy_type is StrategyType.REBALANCE:
            return RebalanceBotConfig(**payload)
        return InfinityGridBotConfig(**payload)
