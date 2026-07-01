import { Signer } from 'ethers';
import { deriveCommTag, deriveEncKey, noteAuthHeaders, encryptBlob, decryptBlob } from './noteAuth';
import { getTradeExecutorBaseUrl } from './tradeExecutorClient';

export interface CommitmentPayload {
  nullifier:     string;
  secret:        string;
  commitment:    string;
  amount:        string;
  chainId:       number;
  nullifierHash?: string;
  precommitment?: string;
}

export interface DecryptedCommitment {
  id:         string;
  tag:        string;
  asset:      string;
  spent:      string;
  source:     string;
  created_at: string;
  updated_at: string;
  decrypted:  CommitmentPayload;
}

export async function postCommitment(
  signer: Signer,
  payload: CommitmentPayload,
  asset: string,
  source: 'deposit' | 'change' | 'vault-output' = 'deposit',
): Promise<string> {
  const tag     = await deriveCommTag(signer);
  const key     = await deriveEncKey(signer);
  const { enc_blob, iv } = await encryptBlob(key, payload);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (SUPABASE_URL && SUPABASE_KEY) {
    const id = crypto.randomUUID();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/commitments`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ id, tag, enc_blob, iv, asset: asset.toUpperCase(), source, spent: 'false', updated_at: new Date().toISOString(), created_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`postCommitment (Supabase) failed: ${res.status} ${err}`);
    }
    return id;
  }

  // Fallback: trade executor
  const headers = await noteAuthHeaders(signer, tag);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/commitments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ enc_blob, iv, asset: asset.toUpperCase(), source }),
  });
  if (!res.ok) throw new Error(`postCommitment failed: ${res.status}`);
  const json = await res.json();
  return json.id as string;
}

export async function fetchCommitments(signer: Signer): Promise<DecryptedCommitment[]> {
  const tag = await deriveCommTag(signer);
  const key = await deriveEncKey(signer);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (SUPABASE_URL && SUPABASE_KEY) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/commitments?tag=eq.${encodeURIComponent(tag)}&select=id,tag,asset,enc_blob,iv,spent,source,created_at,updated_at`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!res.ok) throw new Error(`fetchCommitments (Supabase) failed: ${res.status}`);
    const rows: { id: string; tag: string; asset: string; enc_blob: string; iv: string; spent: string; source: string; created_at: string; updated_at: string }[] = await res.json();
    return Promise.all(rows.map(async c => ({
      id:         c.id,
      tag:        c.tag,
      asset:      c.asset,
      spent:      c.spent,
      source:     c.source,
      created_at: c.created_at,
      updated_at: c.updated_at,
      decrypted:  await decryptBlob<CommitmentPayload>(key, c.enc_blob, c.iv),
    })));
  }

  // Fallback: trade executor
  const headers = await noteAuthHeaders(signer, tag);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/commitments`, { headers });
  if (!res.ok) throw new Error(`fetchCommitments failed: ${res.status}`);
  const { commitments } = await res.json();
  return Promise.all(
    commitments.map(async (c: { id: string; tag: string; asset: string; enc_blob: string; iv: string; spent: string; source: string; created_at: string; updated_at: string }) => ({
      id:         c.id,
      tag:        c.tag,
      asset:      c.asset,
      spent:      c.spent,
      source:     c.source,
      created_at: c.created_at,
      updated_at: c.updated_at,
      decrypted:  await decryptBlob<CommitmentPayload>(key, c.enc_blob, c.iv),
    })),
  );
}

/**
 * Sum of the user's NON-spent Supabase-backed notes, per asset, for a chain. This is the
 * "withdrawable per your encrypted backup" figure — used as a resilient balance fallback when the
 * on-chain reconcile (leaf scan + nullifier checks) can't run because RPC is throttled/down. It is
 * DISPLAY-only and deliberately server-authoritative: it may slightly over-count (a note the chain
 * would reveal as spent-but-not-yet-flagged, or old-vault dust), but the withdraw path still does
 * full on-chain verification + self-heal, so showing this can never spend anything that isn't
 * really there — whereas collapsing to "No funds" on an RPC hiccup wrongly looks like fund loss.
 *
 * Dedupes by commitment (a commitment can appear as both a 'deposit' and a 'change'/'vault-output'
 * row) so nothing is double-counted. Returns { ETH: n, USDC: n } (human units).
 */
export async function getServerBackedVaultTotals(
  signer: Signer,
  chainId: number,
): Promise<Record<string, number>> {
  const commits = await fetchCommitments(signer);
  const totals: Record<string, number> = {};
  const seen = new Set<string>();
  for (const c of commits) {
    if (c.spent === 'true' || c.spent === 'pending') continue; // spent or in-flight
    const d = c.decrypted;
    if (!d?.commitment || !d.amount) continue;
    if ((d.chainId ?? chainId) !== chainId) continue;
    const sym = String(c.asset || '').toUpperCase();
    if (sym !== 'ETH' && sym !== 'USDC') continue;
    const dedupeKey = `${sym}:${d.commitment}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const amt = Number(d.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    totals[sym] = (totals[sym] ?? 0) + amt;
  }
  return totals;
}

