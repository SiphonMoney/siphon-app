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
