/**
 * UTXO Storage - Client-side and server-side UTXO management
 *
 * Stores UTXOs in localStorage (browser) or memory (server).
 * Used by the ZK privacy pool client to track commitments.
 */

// Local storage key for UTXOs
const UTXO_STORAGE_KEY = 'siphon_zk_utxos';

// UTXO interface
export interface StoredUtxo {
  commitment: string;
  nullifier: string;
  secret: string;
  value: string; // Amount in smallest units (lamports, base units)
  leafIndex: number;
  encryptedOutput: string;
  spent: boolean;
  tokenType: 'SOL' | 'SPL';
  mint?: string; // For SPL tokens
}

// Server-side storage (in-memory)
let serverUtxos: StoredUtxo[] = [];

/**
 * Load all UTXOs from storage.
 */
export function loadUtxos(): StoredUtxo[] {
  if (typeof window === 'undefined') {
    // Server-side
    return serverUtxos;
  }
  try {
    const stored = localStorage.getItem(UTXO_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save UTXOs to storage.
 */
export function saveUtxos(utxos: StoredUtxo[]): void {
  if (typeof window === 'undefined') {
    serverUtxos = utxos;
    return;
  }
  try {
    localStorage.setItem(UTXO_STORAGE_KEY, JSON.stringify(utxos));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Add a new UTXO to storage.
 */
export function addUtxo(utxo: StoredUtxo): void {
  const utxos = loadUtxos();
  // Check for duplicates
  if (!utxos.find(u => u.commitment === utxo.commitment)) {
    utxos.push(utxo);
    saveUtxos(utxos);
  }
}

/**
 * Mark a UTXO as spent.
 */
export function markUtxoSpent(commitment: string): void {
  const utxos = loadUtxos();
  const utxo = utxos.find(u => u.commitment === commitment);
  if (utxo) {
    utxo.spent = true;
    saveUtxos(utxos);
  }
}

/**
 * Get unspent UTXOs for a specific token type.
 *
 * @param tokenType - 'SOL' or 'USDC' (maps to SOL or SPL internally)
 * @param mint - Optional mint address for SPL tokens
 */
export function getUnspentUtxos(tokenType: string, mint?: string): StoredUtxo[] {
  const utxos = loadUtxos();

  // Map user-friendly names to internal types
  const isSPL = tokenType !== 'SOL';
  const internalType = isSPL ? 'SPL' : 'SOL';

  return utxos.filter(u => {
    if (u.spent) return false;
    if (u.tokenType !== internalType) return false;
    if (isSPL && mint && u.mint !== mint) return false;
    // For non-SOL tokens without explicit mint, match by tokenType name
    return true;
  });
}

/**
 * Get total balance for a token type.
 */
export function getTotalBalance(tokenType: string, mint?: string): bigint {
  const unspent = getUnspentUtxos(tokenType, mint);
  return unspent.reduce((sum, u) => sum + BigInt(u.value), 0n);
}

/**
 * Clear all UTXOs from storage (for testing).
 */
export function clearUtxos(): void {
  if (typeof window === 'undefined') {
    serverUtxos = [];
    return;
  }
  try {
    localStorage.removeItem(UTXO_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}
