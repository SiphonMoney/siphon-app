/**
 * Encrypted localStorage for private notes.
 *
 * Layout per key `{chainId}-{SYMBOL}-{commitment}`:
 * {
 *   nullifier_enc: "<ivB64>.<ctB64>",   // AES-GCM encrypted
 *   secret_enc:    "<ivB64>.<ctB64>",   // AES-GCM encrypted
 *   commitment:    "123...",             // plaintext — needed for on-chain leaf lookup
 *   precommitment: "456...",            // plaintext
 *   nullifierHash: "789...",            // plaintext — derived, not secret
 *   amount:        "0.5",               // plaintext — needed for balance calc without wallet prompt
 *   spent:         false,               // plaintext
 * }
 *
 * The encryption key is derived from a wallet signature via deriveLocalKey() in
 * localEncryption.ts — same key as the Supabase blob encryption, one MetaMask
 * prompt covers both. The key is cached per session so reads don't re-prompt.
 */
import { Signer } from 'ethers';
import { deriveLocalKey, encryptLocal, decryptLocal } from './localEncryption';

export interface StoredNote {
  nullifier:     string;
  secret:        string;
  commitment:    string;
  precommitment?: string;
  nullifierHash?: string;
  amount:        string;
  spent:         boolean | string;
}

export interface LocalNote {
  nullifier_enc:  string;
  secret_enc:     string;
  commitment:     string;
  precommitment?: string;
  nullifierHash?: string;
  amount:         string;
  spent:          boolean | string;
  owner?:         string; // plaintext depositing-wallet address — wrong-account hint, never secret
}

/** Write a note to localStorage with nullifier + secret encrypted. */
export async function writeNote(key: string, note: StoredNote, signer: Signer): Promise<void> {
  const encKey = await deriveLocalKey(signer);
  const owner = (await signer.getAddress()).toLowerCase(); // plaintext hint — never secret
  const row: LocalNote = {
    nullifier_enc:  await encryptLocal(encKey, note.nullifier),
    secret_enc:     await encryptLocal(encKey, note.secret),
    commitment:     note.commitment,
    precommitment:  note.precommitment,
    nullifierHash:  note.nullifierHash,
    amount:         note.amount,
    spent:          note.spent,
    owner,
  };
  localStorage.setItem(key, JSON.stringify(row));
}

/** Read and decrypt a note. Returns null if key missing, not a note, or decryption fails. */
export async function readNote(key: string, signer: Signer): Promise<StoredNote | null> {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  let row: LocalNote;
  try { row = JSON.parse(raw); } catch { return null; }
  if (!row.nullifier_enc || !row.secret_enc) return null;
  try {
    const encKey = await deriveLocalKey(signer);
    return {
      nullifier:     await decryptLocal(encKey, row.nullifier_enc),
      secret:        await decryptLocal(encKey, row.secret_enc),
      commitment:    row.commitment,
      precommitment: row.precommitment,
      nullifierHash: row.nullifierHash,
      amount:        row.amount,
      spent:         row.spent,
    };
  } catch {
    return null;
  }
}

/**
 * Mark a note spent without decrypting — reads raw row, sets spent flag, rewrites.
 * Safe to call without a signer since it doesn't touch encrypted fields.
 */
export function markNoteSpent(key: string): void {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const row = JSON.parse(raw);
    localStorage.setItem(key, JSON.stringify({ ...row, spent: true }));
  } catch { /* best-effort */ }
}

/**
 * Returns plaintext metadata for all note keys matching a prefix — used for
 * balance calculation without needing to decrypt (no signer required).
 */
export interface NoteMeta {
  key:          string;
  commitment:   string | undefined;
  nullifierHash: string | undefined;
  amount:       string;
  spent:        boolean | string;
  owner?:       string;
}

/**
 * On wallet connect, scan localStorage for deposit temp hints that survived a
 * page refresh between tx mining and `writeNote` (identified by `pending: true`
 * and a plaintext `nullifier` field rather than `nullifier_enc`).
 *
 * For each, look up the on-chain LeafInserted event whose precommitment matches,
 * then finalize the note under its commitment key and remove the temp hint.
 */
export async function recoverPendingHints(signer: Signer): Promise<void> {
  const hints: Array<{ key: string; nullifier: string; secret: string; precommitment: string; nullifierHash: string; amount: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) || '{}');
      // Temp hints have plaintext `nullifier` and `pending: true` — encrypted notes have `nullifier_enc`
      if (row.pending === true && row.nullifier && !row.nullifier_enc) {
        hints.push({ key, nullifier: row.nullifier, secret: row.secret, precommitment: row.precommitment, nullifierHash: row.nullifierHash ?? '', amount: row.amount });
      }
    } catch { /* skip */ }
  }
  if (hints.length === 0) return;
  console.log(`[recovery] Found ${hints.length} pending deposit hint(s)`);

  // Lazy-import to avoid circular deps between localNoteStore and zkHandler
  const { getLeafSet } = await import('./zkHandler');
  const { getNetwork, getSelectedChainId, getTokens } = await import('./networks');
  const chainId = getSelectedChainId();
  const net = getNetwork(chainId);
  const { ethers } = await import('ethers');
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const poseidonHash = (a: bigint, b: bigint): bigint => BigInt(F.toObject(poseidon([a, b])));
  const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  for (const hint of hints) {
    try {
      // Derive the token symbol from the hint key: `{chainId}-{SYMBOL}-{precommitment}`
      const parts = hint.key.split('-');
      if (parts.length < 3) continue;
      const symbol = parts[1].toUpperCase();
      const tokens = getTokens(chainId);
      const tok = tokens[symbol];
      const tokenAddress = symbol === 'ETH' ? NATIVE : tok?.address;
      if (!tokenAddress) continue;

      const decimals = tok ? tok.decimals : 18;
      const amountWei = ethers.parseUnits(hint.amount, decimals);
      const commitment = poseidonHash(amountWei, BigInt(hint.precommitment));
      const commitmentStr = commitment.toString();

      const leafSet = await getLeafSet(tokenAddress, chainId);
      if (!leafSet.has(commitmentStr)) {
        console.log(`[recovery] Precommitment ${hint.precommitment.slice(0, 12)}… not on-chain yet — keeping hint`);
        continue;
      }

      const finalKey = `${chainId}-${symbol}-${commitmentStr}`;

      await writeNote(finalKey, {
        nullifier:     hint.nullifier,
        secret:        hint.secret,
        commitment:    commitmentStr,
        precommitment: hint.precommitment,
        nullifierHash: hint.nullifierHash,
        amount:        hint.amount,
        spent:         false,
      }, signer);
      localStorage.removeItem(hint.key);
      console.log(`[recovery] Recovered deposit: ${hint.key} → ${finalKey}`);
    } catch (e) {
      console.warn('[recovery] Failed to recover hint', hint.key, e);
    }
  }
}

export function scanNoteMeta(prefix: string): NoteMeta[] {
  const results: NoteMeta[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) || '{}');
      if (!row.amount) continue;
      results.push({
        key,
        commitment:    row.commitment != null ? String(row.commitment) : undefined,
        nullifierHash: row.nullifierHash != null ? String(row.nullifierHash) : undefined,
        amount:        String(row.amount),
        spent:         row.spent,
        owner:         row.owner != null ? String(row.owner) : undefined,
      });
    } catch { /* skip */ }
  }
  return results;
}
