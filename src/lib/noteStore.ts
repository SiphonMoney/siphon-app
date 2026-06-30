import { Signer } from 'ethers';
import { deriveEncKey } from './noteAuth';
import { getTradeExecutorBaseUrl } from './tradeExecutorClient';
const SIGN_MESSAGE_AUTH_BASE = 'Siphon auth v1';
const AUTH_MAX_AGE_SECONDS = 280; // trade-executor allows 300s

const _signOnceInflight = new Map<string, Promise<{ key: CryptoKey; headers: Record<string, string> }>>();

const authStorageKey = (wallet: string) => `siphon-note-auth-${wallet.toLowerCase()}`;

function readSessionJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota / private mode */ }
}

function readCachedAuthHeaders(wallet: string): Record<string, string> | null {
  const stored = readSessionJson<{ timestamp: string; signature: string }>(authStorageKey(wallet));
  if (!stored?.timestamp || !stored.signature) return null;

  const ts = parseInt(stored.timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > AUTH_MAX_AGE_SECONDS) {
    return null;
  }

  return {
    'X-Wallet-Address': wallet.toLowerCase(),
    'X-Signature': stored.signature,
    'X-Timestamp': stored.timestamp,
    'Content-Type': 'application/json',
  };
}

function persistAuthHeaders(wallet: string, timestamp: string, signature: string): void {
  writeSessionJson(authStorageKey(wallet), { timestamp, signature });
}

export interface NotePayload {
  nullifier: string;
  secret: string;
  amount: string;
}

export type NoteSpentStatus = 'false' | 'pending' | 'true';

export interface DecryptedNote {
  id: string;
  wallet: string;
  commitment: string;
  nullifier_hash: string;
  chain_id: number;
  asset: string;
  spent: NoteSpentStatus;
  created_at: string;
  decrypted: NotePayload;
}

export interface ServerNote {
  id: string;
  wallet: string;
  ciphertext: string;
  iv: string;
  commitment: string;
  nullifier_hash: string;
  chain_id: number;
  asset: string;
  spent: NoteSpentStatus;
  created_at: string;
}

async function doSignOnce(signer: Signer): Promise<{ key: CryptoKey; headers: Record<string, string> }> {
  const wallet: string = await signer.getAddress();
  const key = await deriveEncKey(signer);

  const cachedHeaders = readCachedAuthHeaders(wallet);
  if (cachedHeaders) {
    return { key, headers: cachedHeaders };
  }

  // Separate auth signature with timestamp — this one goes in headers, key derivation sig does not
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const authSig: string = await signer.signMessage(`${SIGN_MESSAGE_AUTH_BASE}:${timestamp}`);
  persistAuthHeaders(wallet, timestamp, authSig);

  const headers: Record<string, string> = {
    'X-Wallet-Address': wallet.toLowerCase(),
    'X-Signature': authSig,
    'X-Timestamp': timestamp,
    'Content-Type': 'application/json',
  };

  return { key, headers };
}

async function signOnce(signer: Signer): Promise<{ key: CryptoKey; headers: Record<string, string> }> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const inflight = _signOnceInflight.get(wallet);
  if (inflight) return inflight;

  const promise = doSignOnce(signer).finally(() => {
    _signOnceInflight.delete(wallet);
  });
  _signOnceInflight.set(wallet, promise);
  return promise;
}

async function encryptNote(key: CryptoKey, note: NotePayload): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(note));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function decryptNote(key: CryptoKey, ciphertext: string, iv: string): Promise<NotePayload> {
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const ctBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export async function postNote(
  signer: Signer,
  note: NotePayload,
  commitment: string,
  nullifier_hash: string,
  asset: string,
  chain_id: number
): Promise<string> {
  const { key, headers } = await signOnce(signer);
  const { ciphertext, iv } = await encryptNote(key, note);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ciphertext, iv, commitment, nullifier_hash, asset, chain_id }),
  });
  if (!res.ok) throw new Error(`postNote failed: ${res.status}`);
  const json = await res.json();
  return json.id;
}

export async function fetchNotes(signer: Signer): Promise<DecryptedNote[]> {
  const { key, headers } = await signOnce(signer);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/notes`, { headers });
  if (!res.ok) throw new Error(`fetchNotes failed: ${res.status}`);
  const { notes } = await res.json();
  return Promise.all(
    notes.map(async (n: ServerNote) => ({
      ...n,
      decrypted: await decryptNote(key, n.ciphertext, n.iv),
    }))
  );
}

export async function markNoteSpent(signer: Signer, noteId: string): Promise<void> {
  const { headers } = await signOnce(signer);
  await fetch(`${getTradeExecutorBaseUrl()}/notes/${noteId}/spent`, { method: 'PATCH', headers });
}

export async function exportNotes(signer: Signer): Promise<void> {
  const { headers } = await signOnce(signer);
  const res = await fetch(`${getTradeExecutorBaseUrl()}/notes/export`, { headers });
  const json = await res.json();
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const wallet = await signer.getAddress();
  a.href = url;
  a.download = `siphon-notes-${wallet.slice(0, 8)}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importNotes(signer: Signer, file: File): Promise<void> {
  const text = await file.text();
  const { notes } = JSON.parse(text);
  for (const n of notes) {
    // Fresh signature per note — avoids timestamp expiry on large imports
    const { headers } = await signOnce(signer);
    await fetch(`${getTradeExecutorBaseUrl()}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(n),
    });
  }
}
