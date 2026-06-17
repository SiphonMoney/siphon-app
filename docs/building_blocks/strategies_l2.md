# Level-2 Strategies

This document defines the five primary L2 strategy kinds, how they map to the Strategy block on the canvas, how the builder agent collects missing fields, and how execution payloads are built.

See also: [README](./README.md) for core building blocks and collaboration rules.

## Design principles

1. **One Strategy block** — kind is selected via `strategy` field; parameters change per kind.
2. **Three layers** — canvas graph → strategy spec (node fields) → execution plan (single vs scheduled).
3. **Backward compatible** — legacy kinds (Buy Dip, Sell Rally, DCA) remain parseable aliases.

## Runtime tiers

| Tier | Strategies | Behavior |
|------|------------|----------|
| `single_shot` | Limit Order, Stop Loss, Take Profit, Buy Dip, Sell Rally | One price trigger → one execution. Works with current ZK + payload API. |
| `scheduled` | Range, TWAP, DCA | Multiple executions over time or across grid levels. Executed by the trade-executor scheduler. |

Active in Build UI today: **Limit Order**, **Stop Loss**, **Take Profit**, **Range**, **TWAP**, **DCA**.

## Strategy kinds

### Limit Order

- **Intent:** Buy or sell when price reaches a limit.
- **Fields:** `side` (buy/sell), `priceGoal` (limit price)
- **Trigger:** buy → `price <= limit`; sell → `price >= limit`
- **Payload:** `LIMIT_BUY` or `LIMIT_SELL`; bound on `lower_bound` or `upper_bound`
- **Graph:** `Deposit → Strategy(limit) → Swap → Withdraw`

### Stop Loss

- **Intent:** Exit to protect downside when price falls to stop.
- **Fields:** `priceGoal` (stop price); default `side = sell`
- **Trigger:** `price <= stop`
- **Payload:** `STOP_LOSS`; `lower_bound = stop`
- **Graph:** `Deposit → Strategy(stop) → Swap → Withdraw`

### Take Profit

- **Intent:** Exit when price rises to target.
- **Fields:** `priceGoal` (target); default `side = sell`
- **Trigger:** `price >= target`
- **Payload:** `TAKE_PROFIT`; `upper_bound = target`
- **Graph:** `Deposit → Strategy(tp) → Swap → Withdraw`

### Range (grid)

- **Intent:** Trade between a low and high band across multiple grid levels.
- **Fields:** `rangeLow`, `rangeHigh`, `gridLevels`
- **Trigger:** multiple price levels inside band (executor expands grid)
- **Payload:** `RANGE_GRID`; `lower_bound`, `upper_bound`, `grid_levels`
- **Graph:** `Deposit → Strategy(range) → Swap → [Withdraw]`
- **Runtime:** scheduled — expands into grid legs and fills over time

### TWAP

- **Intent:** Split total size into equal slices over time (reduce market impact).
- **Fields:** `sliceCount`, `intervalSeconds`, optional `maxSlippageBps`
- **Trigger:** time-based (every `intervalSeconds`)
- **Payload:** `TWAP`; `slices`, `interval_sec`, optional `max_slippage_bps`
- **Graph:** `Deposit → Strategy(twap) → Swap → Withdraw`
- **Runtime:** scheduled — worker fires N swap legs (`amount / slices`) every `intervalSeconds`

### DCA

- **Intent:** Execute recurring periodic buys.
- **Fields:** `intervals` (human interval, e.g. `1 day`, `6h`, `300s`)
- **Trigger:** time-based (every parsed interval)
- **Payload:** `DCA`; `interval_sec`
- **Graph:** `Deposit → Strategy(dca) → Swap → Withdraw`
- **Runtime:** scheduled — worker executes one buy-sized leg each interval

## Strategy block field reference

| Field | Used by |
|-------|---------|
| `strategy` | All — kind selector |
| `side` | Limit Order |
| `priceGoal` | Limit, Stop Loss, Take Profit, Buy Dip, Sell Rally |
| `rangeLow`, `rangeHigh`, `gridLevels` | Range |
| `sliceCount`, `intervalSeconds`, `maxSlippageBps` | TWAP |
| `intervals` | DCA (legacy) |

Implementation: `src/lib/strategySpec.ts`, UI in `src/components/navs/Builder/BuildNodes.tsx`.

## Payload mapping

`buildStrategyPayload(kind, fields)` returns:

```ts
{
  strategy_type: string;
  side?: "buy" | "sell";
  upper_bound: number;
  lower_bound: number;
  grid_levels?: number;
  slices?: number;
  interval_sec?: number;
  max_slippage_bps?: number;
}
```

Merged with deposit/swap/withdraw context and ZK proof in `Build.tsx` → `createStrategy()`.

## Builder agent Q&A

The agent asks **one question at a time** for the first missing field:

| Kind | Typical question order |
|------|------------------------|
| Limit Order | token → amount → side → limit price → [swap to] → wallet |
| Stop Loss | token → amount → stop price → wallet |
| Take Profit | token → amount → target price → wallet |
| Range | token → amount → range low → range high → grid levels |
| TWAP | token → amount → slices → interval (seconds) |

Keyword detection lives in `src/builder_agent/blocks.ts` (`STRATEGY_KEYWORDS`).

## Legacy aliases

| Legacy kind | Maps to |
|-------------|---------|
| Buy Dip | Limit buy (`price <= dip`) |
| Sell Rally | Limit sell / take profit (`price >= target`) |
| DCA | Scheduled periodic buys (`intervals`) |

## Future: brackets (L2.5)

Take profit + stop loss on the same position (OCO) — one Strategy block with two triggers; cancel sibling on fill. Not implemented yet.

## File map

| File | Role |
|------|------|
| `src/lib/strategySpec.ts` | Types, validation, payload builder |
| `src/builder_agent/types.ts` | Parsed prompt + node data shapes |
| `src/builder_agent/parsePrompt.ts` | NLP extraction |
| `src/builder_agent/questions.ts` | Missing-field detection |
| `src/components/navs/Builder/Build.tsx` | Execution + ZK |
| `src/components/navs/Builder/BuildNodes.tsx` | Dynamic strategy fields |
