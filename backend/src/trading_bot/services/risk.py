from __future__ import annotations

from dataclasses import dataclass

from trading_bot.models import Balance, OrderIntent


def _balance_lookup(balances: list[Balance], asset: str) -> float:
    for balance in balances:
        if balance.asset == asset:
            return balance.free
    return 0.0


@dataclass(frozen=True)
class RiskDecision:
    accepted: bool
    warnings: list[str]


class RiskManager:
    def __init__(self, max_usdt_allocation: float = 5000.0, minimum_usdt_buffer: float = 250.0) -> None:
        self._max_usdt_allocation = max_usdt_allocation
        self._minimum_usdt_buffer = minimum_usdt_buffer

    def review(self, balances: list[Balance], orders: list[OrderIntent]) -> RiskDecision:
        warnings: list[str] = []
        usdt_balance = _balance_lookup(balances, "USDT")
        total_buy_value = sum((order.price or 0.0) * order.amount for order in orders if order.side.value == "buy")

        if total_buy_value > self._max_usdt_allocation:
            warnings.append("Planned buy allocation exceeds the configured max USDT allocation.")
        if usdt_balance - total_buy_value < self._minimum_usdt_buffer:
            warnings.append("Planned buys would reduce the USDT buffer below the minimum.")

        return RiskDecision(accepted=not warnings, warnings=warnings)

