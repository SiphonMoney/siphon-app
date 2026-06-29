/**
 * Precommitment store — Supabase-backed backup for vault-mode swap output notes.
 *
 * A precommitment is created when the user submits a vault-mode strategy.
 * It holds the nullifier + secret for the output note whose commitment isn't
 * known yet (the executor will deposit with this precommitment, and the amount
 * depends on swap slippage). Once the swap lands on-chain and the commitment is
 * resolved, the precommitment is marked resolved and a full commitment is written.
 */
import { Signer } from 'ethers';
import { derivePrecommTag, deriveEncKey, noteAuthHeaders, encryptBlob, decryptBlob } from './noteAuth';
import { getTradeExecutorBaseUrl } from './tradeExecutorClient';

export interface PrecommitmentPayload {
  nullifier:     string;
  secret:        string;
  precommitment: string;
  asset:         string;
  chainId:       number;
}

export interface DecryptedPrecommitment {
  id:         string;
  tag:        string;
  status:     string;
  created_at: string;
  decrypted:  PrecommitmentPayload;
}

export async function postPrecommitment(
  signer: Signer,
  payload: PrecommitmentPayload,
): Promise<string> {
  const tag     = await derivePrecommTag(signer);
  const key     = await deriveEncKey(signer);
  const headers = await noteAuthHeaders(signer, tag);
  const { enc_blob, iv } = await encryptBlob(key, payload);

  const res = await fetch(`${getTradeExecutorBaseUrl()}/precommitments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ enc_blob, iv }),
  });
  if (!res.ok) throw new Error(`postPrecommitment failed: ${res.status}`);
  const json = await res.json();
  return json.id as string;
}

export async function fetchPendingPrecommitments(signer: Signer): Promise<DecryptedPrecommitment[]> {
  const tag     = await derivePrecommTag(signer);
  const key     = await deriveEncKey(signer);
  const headers = await noteAuthHeaders(signer, tag);

  const res = await fetch(`${getTradeExecutorBaseUrl()}/precommitments?status=pending`, { headers });
  if (!res.ok) throw new Error(`fetchPendingPrecommitments failed: ${res.status}`);
  const { precommitments } = await res.json();

  return Promise.all(
    precommitments.map(async (p: { id: string; tag: string; enc_blob: string; iv: string; status: string; created_at: string }) => ({
      id:         p.id,
      tag:        p.tag,
      status:     p.status,
      created_at: p.created_at,
      decrypted:  await decryptBlob<PrecommitmentPayload>(key, p.enc_blob, p.iv),
    })),
  );
}

/**
 * Atomically claim a precommitment from the pool (pending → in_use).
 * Returns false if the entry was already claimed by another tab (409).
 */
export async function claimPrecommitment(signer: Signer, id: string): Promise<boolean> {
  const tag     = await derivePrecommTag(signer);
  const headers = await noteAuthHeaders(signer, tag);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/precommitments/${id}/claim`, {
    method: 'PATCH',
    headers,
  });
  return res.ok; // false on 409 (already claimed)
}

export async function resolvePrecommitment(signer: Signer, id: string): Promise<void> {
  const tag     = await derivePrecommTag(signer);
  const headers = await noteAuthHeaders(signer, tag);
  await fetch(`${getTradeExecutorBaseUrl()}/precommitments/${id}/resolve`, {
    method: 'PATCH',
    headers,
  });
}

export async function releasePrecommitment(signer: Signer, id: string): Promise<void> {
  const tag     = await derivePrecommTag(signer);
  const headers = await noteAuthHeaders(signer, tag);
  await fetch(`${getTradeExecutorBaseUrl()}/precommitments/${id}/release`, {
    method: 'PATCH',
    headers,
  });
}

export async function getPoolCount(signer: Signer): Promise<number> {
  const tag     = await derivePrecommTag(signer);
  const headers = await noteAuthHeaders(signer, tag);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/precommitments/pool-count`, { headers });
  if (!res.ok) return 0;
  const json = await res.json();
  return (json.count as number) ?? 0;
}
