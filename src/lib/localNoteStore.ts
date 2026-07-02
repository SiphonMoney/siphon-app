/**
 * noteStore — single module responsible for all note persistence.
 *
 * localStorage layout per key `siphon-note-{chainId}-{SYMBOL}-{commitment}`:
 * {
 *   nullifier_enc:  "<ivB64>.<ctB64>",   // AES-GCM(nullifier)
 *   secret_enc:     "<ivB64>.<ctB64>",   // AES-GCM(secret)
 *   commitment:     "123...",             // plaintext — on-chain leaf value
 *   precommitment:  "456...",            // plaintext — Poseidon(nullifier, secret)
 *   nullifierHash:  "789...",            // plaintext — Poseidon(nullifier)
 *   amount:         "0.5",               // plaintext — human units
 *   spent:          "false"|"pending"|"true",
 *   owner:          "0x...",             // plaintext wallet address — wrong-account hint
 * }
 *
 * No plaintext secrets ever touch localStorage. Pre-tx notes are written immediately
 * as spent:'pending' (commitment is computable before the tx sends), then flipped to
 * spent:'false' on confirm or spent:'true' on revert. This removes the entire class of
 * "plaintext hint survives a crash" vulnerabilities.
 *
 * Encryption key: AES-GCM, derived from wallet signature via deriveEncKey() in noteAuth.ts.
 * One MetaMask prompt per session covers all reads and writes.
 */
import { Signer } from 'ethers';
import { deriveLocalKey, encryptLocal, decryptLocal } from './localEncryption';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StoredNote {
  nullifier:     string;
  secret:        string;
  commitment:    string;
  precommitment: string;
  nullifierHash: string;
  amount:        string;
  spent:         'false' | 'pending' | 'true';
}

export interface NoteMeta {
  key:          string;
  commitment:   string;
  precommitment: string;
  nullifierHash: string;
  amount:       string;
  spent:        string;
  owner:        string;
}

// ── Key helpers ────────────────────────────────────────────────────────────

export function noteKey(chainId: number, symbol: string, commitment: string): string {
  return `siphon-note-${chainId}-${symbol.toUpperCase()}-${commitment}`;
}

/** Parse chainId/symbol/commitment from a siphon-note-* key. Returns null if not a note key. */
export function parseNoteKey(key: string): { chainId: number; symbol: string; commitment: string } | null {
  if (!key.startsWith('siphon-note-')) return null;
  const parts = key.split('-');
  // siphon-note-{chainId}-{SYMBOL}-{commitment}  → 5 parts
  if (parts.length < 5) return null;
  const chainId = Number(parts[2]);
  const symbol  = parts[3];
  const commitment = parts.slice(4).join('-'); // commitment is a plain decimal, no dashes, but be safe
  if (!chainId || !symbol || !commitment) return null;
  return { chainId, symbol, commitment };
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Write a note to localStorage with nullifier + secret AES-GCM encrypted.
 * Always writes under `siphon-note-{chainId}-{symbol}-{commitment}`.
 * Use spent:'pending' pre-tx, flip to 'false' on confirm, 'true' on revert.
 */
export async function writeNoteTyped(
  chainId: number,
  symbol: string,
  note: StoredNote,
  signer: Signer,
): Promise<void> {
  const encKey = await deriveLocalKey(signer);
  const owner  = (await signer.getAddress()).toLowerCase();
  const row = {
    nullifier_enc:  await encryptLocal(encKey, note.nullifier),
    secret_enc:     await encryptLocal(encKey, note.secret),
    commitment:     note.commitment,
    precommitment:  note.precommitment,
    nullifierHash:  note.nullifierHash,
    amount:         note.amount,
    spent:          note.spent,
    owner,
  };
  localStorage.setItem(noteKey(chainId, symbol, note.commitment), JSON.stringify(row));
}

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Read and decrypt a note by chainId + symbol + commitment.
 * Returns null if missing or decryption fails. Never throws.
 */
export async function readNoteTyped(
  chainId: number,
  symbol: string,
  commitment: string,
  signer: Signer,
): Promise<StoredNote | null> {
  const raw = localStorage.getItem(noteKey(chainId, symbol, commitment));
  if (!raw) return null;
  let row: Record<string, unknown>;
  try { row = JSON.parse(raw); } catch { return null; }
  if (!row.nullifier_enc || !row.secret_enc) return null;
  try {
    const encKey = await deriveLocalKey(signer);
    return {
      nullifier:     await decryptLocal(encKey, row.nullifier_enc as string),
      secret:        await decryptLocal(encKey, row.secret_enc as string),
      commitment:    String(row.commitment ?? commitment),
      precommitment: String(row.precommitment ?? ''),
      nullifierHash: String(row.nullifierHash ?? ''),
      amount:        String(row.amount ?? '0'),
      spent:         (row.spent as 'false' | 'pending' | 'true') ?? 'false',
    };
  } catch {
    return null;
  }
}

/**
 * Read a note by its localStorage key directly (used during migration from old key format).
 */
export async function readNoteByKey(key: string, signer: Signer): Promise<StoredNote | null> {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  let row: Record<string, unknown>;
  try { row = JSON.parse(raw); } catch { return null; }
  if (!row.nullifier_enc || !row.secret_enc) return null;
  try {
    const encKey = await deriveLocalKey(signer);
    return {
      nullifier:     await decryptLocal(encKey, row.nullifier_enc as string),
      secret:        await decryptLocal(encKey, row.secret_enc as string),
      commitment:    String(row.commitment ?? ''),
      precommitment: String(row.precommitment ?? ''),
      nullifierHash: String(row.nullifierHash ?? ''),
      amount:        String(row.amount ?? '0'),
      spent:         (row.spent as 'false' | 'pending' | 'true') ?? 'false',
    };
  } catch {
    return null;
  }
}

// ── Scan (no decryption) ───────────────────────────────────────────────────

/**
 * Scan localStorage for all notes for a chainId+symbol.
 * Does NOT decrypt — reads plaintext metadata only. Safe to call without a signer.
 * Covers both new (siphon-note-*) and legacy ({chainId}-{SYMBOL}-*) key formats.
 */
export function scanNotes(chainId: number, symbol: string): NoteMeta[] {
  const newPrefix = `siphon-note-${chainId}-${symbol.toUpperCase()}-`;
  const legPrefix = `${chainId}-${symbol.toUpperCase()}-`;
  const results: NoteMeta[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const isNew    = key.startsWith(newPrefix);
    const isLegacy = !isNew && key.startsWith(legPrefix);
    if (!isNew && !isLegacy) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!row.nullifier_enc || !row.secret_enc || !row.commitment || !row.amount) continue;
      results.push({
        key,
        commitment:    String(row.commitment),
        precommitment: String(row.precommitment ?? ''),
        nullifierHash: String(row.nullifierHash ?? ''),
        amount:        String(row.amount),
        spent:         String(row.spent ?? 'false'),
        owner:         String(row.owner ?? ''),
      });
    } catch { /* skip corrupt entries */ }
  }
  return results;
}

