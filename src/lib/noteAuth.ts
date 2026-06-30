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

// Per-session in-memory caches (fast path, lost on HMR reload)
const _precommTagCache = new Map<string, string>();
const _commTagCache    = new Map<string, string>();
const _encKeyCache     = new Map<string, CryptoKey>();
// De-dup concurrent enc-key derivations so a cold load / parallel proof gen triggers ONE
// signature popup, not several (metamask-popup-reduction).
const _encKeyInflight  = new Map<string, Promise<CryptoKey>>();

// Cache auth headers for 30 s — the server allows a 5-minute window, so reuse is safe.
const _authHeaderCache = new Map<string, { headers: Record<string, string>; expiresAt: number }>();
const AUTH_CACHE_TTL_MS = 270_000; // 4.5 min — server allows 5-min window

// sessionStorage keys — survive HMR reloads, cleared when tab closes.
const _ssKey = (kind: string, wallet: string) => `siphon-auth-${kind}-${wallet}`;

function _ssGet(kind: string, wallet: string): string | null {
  try { return sessionStorage.getItem(_ssKey(kind, wallet)); } catch { return null; }
}
function _ssSet(kind: string, wallet: string, value: string): void {
  try { sessionStorage.setItem(_ssKey(kind, wallet), value); } catch { /* quota */ }
}

async function _deriveTag(signer: Signer, wallet: string, msg: string, cache: Map<string, string>, kind: string): Promise<string> {
  const mem = cache.get(wallet);
  if (mem) return mem;
  const ss = _ssGet(kind, wallet);
  if (ss) { cache.set(wallet, ss); return ss; }
  const sig = await signer.signMessage(msg);
  const hash = keccak256(toUtf8Bytes(sig));
  const tag  = hash.slice(2, 42);
  cache.set(wallet, tag);
  _ssSet(kind, wallet, tag);
  return tag;
}

export async function derivePrecommTag(signer: Signer): Promise<string> {
  const wallet = (await signer.getAddress()).toLowerCase();
  return _deriveTag(signer, wallet, SIGN_PRECOMM_TAG, _precommTagCache, 'precomm-tag');
}

export async function deriveCommTag(signer: Signer): Promise<string> {
  const wallet = (await signer.getAddress()).toLowerCase();
  return _deriveTag(signer, wallet, SIGN_COMM_TAG, _commTagCache, 'comm-tag');
}

async function _deriveEncKeyOnce(signer: Signer, wallet: string): Promise<CryptoKey> {
  const mem = _encKeyCache.get(wallet);
  if (mem) return mem;
  // Enc key stored as raw hex in sessionStorage — re-import without re-signing.
  const ssHex = _ssGet('enc-key', wallet);
  if (ssHex) {
    const raw = new Uint8Array(ssHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    _encKeyCache.set(wallet, key);
    return key;
  }
  const sig  = await signer.signMessage(SIGN_ENC_KEY);
  const raw  = new TextEncoder().encode(sig);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  const key  = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  _encKeyCache.set(wallet, key);
  // Store raw key bytes as hex for sessionStorage re-import.
  const exported = await crypto.subtle.exportKey('raw', key);
  _ssSet('enc-key', wallet, Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join(''));
  return key;
}

export async function deriveEncKey(signer: Signer): Promise<CryptoKey> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const mem = _encKeyCache.get(wallet);
  if (mem) return mem;
  // Share one in-flight derivation across concurrent callers → a single signature prompt.
  const inflight = _encKeyInflight.get(wallet);
  if (inflight) return inflight;
  const promise = _deriveEncKeyOnce(signer, wallet).finally(() => _encKeyInflight.delete(wallet));
  _encKeyInflight.set(wallet, promise);
  return promise;
}

export async function noteAuthHeaders(
  signer: Signer,
  tag: string,
): Promise<Record<string, string>> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const cacheKey = `${wallet}:${tag}`;
  const mem = _authHeaderCache.get(cacheKey);
  if (mem && Date.now() < mem.expiresAt) return { ...mem.headers };
  // Check sessionStorage for a still-valid cached header set.
  const ssRaw = _ssGet('auth-hdr', cacheKey);
  if (ssRaw) {
    try {
      const parsed: { headers: Record<string, string>; expiresAt: number } = JSON.parse(ssRaw);
      if (Date.now() < parsed.expiresAt) {
        _authHeaderCache.set(cacheKey, parsed);
        return { ...parsed.headers };
      }
    } catch { /* stale, re-sign */ }
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = await signer.signMessage(`${SIGN_AUTH}\nwallet:${wallet}\ntag:${tag}\nts:${timestamp}`);
  const headers = {
    'X-Tag':            tag,
    'X-Wallet-Address': wallet,
    'X-Signature':      sig,
    'X-Timestamp':      timestamp,
    'Content-Type':     'application/json',
  };
  const entry = { headers, expiresAt: Date.now() + AUTH_CACHE_TTL_MS };
  _authHeaderCache.set(cacheKey, entry);
  _ssSet('auth-hdr', cacheKey, JSON.stringify(entry));
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
