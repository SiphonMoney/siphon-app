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
  const headers = await noteAuthHeaders(signer, tag);
  const { enc_blob, iv } = await encryptBlob(key, payload);

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
  const tag     = await deriveCommTag(signer);
  const key     = await deriveEncKey(signer);
  const headers = await noteAuthHeaders(signer, tag);

  const res = await fetch(`${getTradeExecutorBaseUrl()}/commitments`, { headers });
  if (!res.ok) throw new Error(`fetchCommitments failed: ${res.status}`);
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

export async function markCommitmentSpent(
  signer: Signer,
  id: string,
  status: 'true' | 'pending' | 'false' = 'pending',
): Promise<void> {
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