/**
 * Scan ALL siphon notes across all chains/assets. Used for cross-chain operations.
 */
export function scanAllNoteMeta(): NoteMeta[] {
  const results: NoteMeta[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('siphon-note-')) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!row.nullifier_enc || !row.secret_enc || !row.commitment || !row.amount) continue;
      results.push({
        key,
        commitment:    String(row.commitment),
        precommitment: String(row.precommitment ?? ''),
        nullifierHash: String(row.nullifierHash ?? ''),
        amount:        String(row.amount),
        spent:         String(row.spent ?? 'false'),
        owner:         String(row.owner ?? ''),
      });
    } catch { /* skip */ }
  }
  return results;
}

// ── Mutate spent flag ──────────────────────────────────────────────────────

/**
 * Flip the spent flag on a note without touching encrypted fields.
 * Safe to call without a signer.
 * Named markNoteSpentTyped to avoid collision with legacy markNoteSpent(key) export.
 */
export function markNoteSpentTyped(
  chainId: number,
  symbol: string,
  commitment: string,
  spent: 'false' | 'pending' | 'true' = 'true',
): void {
  const key = noteKey(chainId, symbol, commitment);
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(raw), spent }));
  } catch { /* best-effort */ }
}

/**
 * Mark spent by localStorage key directly (used when commitment is embedded in the key).
 * Accepts old-format keys too for backward compatibility.
 */
export function markNoteSpentByKey(key: string, spent: 'false' | 'pending' | 'true' = 'true'): void {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(raw), spent }));
  } catch { /* best-effort */ }
}

// ── Migration from old key format ─────────────────────────────────────────

/**
 * One-time migration: rewrite notes stored under the old `{chainId}-{SYMBOL}-{commitment}`
 * key format to the new `siphon-note-{chainId}-{SYMBOL}-{commitment}` format.
 * Safe to call on every wallet connect — skips keys already in new format.
 * Returns the number of notes migrated.
 */