export async function markCommitmentSpent(
  signer: Signer,
  id: string,
  status: 'true' | 'pending' | 'false' = 'pending',
): Promise<void> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/commitments?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ spent: status, updated_at: new Date().toISOString() }),
    });
    return;
  }

  // Fallback: trade executor
  const tag     = await deriveCommTag(signer);
  const headers = await noteAuthHeaders(signer, tag);
  await fetch(`${getTradeExecutorBaseUrl()}/commitments/${id}/spent`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  });
}

/**
 * Prune fully-spent commitments to keep the table small.
 *
 * Only deletes rows that are `spent='true'` AND older than `olderThanDays` (default 7). Such a row
 * is dead weight: every spend path filters `spent==='true'` out, and if a leaf were ever rediscovered
 * the on-chain nullifier check ([zkHandler] vault.nullifiers) re-marks it spent — the secret is never
 * needed again once withdrawn. The age buffer leaves time for any mis-flag to be noticed first.
 * NEVER touches `'false'` (spendable) or `'pending'` (reserved) rows. Best-effort; returns count.
 */
export async function pruneSpentCommitments(signer: Signer, olderThanDays = 7): Promise<number> {
  const tag = await deriveCommTag(signer);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (SUPABASE_URL && SUPABASE_KEY) {
    // The public anon key is RLS-restricted to INSERT/UPDATE/SELECT — DELETE returns 401. Pruning a
    // hosted Supabase therefore runs server-side via pg_cron (see supabase/prune_spent_commitments.sql),
    // not from the client. Skip here to avoid a guaranteed-401 every cycle.
    return 0;
  }

  // Fallback: trade executor
  const headers = await noteAuthHeaders(signer, tag);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/commitments/prune`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ older_than_days: olderThanDays }),
  });
  if (!res.ok) return 0;
  const json = await res.json().catch(() => ({}));
  return Number(json?.deleted ?? 0);
}

export async function exportCommitments(signer: Signer): Promise<DecryptedCommitment[]> {
  const tag     = await deriveCommTag(signer);
  const key     = await deriveEncKey(signer);
  const headers = await noteAuthHeaders(signer, tag);

  const res = await fetch(`${getTradeExecutorBaseUrl()}/commitments/export`, { headers });
  if (!res.ok) throw new Error(`exportCommitments failed: ${res.status}`);
  const { commitments } = await res.json();

  return Promise.all(
    commitments.map(async (c: {
      id: string; tag: string; asset: string; enc_blob: string; iv: string;
      spent: string; source: string; created_at: string; updated_at: string;
    }) => ({
      id:         c.id,
      tag:        c.tag,
      asset:      c.asset,
      spent:      c.spent,
      source:     c.source,
      created_at: c.created_at,
      updated_at: c.updated_at,
      decrypted:  await decryptBlob<CommitmentPayload>(key, c.enc_blob, c.iv),
    })),
  );
}
