/**
 * Siphon dynamic fee model — frontend source of truth.
 * MUST stay in sync with siphon-fhe/trade-executor/fee_config.py (the backend actually charges).
 *
 *   Part A  Arming fee   (upfront, non-refundable): BASE_ARM + PER_HOUR_ARM * windowHours, capped.
 *   Part B  Execution fee (per fill, from the trade): max(MIN_EXEC, EXEC_BPS * notional) + gas.
 */
export const FEE = {
  // Part B — execution
  EXEC_BPS: 20,            // 0.20% of notional
  MIN_EXEC_USD: 0.20,
  GAS_REIMBURSE_USD: 0.10,
  // Part A — arming
  BASE_ARM_USD: 0.20,
  PER_HOUR_ARM_USD: 0.05,
  ARM_CAP_USD: 5.0,
} as const;

/** Part A: upfront arming fee (USD), capped. Charged once at strategy creation. */
export function armingFeeUsd(windowHours: number): number {
  const hours = Math.max(0, windowHours || 0);
  return Math.min(FEE.BASE_ARM_USD + FEE.PER_HOUR_ARM_USD * hours, FEE.ARM_CAP_USD);
}

/** Part B: per-fill execution fee (USD) deducted from the trade output. */
export function executionFeeUsd(notionalUsd: number): number {
  const bps = (FEE.EXEC_BPS / 10000) * Math.max(0, notionalUsd || 0);
  return Math.max(FEE.MIN_EXEC_USD, bps) + FEE.GAS_REIMBURSE_USD;
}