export function migrateLegacyNoteKeys(): number {
  const toMigrate: { oldKey: string; newKey: string; value: string }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Skip new-format and non-note keys
    if (key.startsWith('siphon-')) continue;
    // Old format: `{chainId}-{SYMBOL}-{commitment}` — chainId is a number, symbol is 2-5 chars, commitment is a long decimal
    const parts = key.split('-');
    if (parts.length < 3) continue;
    const maybeChainId = Number(parts[0]);
    if (!Number.isInteger(maybeChainId) || maybeChainId < 1) continue;
    const maybeSymbol = parts[1];
    if (!maybeSymbol || maybeSymbol.length > 8) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? '{}');
      // Only migrate encrypted notes (not plaintext hints)
      if (!row.nullifier_enc || !row.secret_enc || !row.commitment) continue;
      const newKey = `siphon-note-${key}`;
      toMigrate.push({ oldKey: key, newKey, value: localStorage.getItem(key)! });
    } catch { /* skip */ }
  }

  for (const { oldKey, newKey, value } of toMigrate) {
    try {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
    } catch { /* quota — skip */ }
  }

  return toMigrate.length;
}

// ── Purge stale plaintext hints ────────────────────────────────────────────

/**
 * Remove any leftover plaintext hints (old `change-hint-*`, `merge-hint-*`,
 * `{chainId}-{SYMBOL}-{precommitment}` with pending:true) that should no longer exist.
 * Safe to call on wallet connect after migrateLegacyNoteKeys().
 * These hints are now eliminated at the source — this is a cleanup for any that
 * survived from a previous version of the code.
 */
export function purgePlaintextHints(): number {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('change-hint-') || key.startsWith('merge-hint-')) {
      toRemove.push(key);
      continue;
    }
    try {
      const raw = localStorage.getItem(key) ?? '{}';
      const row = JSON.parse(raw);
      // Old deposit hints: pending:true and plaintext nullifier
      if (row.pending === true && row.nullifier && !row.nullifier_enc) {
        toRemove.push(key);
        continue;
      }
      // Any old-format key (no siphon- prefix) that lacks encrypted secrets can never be
      // spent — no nullifier_enc means the withdrawal flow can't recover the secret to build
      // a proof. Remove whether it has plaintext nullifier (insecure) or none at all (stub).
      if (!key.startsWith('siphon-') && !row.nullifier_enc && row.commitment) {
        toRemove.push(key);
        continue;
      }
      // New-format notes with empty precommitment AND empty nullifierHash are broken stubs
      // written by the old outputNoteResolver repair bug (wrote to old-format key, not new).
      // They have encrypted secrets but the withdrawal self-check rejects them (leaf can't be
      // reproduced). The repair path will re-create them correctly on the next withdrawal attempt,
      // so removing them prevents them from inflating the balance display.
      if (key.startsWith('siphon-note-') && row.commitment &&
          !row.precommitment && !row.nullifierHash && row.nullifier_enc) {
        toRemove.push(key);
      }
    } catch { /* skip */ }
  }
  for (const key of toRemove) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  return toRemove.length;
}

// ── Delete ─────────────────────────────────────────────────────────────────

export function deleteNote(chainId: number, symbol: string, commitment: string): void {
  try { localStorage.removeItem(noteKey(chainId, symbol, commitment)); } catch { /* ignore */ }
}

// ── Backward-compatible shims (for zkHandler.ts, noteConsolidator.ts, etc.) ──
//
// The old API used:
//   scanNoteMeta(prefix: string)          — prefix like "8453-ETH-"
//   readNote(key: string, signer)         — key like "8453-ETH-{commitment}"
//   markNoteSpent(key: string, spent?)    — key like "8453-ETH-{commitment}"
//   writeNote(key: string, note, signer)  — key like "8453-ETH-{commitment}"
//
// These shims translate old-format keys/prefixes to the new API so callers
// in zkHandler.ts don't need to change yet. Remove once zkHandler is updated.

/** Legacy API: scanNoteMeta(prefix) — covers both new and old key formats. */
export function scanNoteMeta(prefix: string): NoteMeta[] {
  // prefix is like "8453-ETH-" — translate to siphon-note-8453-ETH-
  const newPrefix = `siphon-note-${prefix}`;
  const results: NoteMeta[] = [];

  // First pass: new format keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(newPrefix)) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!row.nullifier_enc || !row.secret_enc || !row.commitment || !row.amount) continue;
      results.push({
        key,
        commitment:    String(row.commitment),
        precommitment: String(row.precommitment ?? ''),
        nullifierHash: String(row.nullifierHash ?? ''),
        amount:        String(row.amount),
        spent:         String(row.spent ?? 'false'),
        owner:         String(row.owner ?? ''),
      });
    } catch { /* skip */ }
  }

  // Second pass: legacy format keys (not yet migrated) — also match the prefix
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix) || key.startsWith('siphon-')) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!row.nullifier_enc || !row.secret_enc || !row.commitment || !row.amount) continue;
      results.push({
        key,
        commitment:    String(row.commitment),
        precommitment: String(row.precommitment ?? ''),
        nullifierHash: String(row.nullifierHash ?? ''),
        amount:        String(row.amount),
        spent:         String(row.spent ?? 'false'),
        owner:         String(row.owner ?? ''),
      });
    } catch { /* skip */ }
  }

  return results;
}

