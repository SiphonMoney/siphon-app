import { BN } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { SOLANA_TOKEN_MAP } from './solanaHandler';
import { depositSOLClientSide, depositSPLClientSide } from './noir-zk/client-deposit';

// UTXO storage key
const UTXO_STORAGE_KEY = 'siphon_zk_utxos';

interface StoredUtxo {
  commitment: string;
  nullifier: string;
  secret: string;
  value: string;
  leafIndex: number;
  encryptedOutput: string;
  spent: boolean;
  tokenType: 'SOL' | 'SPL';
  mint?: string;
}

// Load UTXOs from localStorage
function loadUtxos(): StoredUtxo[] {
  try {
    const stored = localStorage.getItem(UTXO_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save UTXOs to localStorage and dispatch event for UI updates
function saveUtxos(utxos: StoredUtxo[]): void {
  try {
    localStorage.setItem(UTXO_STORAGE_KEY, JSON.stringify(utxos));
    console.log('[ZK Pool] Saved UTXOs to localStorage:', utxos.length, 'total');

    // Dispatch event so UI components can refresh balances immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zkPoolBalanceChanged'));
    }
  } catch (e) {
    console.error('[ZK Pool] Failed to save UTXOs:', e);
  }
}

// Debug function to inspect localStorage UTXOs
export function debugUtxos(): void {
  const utxos = loadUtxos();
  console.log('[ZK Pool DEBUG] All UTXOs:', utxos);
  console.log('[ZK Pool DEBUG] Unspent SOL:', utxos.filter(u => !u.spent && u.tokenType === 'SOL'));
  console.log('[ZK Pool DEBUG] Spent:', utxos.filter(u => u.spent));
}

// Add UTXO to localStorage
function addUtxo(utxo: StoredUtxo): void {
  const utxos = loadUtxos();
  // Check for duplicates
  if (!utxos.find(u => u.commitment === utxo.commitment)) {
    utxos.push(utxo);
    saveUtxos(utxos);
    console.log('[ZK Pool] UTXO stored in localStorage');
  }
}

// Get unspent UTXOs
export function getUnspentUtxos(tokenType: 'SOL' | 'SPL', mint?: string): StoredUtxo[] {
  const utxos = loadUtxos();
  return utxos.filter(u => {
    if (u.spent) return false;
    if (u.tokenType !== tokenType) return false;
    if (tokenType === 'SPL' && u.mint !== mint) return false;
    return true;
  });
}

// Get total balance from unspent UTXOs
export function getZkPoolBalance(tokenSymbol: string): number {
  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) return 0;

  // Determine token type and mint
  const tokenType: 'SOL' | 'SPL' = tokenSymbol.toUpperCase() === 'SOL' ? 'SOL' : 'SPL';
  const mint = tokenType === 'SPL' ? token.mint.toBase58() : undefined;

  // Get unspent UTXOs for this specific token
  const unspent = getUnspentUtxos(tokenType, mint);
  const totalAmount = unspent.reduce((sum, u) => sum + BigInt(u.value), 0n);
  const balance = Number(totalAmount) / Math.pow(10, token.decimals);

  console.log(`[ZK Pool] getZkPoolBalance(${tokenSymbol}): ${unspent.length} unspent UTXOs, total=${balance}`);

  return balance;
}

// Mark UTXO as spent
export function markUtxoSpent(commitment: string): void {
  const utxos = loadUtxos();
  const utxo = utxos.find(u => u.commitment === commitment);
  if (utxo) {
    utxo.spent = true;
    saveUtxos(utxos);
    console.log('[ZK Pool] UTXO marked as spent');
  }
}

/**
 * Reserve funds for a strategy by marking UTXOs as spent.
 * If there's change (leftover), creates a new local "change" UTXO.
 * Returns the commitments that were marked so they can be tracked.
 */
export function reserveFundsForStrategy(
  tokenSymbol: string,
  amount: number
): { success: boolean; reservedCommitments: string[]; changeAmount?: number; error?: string } {
  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    return { success: false, reservedCommitments: [], error: `Token not supported: ${tokenSymbol}` };
  }

  const lamports = BigInt(Math.floor(amount * Math.pow(10, token.decimals)));

  // Get unspent UTXOs
  const tokenType: 'SOL' | 'SPL' = tokenSymbol.toUpperCase() === 'SOL' ? 'SOL' : 'SPL';
  const mint = tokenType === 'SPL' ? token.mint.toBase58() : undefined;
  const unspentUtxos = getUnspentUtxos(tokenType, mint);

  if (unspentUtxos.length === 0) {
    return { success: false, reservedCommitments: [], error: 'No UTXOs available' };
  }

  // Find UTXOs that sum to at least the requested amount
  let totalValue = 0n;
  const utxosToReserve: typeof unspentUtxos = [];

  for (const utxo of unspentUtxos) {
    utxosToReserve.push(utxo);
    totalValue += BigInt(utxo.value);
    if (totalValue >= lamports) break;
  }

  if (totalValue < lamports) {
    const have = Number(totalValue) / Math.pow(10, token.decimals);
    return {
      success: false,
      reservedCommitments: [],
      error: `Insufficient balance. Have ${have.toFixed(6)} ${tokenSymbol}, need ${amount}`
    };
  }

  // Calculate change amount
  const changeValue = totalValue - lamports;
  const changeAmount = Number(changeValue) / Math.pow(10, token.decimals);

  console.log(`[ZK Pool] Reserving: totalValue=${totalValue}, lamports=${lamports}, changeValue=${changeValue}`);

  // Load all UTXOs for modification
  const allUtxos = loadUtxos();
  console.log(`[ZK Pool] Loaded ${allUtxos.length} UTXOs from localStorage`);

  // Mark UTXOs as spent (reserved)
  const reservedCommitments: string[] = [];
  for (const utxo of utxosToReserve) {
    const idx = allUtxos.findIndex(u => u.commitment === utxo.commitment);
    if (idx !== -1) {
      allUtxos[idx].spent = true;
      reservedCommitments.push(utxo.commitment);
    }
  }

  // If there's change, create a new local "change" UTXO
  // We use the last reserved UTXO as the basis and modify the value
  if (changeValue > 0n && utxosToReserve.length > 0) {
    const lastUtxo = utxosToReserve[utxosToReserve.length - 1];

    // Create a change UTXO with a modified commitment (append "_change" to make it unique)
    // Note: This is simplified local accounting - the actual on-chain UTXO splitting
    // happens when the strategy executes and creates proper change commitments
    const changeUtxo: StoredUtxo = {
      commitment: `${lastUtxo.commitment}_change_${Date.now()}`,
      nullifier: `${lastUtxo.nullifier}_change_${Date.now()}`,
      secret: lastUtxo.secret,
      value: changeValue.toString(),
      leafIndex: lastUtxo.leafIndex,
      encryptedOutput: lastUtxo.encryptedOutput,
      spent: false,
      tokenType: lastUtxo.tokenType,
      mint: lastUtxo.mint,
    };

    allUtxos.push(changeUtxo);
    console.log(`[ZK Pool] Created change UTXO:`, changeUtxo);
    console.log(`[ZK Pool] Change amount: ${changeAmount.toFixed(6)} ${tokenSymbol}`);
  }

  // Save all changes
  saveUtxos(allUtxos);

  console.log(`[ZK Pool] Reserved ${amount} ${tokenSymbol} for strategy (${reservedCommitments.length} UTXOs, change: ${changeAmount.toFixed(6)} ${tokenSymbol})`);
  return { success: true, reservedCommitments, changeAmount };
}

