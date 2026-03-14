from __future__ import annotations

from abc import ABC, abstractmethod

from trading_bot.models import Balance, MarketSnapshot, StrategyEvaluation


def free_balance(balances: list[Balance], asset: str) -> float:
    for balance in balances:
        if balance.asset == asset:
            return balance.free
    return 0.0


class Strategy(ABC):
    @abstractmethod
    def evaluate(self, snapshot: MarketSnapshot, balances: list[Balance]) -> StrategyEvaluation:
        ...

