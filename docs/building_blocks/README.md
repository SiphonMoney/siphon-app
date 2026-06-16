# Siphon Builder: Strategies & Building Blocks

This document defines how strategy prompts should map into visual blocks in the Build page, and how blocks collaborate to produce an executable flow.

## Goal

The Builder should let a user describe intent in plain language, then have the LLM:

1. infer the strategy structure,
2. create the right blocks,
3. connect them in valid order,
4. prefill fields with sensible defaults,
5. keep the graph logically executable.

## Core Building Blocks

### 1) Deposit Block
- Purpose: source funds into the strategy.
- Typical fields:
  - `chain`
  - `coin`
  - `amount`
- Output contract: provides input asset + amount to downstream blocks.

### 2) Strategy Block
- Purpose: hold strategy condition and behavior.
- Typical fields:
  - `strategy` (e.g. Limit Order, Buy Dip, Sell Rally, DCA)
  - `priceGoal`
  - `intervals` (for periodic strategies)
- Output contract: a trigger or rule decision used by execution blocks.

### 3) Swap Block
- Purpose: convert one asset into another on a venue.
- Typical fields:
  - `dex`
  - `coin` (from)
  - `amount`
  - `toCoin`
  - `toAmount` (derived/estimated)
- Output contract: transformed asset for optional withdrawal.

### 4) Withdraw Block
- Purpose: deliver resulting asset to destination wallet.
- Typical fields:
  - `chain`
  - `coin`
  - `amount`
  - `wallet`
- Output contract: terminal state of strategy.

## Collaboration Rules (Block-to-Block Logic)

Expected canonical flow:

`Deposit -> Strategy -> Swap -> Withdraw`

Allowed variants:
- `Deposit -> Strategy -> Withdraw` (no swap)
- `Deposit -> Swap -> Withdraw` (manual flow without explicit strategy)

Validation rules:
- At least one `Deposit` is required.
- A terminal action (`Swap` or `Withdraw`) is required.
- `Withdraw.wallet` is required for executable flow.
- Asset continuity should be preserved where possible:
  - `Deposit.coin` should feed `Swap.coin` or `Withdraw.coin`.
  - `Swap.toCoin` should feed `Withdraw.coin`.

## Prompt-to-Graph Mapping Spec

When user enters a strategy prompt:

1. **Intent parse**
   - Identify action verbs: deposit, buy, sell, swap, withdraw, rebalance, DCA.
   - Extract entities: token symbols, target prices, amounts, wallets, chain/dex preferences.

2. **Block planning**
   - Build minimal valid block set.
   - Prefer fewer blocks unless prompt explicitly requests advanced flow.

3. **Field prefill**
   - Fill directly extracted values first.
   - Fill missing values with safe defaults and mark them as editable.

4. **Edge synthesis**
   - Connect blocks in the nearest valid canonical sequence.
   - Prevent disconnected terminal blocks.

5. **Sanity checks**
   - Verify required fields.
   - Surface unresolved fields as user TODOs.

## Strategy Profiles (Current)

### Limit Order
- Trigger once price reaches target.
- Typical graph: `Deposit -> Strategy(limit) -> Swap -> Withdraw`.

### Buy Dip
- Trigger when price falls below threshold.
- Typical graph: `Deposit -> Strategy(buyDip) -> Swap -> Withdraw`.

### Sell Rally
- Trigger when price rises to target.
- Typical graph: `Deposit -> Strategy(sellRally) -> Swap -> Withdraw`.

### DCA
- Execute periodic buys/sells by interval.
- Typical graph: `Deposit -> Strategy(dca) -> Swap`.

## UX Notes for Builder Input

- Input should sit bottom-center with breathing room from screen edge.
- Enter key should submit prompt.
- While AI execution is pending:
  - lock submit button,
  - show "Building flow..." state,
  - apply graph changes atomically to avoid partial inconsistent states.

## Future Extensions

- Multi-branch strategy graphs (IF/ELSE conditions).
- Risk and guardrail blocks (max slippage, stop loss, budget cap).
- Reusable templates generated from successful user strategies.
