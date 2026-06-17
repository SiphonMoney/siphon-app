import { Signer } from 'ethers';
import { buildPoseidon } from 'circomlibjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { proofToCalldata } from './generateProof';

const RELAYER_URL = process.env.NEXT_PUBLIC_PROVING_RELAYER_URL || '';
const SIGN_MESSAGE_BASE = 'Siphon note encryption v1';

async function getRelayerAuthHeaders(signer: Signer): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${SIGN_MESSAGE_BASE}:${timestamp}`;
  const signature: string = await signer.signMessage(message);
  const wallet: string = await signer.getAddress();
  return {
    'X-Wallet-Address': wallet.toLowerCase(),
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'Content-Type': 'application/json',
  };
}

export async function prepareWithdrawalTransactionRemote(params: {
  existingValue: string;
  existingNullifier: string;
  existingSecret: string;
  withdrawnValue: string;
  newNullifier: string;
  newSecret: string;
  pathElements: string[];
  pathIndices: number[];
  recipient: string;
  stateRoot: string;
}, signer: Signer) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const existingNullifier = BigInt(params.existingNullifier);
  const newNullifier      = BigInt(params.newNullifier);
  const newSecret         = BigInt(params.newSecret);
  const existingValue     = BigInt(params.existingValue);
  const withdrawnValue    = BigInt(params.withdrawnValue);
  const remainingValue    = existingValue - withdrawnValue;

  const nullifierHash    = F.toString(poseidon([existingNullifier]));
  const newPrecommitment = F.toString(poseidon([newNullifier, newSecret]));
  const newCommitment    = F.toString(poseidon([remainingValue, newPrecommitment]));
  const recipientField   = BigInt(params.recipient).toString();

  const inputs = {
    withdrawnValue:    params.withdrawnValue,
    stateRoot:         params.stateRoot,
    newCommitment,
    nullifierHash,
    recipient:         recipientField,
    existingValue:     params.existingValue,
    existingNullifier: params.existingNullifier,
    existingSecret:    params.existingSecret,
    newNullifier:      params.newNullifier,
    newSecret:         params.newSecret,
    pathElements:      params.pathElements.map(String),
    pathIndices:       params.pathIndices,
  };

  const proveUrl = RELAYER_URL ? `${RELAYER_URL}/prove` : '/api/prove';
  const headers = RELAYER_URL
    ? await getRelayerAuthHeaders(signer)
    : { 'Content-Type': 'application/json' };

  const res = await fetch(proveUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Proving relayer failed: ${err.error || res.status}`);
  }

  const { proof, publicSignals } = await res.json();
  const { pA, pB, pC } = proofToCalldata(proof);

  return {
    recipient:     params.recipient,
    amount:        params.withdrawnValue,
    nullifierHash,
    newCommitment,
    stateRoot:     params.stateRoot,
    pA: pA as [string, string],
    pB: pB as [[string, string], [string, string]],
    pC: pC as [string, string],
    publicSignals,
  };
}