/** Legacy API: readNote(key, signer) — reads by raw localStorage key. */
export async function readNote(key: string, signer: Signer): Promise<StoredNote | null> {
  return readNoteByKey(key, signer);
}

/** Legacy API: markNoteSpent(key, spent?) — marks by raw localStorage key. */
export function markNoteSpent(key: string, spent: boolean | 'false' | 'pending' | 'true' = true): void {
  const normalized: 'false' | 'pending' | 'true' = spent === true ? 'true' : spent === false ? 'false' : spent;
  markNoteSpentByKey(key, normalized);
}

/** Legacy API: writeNote(key, note, signer) — writes by raw localStorage key, parses chainId/symbol from it. */
export async function writeNote(key: string, note: Omit<StoredNote, 'spent'> & { spent: boolean | 'false' | 'pending' | 'true' }, signer: Signer): Promise<void> {
  // Parse chainId/symbol from old-format key ("8453-ETH-{commitment}") or new format
  const normalized: 'false' | 'pending' | 'true' =
    note.spent === true ? 'true' : note.spent === false ? 'false' : note.spent;

  const parsed = parseNoteKey(key); // tries new format first
  if (parsed) {
    return writeNoteTyped(parsed.chainId, parsed.symbol, { ...note, spent: normalized }, signer);
  }

  // Legacy key format: "{chainId}-{SYMBOL}-{commitment}"
  const parts = key.split('-');
  if (parts.length >= 3) {
    const chainId = Number(parts[0]);
    const symbol  = parts[1];
    if (chainId && symbol) {
      return writeNoteTyped(chainId, symbol, { ...note, spent: normalized }, signer);
    }
  }
  throw new Error(`[noteStore] writeNoteByKey: cannot parse key "${key}"`);
}

/**
 * Called on wallet connect. Migrates legacy note keys to new format,
 * purges any leftover plaintext hints, and syncs from server.
 * Replaces the old recoverPendingHints() which finalized plaintext hints —
 * that pattern is eliminated; this just cleans up any survivors from old code.
 */
export async function recoverPendingHints(signer: Signer): Promise<void> {
  migrateLegacyNoteKeys();
  purgePlaintextHints();
  await syncFromServer(signer);
}

// syncWalletNotesFromServer alias for callers that import it by that name
export { syncFromServer as syncWalletNotesFromServer };

// ── Server sync (Supabase → localStorage) ─────────────────────────────────

/**
 * Sync notes from Supabase commitments table into localStorage.
 * Skips notes already present locally. Returns count of newly written notes.
 * Never throws — logs and returns 0 on failure.
 */
export async function syncFromServer(signer: Signer): Promise<number> {
  try {
    const { fetchCommitments } = await import('./commitmentStore');
    const commits = await fetchCommitments(signer);
    let written = 0;
    for (const c of commits) {
      const d = c.decrypted;
      if (!d?.commitment || !d.nullifier || !d.secret) continue;
      const sym = String(c.asset ?? '').toUpperCase();
      const cid = Number(d.chainId);
      if (!sym || !cid) continue;
      // Skip spent rows — no point re-hydrating notes already withdrawn
      if (c.spent === 'true') continue;
      // Skip zero-amount rows — ghost entries from spare pool or bad writes
      const amt = parseFloat(String(d.amount ?? '0'));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      // Skip if already present under new-format key OR legacy key.
      // But if the local copy is spent and Supabase isn't, push the spent mark up so
      // getServerBackedVaultTotals doesn't count already-withdrawn notes.
      const newKey    = noteKey(cid, sym, d.commitment);
      const legacyKey = `${cid}-${sym.toUpperCase()}-${d.commitment}`;
      const existingRaw = localStorage.getItem(newKey) || localStorage.getItem(legacyKey);
      if (existingRaw) {
        try {
          const local = JSON.parse(existingRaw);
          if ((local.spent === true || local.spent === 'true') && c.spent !== 'true') {
            const { markCommitmentSpent } = await import('./commitmentStore');
            markCommitmentSpent(signer, c.id, 'true').catch(() => {/* best-effort */});
          }
        } catch { /* skip */ }
        continue;
      }
      try {
        await writeNoteTyped(cid, sym, {
          nullifier:     d.nullifier,
          secret:        d.secret,
          commitment:    d.commitment,
          precommitment: d.precommitment ?? '',
          nullifierHash: d.nullifierHash ?? '',
          amount:        d.amount,
          spent:         c.spent === 'pending' ? 'pending' : 'false',
        }, signer);
        written++;
      } catch (e) {
        console.warn('[noteStore] syncFromServer: failed to write note', d.commitment, e);
      }
    }
    return written;
  } catch (e) {
    console.warn('[noteStore] syncFromServer failed:', e);
    return 0;
  }
}
