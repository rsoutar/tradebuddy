from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from math import inf

from trading_bot.models import (
    GridBotConfig,
    HistoricalCandle,
    OrderSide,
    RebalanceBotConfig,
    StrategyType,
)
from trading_bot.services.historical_data import BinanceHistoricalKlineLoader


DEFAULT_GRID_LOOKBACK_DAYS = 90
DEFAULT_GRID_FEE_RATE = 0.001
DEFAULT_GRID_SLIPPAGE_RATE = 0.0005
DEFAULT_GRID_INITIAL_BTC_RATIO = 0.5


@dataclass(frozen=True)
class BacktestTrade:
    timestamp: datetime
    side: str
    level: float
    execution_price: float
    amount: float
    notional_usd: float
    fee_usd: float
    realized_pnl_usd: float | None
    reason: str


@dataclass(frozen=True)
class BacktestResult:
    strategy: str
    period_label: str
    started_at: str
    completed_at: str
    roi_pct: float
    max_drawdown_pct: float
    profit_factor: float
    win_rate_pct: float
    trades: int
    annualized_pct: float
    start_equity_usd: float
    final_equity_usd: float
    fee_rate: float
    slippage_rate: float
    stop_loss_triggered: bool
    upper_price_stop_triggered: bool
    warnings: list[str]
    trade_log: list[dict[str, object]]

    def to_summary(self) -> dict[str, object]:
        return {
            "strategy": self.strategy,
            "periodLabel": self.period_label,
            "startedAt": self.started_at,
            "roiPct": self.roi_pct,
            "maxDrawdownPct": self.max_drawdown_pct,
            "profitFactor": self.profit_factor,
            "winRatePct": self.win_rate_pct,
            "trades": self.trades,
            "annualizedPct": self.annualized_pct,
            "completedAt": self.completed_at,
            "startEquityUsd": self.start_equity_usd,
            "finalEquityUsd": self.final_equity_usd,
            "feeRate": self.fee_rate,
            "slippageRate": self.slippage_rate,
            "stopLossTriggered": self.stop_loss_triggered,
            "upperPriceStopTriggered": self.upper_price_stop_triggered,
            "warnings": self.warnings,
            "tradeLog": self.trade_log,
        }


