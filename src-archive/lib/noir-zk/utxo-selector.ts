import { getUnspentUtxos } from './utxo-storage';

export interface SelectedUtxo {
  commitment: string;
  nullifier: string;
  secret: string;
  value: string;
  leafIndex: number;
}

/**
 * Select UTXOs for a strategy based on required amount.
 *
 * Strategy: Use single UTXO if possible, otherwise combine multiple.
 *
 * @param tokenType - 'SOL', 'USDC', etc.
 * @param requiredAmount - Amount needed in smallest units (lamports for SOL)
 * @returns Array of selected UTXOs or null if insufficient balance
 */
export function selectUtxosForStrategy(
  tokenType: string,
  requiredAmount: number
): SelectedUtxo[] | null {
  const utxos = getUnspentUtxos(tokenType);

  if (utxos.length === 0) {
    console.warn(`[UTXO Selector] No UTXOs available for ${tokenType}`);
    return null;
  }

  const requiredBigInt = BigInt(requiredAmount);

  // Strategy 1: Find single UTXO with sufficient balance
  const singleUtxo = utxos.find(u => BigInt(u.value) >= requiredBigInt);
  if (singleUtxo) {
    console.log(`[UTXO Selector] Selected single UTXO with value ${singleUtxo.value}`);
    return [singleUtxo];
  }

  // Strategy 2: Combine multiple UTXOs
  const selected: SelectedUtxo[] = [];
  let totalValue = 0n;

  for (const utxo of utxos) {
    selected.push(utxo);
    totalValue += BigInt(utxo.value);

    if (totalValue >= requiredBigInt) {
      console.log(`[UTXO Selector] Selected ${selected.length} UTXOs with total value ${totalValue}`);
      return selected;
    }
  }

  // Insufficient balance
  console.warn(`[UTXO Selector] Insufficient balance: have ${totalValue}, need ${requiredBigInt}`);
  return null;
}

/**
 * Get total available balance for a token type.
 */
export function getAvailableBalance(tokenType: string): bigint {
  const utxos = getUnspentUtxos(tokenType);
  return utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
}
