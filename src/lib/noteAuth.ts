/**
 * Shared auth primitives for the note DB (Supabase).
 *
 * Tag derivation: tag = keccak256(walletSig)[0:20 bytes] as hex.
 * Two separate tags — one for precommitments, one for commitments — so the
 * two tables can't be cross-joined by tag even with a full DB dump.
 *
 * Auth headers: X-Tag + X-Signature + X-Timestamp. Server recovers the signer
 * to validate the sig is non-forged, but never stores the recovered address.
 *
 * Encryption key: AES-GCM key derived from a separate wallet signature.
 * Never transmitted — used only in the browser to encrypt/decrypt blobs.
 */
import { Signer } from 'ethers';
import { keccak256, toUtf8Bytes } from 'ethers';

const SIGN_PRECOMM_TAG = 'Siphon precomm-tag v1';
const SIGN_COMM_TAG    = 'Siphon comm-tag v1';
const SIGN_ENC_KEY     = 'Siphon-Encryption-Key-v1';
const SIGN_AUTH        = 'Siphon notes auth v1';

// Per-session caches keyed by wallet address (lowercase)
const _precommTagCache = new Map<string, string>();
const _commTagCache    = new Map<string, string>();
const _encKeyCache     = new Map<string, CryptoKey>();

// Cache auth headers for 30 s — the server allows a 5-minute window, so reuse is safe.
// Keyed by `${wallet}:${tag}` so different tags get separate cache entries.
const _authHeaderCache = new Map<string, { headers: Record<string, string>; expiresAt: number }>();
const AUTH_CACHE_TTL_MS = 30_000;

async function _deriveTag(signer: Signer, wallet: string, msg: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(wallet);
  if (cached) return cached;
  const sig = await signer.signMessage(msg);
  // keccak256 of the signature hex bytes, take first 20 bytes (40 hex chars)
  const hash = keccak256(toUtf8Bytes(sig));
  const tag  = hash.slice(2, 42); // strip 0x, take 40 chars = 20 bytes
  cache.set(wallet, tag);
  return tag;
}

export async function derivePrecommTag(signer: Signer): Promise<string> {
  const wallet = (await signer.getAddress()).toLowerCase();
  return _deriveTag(signer, wallet, SIGN_PRECOMM_TAG, _precommTagCache);
}

export async function deriveCommTag(signer: Signer): Promise<string> {
  const wallet = (await signer.getAddress()).toLowerCase();
  return _deriveTag(signer, wallet, SIGN_COMM_TAG, _commTagCache);
}

export async function deriveEncKey(signer: Signer): Promise<CryptoKey> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const cached = _encKeyCache.get(wallet);
  if (cached) return cached;
  const sig  = await signer.signMessage(SIGN_ENC_KEY);
  const raw  = new TextEncoder().encode(sig);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  const key  = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  _encKeyCache.set(wallet, key);
  return key;
}

export async function noteAuthHeaders(
  signer: Signer,
  tag: string,
): Promise<Record<string, string>> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const cacheKey = `${wallet}:${tag}`;
  const cached = _authHeaderCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return { ...cached.headers };

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = await signer.signMessage(`${SIGN_AUTH}\nwallet:${wallet}\ntag:${tag}\nts:${timestamp}`);
  const headers = {
    'X-Tag':            tag,
    'X-Wallet-Address': wallet,
    'X-Signature':      sig,
    'X-Timestamp':      timestamp,
    'Content-Type':     'application/json',
  };
  _authHeaderCache.set(cacheKey, { headers, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  return headers;
}

// ── AES-GCM helpers ──────────────────────────────────────────────────────────

export async function encryptBlob(key: CryptoKey, payload: object): Promise<{ enc_blob: string; iv: string }> {
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ct      = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    enc_blob: btoa(String.fromCharCode(...new Uint8Array(ct))),
    iv:       btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptBlob<T = Record<string, unknown>>(
  key: CryptoKey,
  enc_blob: string,
  iv: string,
): Promise<T> {
  const ivBytes = Uint8Array.from(atob(iv),       c => c.charCodeAt(0));
  const ctBytes = Uint8Array.from(atob(enc_blob), c => c.charCodeAt(0));
  const pt      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