class RebalanceBacktestRunner:
    def __init__(
        self,
        historical_loader: BinanceHistoricalKlineLoader,
        *,
        fee_rate: float = DEFAULT_GRID_FEE_RATE,
        slippage_rate: float = DEFAULT_GRID_SLIPPAGE_RATE,
    ) -> None:
        self._historical_loader = historical_loader
        self._fee_rate = fee_rate
        self._slippage_rate = slippage_rate

    def run(
        self,
        config: RebalanceBotConfig,
        *,
        initial_capital_usd: float,
        start: datetime | None = None,
        end: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> BacktestResult:
        config.validate()
        candles = self._historical_loader.load_candles(start=start, end=end)
        if not candles:
            raise ValueError("No historical candles available for the requested backtest window.")

        capital = round(initial_capital_usd, 2)
        usdt_balance = capital
        btc_balance = 0.0
        inventory_lots: list[tuple[float, float]] = []
        realized_pnls: list[float] = []
        trade_log: list[BacktestTrade] = []
        warnings: list[str] = []
        equity_curve: list[float] = [capital]
        interval_seconds = config.interval_minutes * 60
        last_rebalance_at: datetime | None = None
        final_mark_price = candles[0].open
        final_timestamp = candles[0].open_time

        for candle in candles:
            should_rebalance = (
                last_rebalance_at is None
                or (candle.close_time - last_rebalance_at).total_seconds() >= interval_seconds
            )
            if should_rebalance:
                result = self._execute_rebalance(
                    candle=candle,
                    config=config,
                    usdt_balance=usdt_balance,
                    btc_balance=btc_balance,
                    inventory_lots=inventory_lots,
                )
                usdt_balance = result["usdt_balance"]
                btc_balance = result["btc_balance"]
                trade = result.get("trade")
                if isinstance(trade, BacktestTrade):
                    trade_log.append(trade)
                realized_pnl = result.get("realized_pnl")
                if isinstance(realized_pnl, float):
                    realized_pnls.append(realized_pnl)
                last_rebalance_at = candle.close_time

            equity_curve.append(usdt_balance + (btc_balance * candle.close))
            final_mark_price = candle.close
            final_timestamp = candle.close_time

        final_equity = round(usdt_balance + (btc_balance * final_mark_price), 2)
        completed_at = completed_at or datetime.now(timezone.utc)
        gross_profit = sum(pnl for pnl in realized_pnls if pnl > 0)
        gross_loss = abs(sum(pnl for pnl in realized_pnls if pnl < 0))
        winning_trades = sum(1 for pnl in realized_pnls if pnl > 0)
        closed_trades = len(realized_pnls)
        duration_days = max(
            (final_timestamp - candles[0].open_time).total_seconds() / 86_400,
            1 / 24,
        )

        if not trade_log:
            warnings.append(
                "Portfolio drift stayed within the configured threshold for the entire replay window."
            )

        return BacktestResult(
            strategy=StrategyType.REBALANCE.value,
            period_label=self._format_period_label(candles[0].open_time, final_timestamp),
            started_at=candles[0].open_time.isoformat(),
            completed_at=completed_at.isoformat(),
            roi_pct=round(((final_equity / capital) - 1) * 100, 2),
            max_drawdown_pct=round(self._max_drawdown_pct(equity_curve), 2),
            profit_factor=round(self._profit_factor(gross_profit, gross_loss), 2),
            win_rate_pct=round((winning_trades / closed_trades) * 100, 1) if closed_trades else 0.0,
            trades=len(trade_log),
            annualized_pct=round(self._annualized_pct(capital, final_equity, duration_days), 2),
            start_equity_usd=capital,
            final_equity_usd=final_equity,
            fee_rate=self._fee_rate,
            slippage_rate=self._slippage_rate,
            stop_loss_triggered=False,
            upper_price_stop_triggered=False,
            warnings=warnings,
            trade_log=[self._serialize_trade(trade) for trade in trade_log],
        )

    def default_window(self) -> tuple[datetime, datetime]:
        archives = self._historical_loader.available_archives()
        if not archives:
            raise ValueError("No historical archives are available for backtesting.")
        latest_candle = self._historical_loader._iter_archive_rows(archives[-1])[-1]
        end = latest_candle.open_time + timedelta(minutes=15)
        start = end - timedelta(days=DEFAULT_GRID_LOOKBACK_DAYS)
        return start, end

    def _execute_rebalance(
        self,
        *,
        candle: HistoricalCandle,
        config: RebalanceBotConfig,
        usdt_balance: float,
        btc_balance: float,
        inventory_lots: list[tuple[float, float]],
    ) -> dict[str, object]:
        mark_price = candle.close
        portfolio_value = usdt_balance + (btc_balance * mark_price)
        if portfolio_value <= 0:
            return {"usdt_balance": usdt_balance, "btc_balance": btc_balance}

        current_btc_value = btc_balance * mark_price
        current_ratio = current_btc_value / portfolio_value
        drift = config.target_btc_ratio - current_ratio
        threshold = config.rebalance_threshold_pct / 100
        if abs(drift) < threshold:
            return {"usdt_balance": usdt_balance, "btc_balance": btc_balance}

        target_btc_value = portfolio_value * config.target_btc_ratio
        adjustment_value = target_btc_value - current_btc_value
        side = OrderSide.BUY if adjustment_value > 0 else OrderSide.SELL
        execution_price = round(
            mark_price * (1 + self._slippage_rate if side is OrderSide.BUY else 1 - self._slippage_rate),
            2,
        )
        if execution_price <= 0:
            return {"usdt_balance": usdt_balance, "btc_balance": btc_balance}

        target_notional = abs(adjustment_value)
        if side is OrderSide.BUY:
            gross_cost = min(target_notional, usdt_balance / (1 + self._fee_rate))
            amount = round(gross_cost / execution_price, 6)
            if amount <= 0:
                return {"usdt_balance": usdt_balance, "btc_balance": btc_balance}
            gross_cost = amount * execution_price
            fee_usd = gross_cost * self._fee_rate
            total_cost = gross_cost + fee_usd
            if total_cost > usdt_balance:
                return {"usdt_balance": usdt_balance, "btc_balance": btc_balance}
            updated_usdt = round(usdt_balance - total_cost, 8)
            updated_btc = round(btc_balance + amount, 8)
            inventory_lots.append((amount, total_cost / amount))
            return {
                "usdt_balance": updated_usdt,
                "btc_balance": updated_btc,
                "trade": BacktestTrade(
                    timestamp=candle.close_time,
                    side=OrderSide.BUY.value,
                    level=round(mark_price, 2),
                    execution_price=execution_price,
                    amount=amount,
                    notional_usd=round(gross_cost, 2),
                    fee_usd=round(fee_usd, 2),
                    realized_pnl_usd=None,
                    reason=(
                        f"Rebalanced toward {config.target_btc_ratio * 100:.0f}% BTC after "
                        f"{abs(drift) * 100:.2f}% drift."
                    ),
                ),
            }

        amount = round(min(target_notional / execution_price, btc_balance), 6)
        if amount <= 0:
            return {"usdt_balance": usdt_balance, "btc_balance": btc_balance}
        gross_proceeds = amount * execution_price
        fee_usd = gross_proceeds * self._fee_rate
        net_proceeds = gross_proceeds - fee_usd
        cost_basis = self._consume_inventory(inventory_lots, amount)
        realized_pnl = round(net_proceeds - cost_basis, 8)
        return {
            "usdt_balance": round(usdt_balance + net_proceeds, 8),
            "btc_balance": round(btc_balance - amount, 8),
            "realized_pnl": realized_pnl,
            "trade": BacktestTrade(
                timestamp=candle.close_time,
                side=OrderSide.SELL.value,
                level=round(mark_price, 2),
                execution_price=execution_price,
                amount=amount,
                notional_usd=round(gross_proceeds, 2),
                fee_usd=round(fee_usd, 2),
                realized_pnl_usd=round(realized_pnl, 2),
                reason=(
                    f"Rebalanced toward {config.target_btc_ratio * 100:.0f}% BTC after "
                    f"{abs(drift) * 100:.2f}% drift."
                ),
            ),
        }

    def _consume_inventory(self, inventory_lots: list[tuple[float, float]], amount: float) -> float:
        remaining = amount
        cost_basis = 0.0
        while remaining > 0 and inventory_lots:
            lot_amount, lot_cost = inventory_lots[0]
            consumed = min(lot_amount, remaining)
            cost_basis += consumed * lot_cost
            lot_amount -= consumed
            remaining -= consumed
            if lot_amount <= 1e-9:
                inventory_lots.pop(0)
            else:
                inventory_lots[0] = (lot_amount, lot_cost)
        return cost_basis

    def _format_period_label(self, start: datetime, end: datetime) -> str:
        return f"{start:%Y-%m-%d} to {end:%Y-%m-%d}"

    def _max_drawdown_pct(self, equity_curve: list[float]) -> float:
        peak = equity_curve[0]
        max_drawdown = 0.0
        for equity in equity_curve:
            peak = max(peak, equity)
            if peak <= 0:
                continue
            drawdown = ((peak - equity) / peak) * 100
            max_drawdown = max(max_drawdown, drawdown)
        return max_drawdown

    def _profit_factor(self, gross_profit: float, gross_loss: float) -> float:
        if gross_loss == 0:
            return gross_profit if gross_profit > 0 else 0.0
        return gross_profit / gross_loss

    def _annualized_pct(self, initial_equity: float, final_equity: float, duration_days: float) -> float:
        if initial_equity <= 0 or final_equity <= 0:
            return -100.0
        if duration_days < 1:
            return ((final_equity / initial_equity) - 1) * 100
        return (((final_equity / initial_equity) ** (365 / duration_days)) - 1) * 100

    def _serialize_trade(self, trade: BacktestTrade) -> dict[str, object]:
        payload = asdict(trade)
        payload["timestamp"] = trade.timestamp.isoformat()
        return payload


class GridBacktestRunner:
    def __init__(
        self,
        historical_loader: BinanceHistoricalKlineLoader,
        *,
        fee_rate: float = DEFAULT_GRID_FEE_RATE,
        slippage_rate: float = DEFAULT_GRID_SLIPPAGE_RATE,
        initial_btc_ratio: float = DEFAULT_GRID_INITIAL_BTC_RATIO,
    ) -> None:
        self._historical_loader = historical_loader
        self._fee_rate = fee_rate
        self._slippage_rate = slippage_rate
        self._initial_btc_ratio = initial_btc_ratio

    def run(
        self,
        config: GridBotConfig,
        *,
        initial_capital_usd: float,
        start: datetime | None = None,
        end: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> BacktestResult:
        config.validate()
        candles = self._historical_loader.load_candles(start=start, end=end)
        if not candles:
            raise ValueError("No historical candles available for the requested backtest window.")

        levels = self._build_levels(config)
        initial_price = candles[0].open
        capital = round(initial_capital_usd, 2)
        initial_btc = (capital * self._initial_btc_ratio) / initial_price
        initial_usdt = capital * (1 - self._initial_btc_ratio)
        usdt_balance = initial_usdt
        btc_balance = initial_btc
        inventory_lots: list[tuple[float, float]] = [(initial_btc, initial_price)] if initial_btc > 0 else []
        realized_pnls: list[float] = []
        trade_log: list[BacktestTrade] = []
        warnings: list[str] = []
        stop_loss_triggered = False
        upper_price_stop_triggered = False

        per_level_notional = max(capital * 0.9 / max(len(levels) - 1, 1), 10.0)
        active_orders = self._initialize_active_orders(levels, initial_price)
        equity_curve: list[float] = [capital]
        final_mark_price = initial_price
        final_open_time = candles[0].open_time

        for candle in candles:
            stop_price = self._stop_price(config)
            if stop_price is not None and candle.low <= stop_price and btc_balance > 0:
                trade = self._sell_all_at_stop(
                    candle=candle,
                    stop_price=stop_price,
                    btc_balance=btc_balance,
                    inventory_lots=inventory_lots,
                )
                trade_log.append(trade["trade"])
                realized_pnls.append(trade["realized_pnl"])
                usdt_balance += trade["net_proceeds"]
                btc_balance = 0.0
                inventory_lots.clear()
                stop_loss_triggered = True
                warnings.append("Stop-loss threshold was triggered and BTC inventory was liquidated.")
                equity_curve.append(usdt_balance)
                final_mark_price = stop_price
                final_open_time = candle.open_time
                break

            path, upper_stop_hit = self._candle_path_with_upper_stop(candle, config)
            for segment_start, segment_end in zip(path, path[1:]):
                usdt_balance, btc_balance = self._process_segment(
                    candle=candle,
                    levels=levels,
                    active_orders=active_orders,
                    start_price=segment_start,
                    end_price=segment_end,
                    per_level_notional=per_level_notional,
                    usdt_balance=usdt_balance,
                    btc_balance=btc_balance,
                    inventory_lots=inventory_lots,
                    trade_log=trade_log,
                    realized_pnls=realized_pnls,
                )

            mark_price = config.upper_price if upper_stop_hit else candle.close
            equity_curve.append(usdt_balance + (btc_balance * mark_price))
            final_mark_price = mark_price
            final_open_time = candle.open_time
            if upper_stop_hit:
                upper_price_stop_triggered = True
                warnings.append("Upper price threshold was reached and the backtest stopped.")
                break

        final_equity = round(usdt_balance + (btc_balance * final_mark_price), 2)
        completed_at = completed_at or datetime.now(timezone.utc)
        gross_profit = sum(pnl for pnl in realized_pnls if pnl > 0)
        gross_loss = abs(sum(pnl for pnl in realized_pnls if pnl < 0))
        winning_trades = sum(1 for pnl in realized_pnls if pnl > 0)
        closed_trades = len(realized_pnls)
        duration_days = max(
            (final_open_time - candles[0].open_time).total_seconds() / 86_400,
            1 / 24,
        )

        return BacktestResult(
            strategy=StrategyType.GRID.value,
            period_label=self._format_period_label(candles[0].open_time, final_open_time),
            started_at=candles[0].open_time.isoformat(),
            completed_at=completed_at.isoformat(),
            roi_pct=round(((final_equity / capital) - 1) * 100, 2),
            max_drawdown_pct=round(self._max_drawdown_pct(equity_curve), 2),
            profit_factor=round(self._profit_factor(gross_profit, gross_loss), 2),
            win_rate_pct=round((winning_trades / closed_trades) * 100, 1) if closed_trades else 0.0,
            trades=len(trade_log),
            annualized_pct=round(self._annualized_pct(capital, final_equity, duration_days), 2),
            start_equity_usd=round(capital, 2),
            final_equity_usd=final_equity,
            fee_rate=self._fee_rate,
            slippage_rate=self._slippage_rate,
            stop_loss_triggered=stop_loss_triggered,
            upper_price_stop_triggered=upper_price_stop_triggered,
            warnings=warnings,
            trade_log=[self._serialize_trade(trade) for trade in trade_log],
        )

    def default_window(self) -> tuple[datetime, datetime]:
        archives = self._historical_loader.available_archives()
        if not archives:
            raise ValueError("No historical archives are available for backtesting.")
        latest_candle = self._historical_loader._iter_archive_rows(archives[-1])[-1]
        end = latest_candle.open_time + timedelta(minutes=15)
        start = end - timedelta(days=DEFAULT_GRID_LOOKBACK_DAYS)
        return start, end

    def _build_levels(self, config: GridBotConfig) -> list[float]:
        return config.price_levels()

    def _initialize_active_orders(self, levels: list[float], initial_price: float) -> dict[int, str]:
        active_orders: dict[int, str] = {}
        for index, level in enumerate(levels):
            if level < initial_price:
                active_orders[index] = OrderSide.BUY.value
            elif level > initial_price:
                active_orders[index] = OrderSide.SELL.value
        return active_orders

    def _process_segment(
        self,
        *,
        candle: HistoricalCandle,
        levels: list[float],
        active_orders: dict[int, str],
        start_price: float,
        end_price: float,
        per_level_notional: float,
        usdt_balance: float,
        btc_balance: float,
        inventory_lots: list[tuple[float, float]],
        trade_log: list[BacktestTrade],
        realized_pnls: list[float],
    ) -> tuple[float, float]:
        if end_price == start_price:
            return usdt_balance, btc_balance

        moving_up = end_price > start_price
        current_price = start_price
        while True:
            next_level_index = self._next_triggered_level(
                levels=levels,
                active_orders=active_orders,
                current_price=current_price,
                target_price=end_price,
                moving_up=moving_up,
            )
            if next_level_index is None:
                return usdt_balance, btc_balance

            level = levels[next_level_index]
            side = active_orders[next_level_index]
            if side == OrderSide.BUY.value:
                result = self._execute_buy(
                    candle=candle,
                    level=level,
                    per_level_notional=per_level_notional,
                    usdt_balance=usdt_balance,
                )
                if result is None:
                    current_price = level
                    continue
                usdt_balance = result["usdt_balance"]
                btc_balance += result["amount"]
                inventory_lots.append((result["amount"], result["cost_basis_per_btc"]))
                trade_log.append(result["trade"])
                active_orders.pop(next_level_index, None)
                if next_level_index < len(levels) - 1:
                    active_orders[next_level_index + 1] = OrderSide.SELL.value
            else:
                result = self._execute_sell(
                    candle=candle,
                    level=level,
                    per_level_notional=per_level_notional,
                    btc_balance=btc_balance,
                    inventory_lots=inventory_lots,
                )
                if result is None:
                    current_price = level
                    continue
                usdt_balance += result["net_proceeds"]
                btc_balance = result["btc_balance"]
                realized_pnls.append(result["realized_pnl"])
                trade_log.append(result["trade"])
                active_orders.pop(next_level_index, None)
                if next_level_index > 0:
                    active_orders[next_level_index - 1] = OrderSide.BUY.value

            current_price = level

    def _next_triggered_level(
        self,
        *,
        levels: list[float],
        active_orders: dict[int, str],
        current_price: float,
        target_price: float,
        moving_up: bool,
    ) -> int | None:
        best_index: int | None = None
        best_level = inf if moving_up else -inf
        for index, level in enumerate(levels):
            side = active_orders.get(index)
            if moving_up:
                if side != OrderSide.SELL.value or not (current_price < level <= target_price):
                    continue
                if level < best_level:
                    best_level = level
                    best_index = index
            else:
                if side != OrderSide.BUY.value or not (target_price <= level < current_price):
                    continue
                if level > best_level:
                    best_level = level
                    best_index = index
        return best_index

    def _execute_buy(
        self,
        *,
        candle: HistoricalCandle,
        level: float,
        per_level_notional: float,
        usdt_balance: float,
    ) -> dict[str, object] | None:
        execution_price = round(level * (1 + self._slippage_rate), 2)
        quote_notional = min(per_level_notional, usdt_balance / (1 + self._fee_rate))
        if quote_notional <= 0:
            return None

        amount = round(quote_notional / execution_price, 6)
        if amount <= 0:
            return None

        gross_cost = amount * execution_price
        fee_usd = gross_cost * self._fee_rate
        total_cost = gross_cost + fee_usd
        if total_cost > usdt_balance:
            return None

        return {
            "amount": amount,
            "usdt_balance": round(usdt_balance - total_cost, 8),
            "cost_basis_per_btc": total_cost / amount,
            "trade": BacktestTrade(
                timestamp=candle.open_time,
                side=OrderSide.BUY.value,
                level=level,
                execution_price=execution_price,
                amount=amount,
                notional_usd=round(gross_cost, 2),
                fee_usd=round(fee_usd, 2),
                realized_pnl_usd=None,
                reason="Grid buy level filled during downward price move.",
            ),
        }

    def _execute_sell(
        self,
        *,
        candle: HistoricalCandle,
        level: float,
        per_level_notional: float,
        btc_balance: float,
        inventory_lots: list[tuple[float, float]],
    ) -> dict[str, object] | None:
        execution_price = round(level * (1 - self._slippage_rate), 2)
        target_amount = per_level_notional / execution_price
        amount = round(min(target_amount, btc_balance), 6)
        if amount <= 0:
            return None

        gross_proceeds = amount * execution_price
        fee_usd = gross_proceeds * self._fee_rate
        net_proceeds = gross_proceeds - fee_usd
        cost_basis = self._consume_inventory(inventory_lots, amount)
        realized_pnl = net_proceeds - cost_basis

        return {
            "btc_balance": round(btc_balance - amount, 8),
            "net_proceeds": round(net_proceeds, 8),
            "realized_pnl": round(realized_pnl, 8),
            "trade": BacktestTrade(
                timestamp=candle.open_time,
                side=OrderSide.SELL.value,
                level=level,
                execution_price=execution_price,
                amount=amount,
                notional_usd=round(gross_proceeds, 2),
                fee_usd=round(fee_usd, 2),
                realized_pnl_usd=round(realized_pnl, 2),
                reason="Grid sell level filled during upward price move.",
            ),
        }

    def _sell_all_at_stop(
        self,
        *,
        candle: HistoricalCandle,
        stop_price: float,
        btc_balance: float,
        inventory_lots: list[tuple[float, float]],
    ) -> dict[str, object]:
        execution_price = round(stop_price * (1 - self._slippage_rate), 2)
        gross_proceeds = btc_balance * execution_price
        fee_usd = gross_proceeds * self._fee_rate
        net_proceeds = gross_proceeds - fee_usd
        cost_basis = self._consume_inventory(inventory_lots, btc_balance)
        realized_pnl = net_proceeds - cost_basis
        return {
            "net_proceeds": round(net_proceeds, 8),
            "realized_pnl": round(realized_pnl, 8),
            "trade": BacktestTrade(
                timestamp=candle.open_time,
                side=OrderSide.SELL.value,
                level=stop_price,
                execution_price=execution_price,
                amount=round(btc_balance, 6),
                notional_usd=round(gross_proceeds, 2),
                fee_usd=round(fee_usd, 2),
                realized_pnl_usd=round(realized_pnl, 2),
                reason="Stop-loss liquidated remaining BTC inventory.",
            ),
        }

    def _consume_inventory(self, inventory_lots: list[tuple[float, float]], amount: float) -> float:
        remaining = amount
        cost_basis = 0.0
        while remaining > 0 and inventory_lots:
            lot_amount, lot_cost = inventory_lots[0]
            consumed = min(lot_amount, remaining)
            cost_basis += consumed * lot_cost
            lot_amount -= consumed
            remaining -= consumed
            if lot_amount <= 1e-9:
                inventory_lots.pop(0)
            else:
                inventory_lots[0] = (lot_amount, lot_cost)
        return cost_basis

    def _candle_path(self, candle: HistoricalCandle) -> list[float]:
        if candle.close >= candle.open:
            return [candle.open, candle.low, candle.high, candle.close]
        return [candle.open, candle.high, candle.low, candle.close]

    def _candle_path_with_upper_stop(
        self,
        candle: HistoricalCandle,
        config: GridBotConfig,
    ) -> tuple[list[float], bool]:
        path = self._candle_path(candle)
        if not config.stop_at_upper_enabled:
            return path, False

        if candle.open >= config.upper_price:
            return [config.upper_price], True

        truncated_path = [path[0]]
        for next_price in path[1:]:
            current_price = truncated_path[-1]
            moving_up = next_price > current_price
            touches_upper = (
                moving_up and current_price < config.upper_price <= next_price
            ) or (
                not moving_up and next_price <= config.upper_price < current_price
            )

            if touches_upper:
                if current_price != config.upper_price:
                    truncated_path.append(config.upper_price)
                return truncated_path, True

            truncated_path.append(next_price)

        return truncated_path, False

    def _stop_price(self, config: GridBotConfig) -> float | None:
        if not config.stop_loss_enabled or config.stop_loss_pct is None:
            return None
        return config.lower_price * (1 - (config.stop_loss_pct / 100))

    def _format_period_label(self, start: datetime, end: datetime) -> str:
        return f"{start:%Y-%m-%d} to {end:%Y-%m-%d}"

    def _max_drawdown_pct(self, equity_curve: list[float]) -> float:
        peak = equity_curve[0]
        max_drawdown = 0.0
        for equity in equity_curve:
            peak = max(peak, equity)
            if peak <= 0:
                continue
            drawdown = ((peak - equity) / peak) * 100
            max_drawdown = max(max_drawdown, drawdown)
        return max_drawdown

    def _profit_factor(self, gross_profit: float, gross_loss: float) -> float:
        if gross_loss == 0:
            return gross_profit if gross_profit > 0 else 0.0
        return gross_profit / gross_loss

    def _annualized_pct(self, initial_equity: float, final_equity: float, duration_days: float) -> float:
        if initial_equity <= 0 or final_equity <= 0:
            return -100.0
        if duration_days < 1:
            return ((final_equity / initial_equity) - 1) * 100
        return (((final_equity / initial_equity) ** (365 / duration_days)) - 1) * 100

    def _serialize_trade(self, trade: BacktestTrade) -> dict[str, object]:
        payload = asdict(trade)
        payload["timestamp"] = trade.timestamp.isoformat()
        return payload