/**
 * Deposit to ZK privacy pool - CLIENT-SIDE with user wallet signature.
 * User signs the transaction with their wallet (Phantom popup).
 */
export async function depositToZkPool(
  connection: Connection,
  wallet: WalletContextState,
  tokenSymbol: string,
  amount: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  console.log('[ZK Pool] depositToZkPool() called', { tokenSymbol, amount });

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    console.error(`[ZK Pool] Token not supported: ${tokenSymbol}`);
    return { success: false, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    const amountBN = new BN(parseFloat(amount) * Math.pow(10, token.decimals));
    const smallestUnits = amountBN.toNumber();

    let result;

    // Call appropriate deposit function based on token type
    if (tokenSymbol.toUpperCase() === 'SOL') {
      result = await depositSOLClientSide(connection, wallet, smallestUnits);
    } else {
      // SPL token (USDC, etc.)
      result = await depositSPLClientSide(connection, wallet, token.mint, smallestUnits, token.decimals);
    }

    if (result.success && result.commitment && result.nullifier && result.secret) {
      console.log('[ZK Pool] Deposit successful:', result.signature);

      // Store UTXO in browser localStorage for future withdrawals
      const utxo: StoredUtxo = {
        commitment: result.commitment,
        nullifier: result.nullifier,
        secret: result.secret,
        value: smallestUnits.toString(),
        leafIndex: result.leafIndex!,
        encryptedOutput: result.encryptedOutput!,
        spent: false,
        tokenType: tokenSymbol.toUpperCase() === 'SOL' ? 'SOL' : 'SPL',
        mint: tokenSymbol.toUpperCase() === 'SOL' ? undefined : token.mint.toBase58(),
      };

      addUtxo(utxo);
      return { success: true, signature: result.signature };
    } else {
      console.error('[ZK Pool] Deposit failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Deposit failed';
    console.error('[ZK Pool] Deposit error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Withdraw from ZK privacy pool via API route.
 * The API route handles the relayer logic and proof generation server-side.
 */
export async function withdrawFromZkPool(
  tokenSymbol: string,
  amount: string,
  recipientAddress: string,
  onProgress?: (step: string, progress: number) => void
): Promise<{ success: boolean; signature?: string; error?: string }> {
  console.log('[ZK Pool] withdrawFromZkPool() called', { tokenSymbol, amount, recipientAddress });

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    console.error(`[ZK Pool] Token not supported: ${tokenSymbol}`);
    return { success: false, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    const amountBN = new BN(parseFloat(amount) * Math.pow(10, token.decimals));
    const lamports = amountBN.toNumber();

    // Get unspent UTXOs from localStorage
    const tokenType: 'SOL' | 'SPL' = tokenSymbol.toUpperCase() === 'SOL' ? 'SOL' : 'SPL';
    const mint = tokenType === 'SPL' ? token.mint.toBase58() : undefined;
    const unspentUtxos = getUnspentUtxos(tokenType, mint);

    if (unspentUtxos.length === 0) {
      return { success: false, error: 'No UTXOs available for withdrawal' };
    }

    // Find UTXOs that sum to at least the requested amount
    let totalValue = 0n;
    const utxosToSpend: StoredUtxo[] = [];

    for (const utxo of unspentUtxos) {
      utxosToSpend.push(utxo);
      totalValue += BigInt(utxo.value);
      if (totalValue >= BigInt(lamports)) break;
    }

    if (totalValue < BigInt(lamports)) {
      return {
        success: false,
        error: `Insufficient balance. Have ${Number(totalValue) / Math.pow(10, token.decimals)} ${tokenSymbol}, need ${amount}`
      };
    }

    console.log(`[ZK Pool] Using ${utxosToSpend.length} UTXO(s) for withdrawal`);
    onProgress?.('Sending withdrawal request', 10);

    // Call the direct withdraw endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    try {
      const response = await fetch('/api/noir-zk/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenType: tokenSymbol.toUpperCase(),
          amount: lamports,
          recipientAddress,
          mintAddress: tokenType === 'SPL' ? mint : undefined,
          utxos: utxosToSpend.map(u => ({
            commitment: u.commitment,
            nullifier: u.nullifier,
            secret: u.secret,
            value: u.value,
            leafIndex: u.leafIndex,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ZK Pool] Withdraw request failed:', response.status, errorText);
        return { success: false, error: `Server error: ${response.status}` };
      }

      const result = await response.json();

      if (result.success) {
        console.log('[ZK Pool] Withdrawal successful:', result.signature);
        onProgress?.('Complete', 100);

        // Mark UTXOs as spent
        utxosToSpend.forEach(utxo => markUtxoSpent(utxo.commitment));

        return { success: true, signature: result.signature };
      } else {
        console.error('[ZK Pool] Withdrawal failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return { success: false, error: 'Request timed out. The withdrawal may still be processing.' };
      }
      throw fetchError;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Withdrawal failed';
    console.error('[ZK Pool] Withdrawal error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Minimum rent-exempt balance on Solana (approximately 0.00089 SOL)
const MIN_RENT_EXEMPT_LAMPORTS = 890880;

/**
 * Pay strategy execution fee from ZK pool.
 * This withdraws a fee amount to the protocol fee recipient.
 * Returns the remaining UTXOs that can be used for strategy execution.
 *
 * Note: For SOL, if the fee is below rent-exempt threshold, we skip the on-chain
 * withdrawal and return success (fee will be collected differently or waived for small amounts).
 */
export async function payStrategyFee(
  tokenSymbol: string,
  feeAmount: number,
  feeRecipientAddress: string
): Promise<{
  success: boolean;
  signature?: string;
  remainingBalance?: number;
  utxosForStrategy?: StoredUtxo[];
  error?: string;
  skipped?: boolean;
}> {
  console.log('[ZK Pool] payStrategyFee() called', { tokenSymbol, feeAmount, feeRecipientAddress });

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    return { success: false, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    const feeLamports = Math.floor(feeAmount * Math.pow(10, token.decimals));

    // For SOL, check if fee is below rent-exempt threshold
    // If so, skip the withdrawal (fee is too small to transfer on-chain)
    if (tokenSymbol.toUpperCase() === 'SOL' && feeLamports < MIN_RENT_EXEMPT_LAMPORTS) {
      console.log(`[ZK Pool] Fee (${feeLamports} lamports) is below rent-exempt threshold (${MIN_RENT_EXEMPT_LAMPORTS}), skipping on-chain payment`);

      // Get unspent UTXOs for balance calculation
      const tokenType: 'SOL' | 'SPL' = 'SOL';
      const unspentUtxos = getUnspentUtxos(tokenType, undefined);
      const totalValue = unspentUtxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
      const totalBalance = Number(totalValue) / Math.pow(10, token.decimals);

      return {
        success: true,
        skipped: true,
        remainingBalance: totalBalance,
        utxosForStrategy: unspentUtxos
      };
    }

    // Get unspent UTXOs
    const tokenType: 'SOL' | 'SPL' = tokenSymbol.toUpperCase() === 'SOL' ? 'SOL' : 'SPL';
    const mint = tokenType === 'SPL' ? token.mint.toBase58() : undefined;
    const unspentUtxos = getUnspentUtxos(tokenType, mint);

    if (unspentUtxos.length === 0) {
      return { success: false, error: 'No UTXOs available for fee payment' };
    }

    // Calculate total balance
    const totalValue = unspentUtxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    const totalBalance = Number(totalValue) / Math.pow(10, token.decimals);

    if (totalValue < BigInt(feeLamports)) {
      return {
        success: false,
        error: `Insufficient balance for fee. Have ${totalBalance} ${tokenSymbol}, need ${feeAmount}`
      };
    }

    // Calculate remaining balance after fee
    const remainingBalance = totalBalance - feeAmount;

    // Pay fee via withdrawal to fee recipient
    const response = await fetch('/api/noir-zk/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenType: tokenSymbol.toUpperCase(),
        amount: feeLamports,
        recipientAddress: feeRecipientAddress,
        mintAddress: tokenType === 'SPL' ? mint : undefined,
        utxos: unspentUtxos.slice(0, 1).map(u => ({
          commitment: u.commitment,
          nullifier: u.nullifier,
          secret: u.secret,
          value: u.value,
          leafIndex: u.leafIndex,
        })),
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('[ZK Pool] Fee payment successful:', result.signature);

      // Mark used UTXO as spent
      markUtxoSpent(unspentUtxos[0].commitment);

      // Return remaining UTXOs for strategy
      const remainingUtxos = unspentUtxos.slice(1);

      return {
        success: true,
        signature: result.signature,
        remainingBalance,
        utxosForStrategy: remainingUtxos
      };
    } else {
      console.error('[ZK Pool] Fee payment failed:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Fee payment failed';
    console.error('[ZK Pool] Fee payment error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Calculate strategy execution cost.
 * Based on execution window duration.
 */
export function calculateStrategyCost(runDuration: string): {
  variableCost: number;
  fixedCost: number;
  totalCost: number
} {
  // Parse duration
  const durationMap: Record<string, number> = {
    '1h': 1, '2h': 2, '3h': 3, '6h': 6, '12h': 12, '24h': 24,
    '2d': 48, '3d': 72, '7d': 168, '14d': 336, '30d': 720,
    '60d': 1440, '90d': 2160, '180d': 4320, '365d': 8760
  };

  const hours = durationMap[runDuration] || 24;

  // Variable cost: ~$0.01 per hour of monitoring
  const variableCost = hours * 0.01;

  // Fixed cost: base execution fee
  const fixedCost = 0.05; // $0.05 USD base fee

  const totalCost = variableCost + fixedCost;

  return { variableCost, fixedCost, totalCost };
}
