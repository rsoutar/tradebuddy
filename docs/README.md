# Documentation

This folder contains the strategy reference material for Oscar's current MVP.

## Strategy Diagrams

| Strategy | Best Fit | Source |
| --- | --- | --- |
| Grid | Range-bound markets where price is expected to oscillate between defined lower and upper bounds | [`grid-strategy-diagram.mmd`](./grid-strategy-diagram.mmd) |
| Rebalance | Long-term allocation management where BTC and USDT weights should stay near a target ratio | [`rebalance-strategy-diagram.mmd`](./rebalance-strategy-diagram.mmd) |
| Infinity Grid | Trending markets where the ladder should keep extending upward as price climbs | [`infinity-grid-strategy-diagram.mmd`](./infinity-grid-strategy-diagram.mmd) |

## How To Use These Files

- The `.mmd` files are Mermaid source diagrams.
- Open them in any Mermaid-capable editor or preview tool to render the flowchart.
- The diagrams are conceptual references for operator understanding and product communication. They are not exact execution traces of every code path in the backend.

## Strategy Notes

### Grid

Grid trading defines a lower bound, an upper bound, and a spacing percentage. The bot prepares laddered levels inside that range, buys on downward moves into lower levels, and sells as price rotates upward through higher levels. Optional stop-loss handling can halt the strategy if the market breaks the configured tolerance.

### Rebalance

Rebalance trading tracks the portfolio's BTC-to-USDT mix. When the observed allocation drifts beyond a configured threshold, the strategy calculates the trade size needed to move the portfolio back toward its target ratio.

### Infinity Grid

Infinity Grid uses a reference price and keeps extending the ladder as price trends higher. Instead of operating inside a fixed box, it recalculates levels around the current move and uses downside protection to exit when the market reverses beyond the configured tolerance.

## Related Docs

- [`../README.md`](../README.md) for repository setup and command references
- [`../backend/README.md`](../backend/README.md) for backend-focused setup and API examples
- [`../PRD.md`](../PRD.md) for product requirements
- [`../TASKS.md`](../TASKS.md) for implementation progress
