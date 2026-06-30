import { Signer } from 'ethers';

const SIGN_MESSAGE_ENC = 'Siphon-Encryption-Key-v1';

const _keyCache = new Map<string, CryptoKey>();
const _encKeyInflight = new Map<string, Promise<CryptoKey>>();

const encKeyStorageKey = (wallet: string) => `siphon-note-enc-key-${wallet.toLowerCase()}`;

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

async function loadCachedEncryptionKey(wallet: string): Promise<CryptoKey | null> {
  const cached = _keyCache.get(wallet.toLowerCase());
  if (cached) return cached;

  const stored = readSessionJson<{ raw: string }>(encKeyStorageKey(wallet));
  if (!stored?.raw) return null;

  try {
    const bytes = Uint8Array.from(atob(stored.raw), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    _keyCache.set(wallet.toLowerCase(), key);
    return key;
  } catch {
    return null;
  }
}

async function persistEncryptionKey(wallet: string, key: CryptoKey): Promise<void> {
  _keyCache.set(wallet.toLowerCase(), key);
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    writeSessionJson(encKeyStorageKey(wallet), {
      raw: btoa(String.fromCharCode(...new Uint8Array(raw))),
    });
  } catch { /* non-extractable key */ }
}

async function deriveEncKeyOnce(signer: Signer, wallet: string): Promise<CryptoKey> {
  const cached = await loadCachedEncryptionKey(wallet);
  if (cached) return cached;

  const encSig = await signer.signMessage(SIGN_MESSAGE_ENC);
  const raw = new TextEncoder().encode(encSig);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  await persistEncryptionKey(wallet, key);
  return key;
}

/** Derive AES-GCM key from wallet signature — cached in-memory + sessionStorage. */
export async function deriveEncKey(signer: Signer): Promise<CryptoKey> {
  const wallet = (await signer.getAddress()).toLowerCase();
  const inflight = _encKeyInflight.get(wallet);
  if (inflight) return inflight;

  const promise = deriveEncKeyOnce(signer, wallet).finally(() => {
    _encKeyInflight.delete(wallet);
  });
  _encKeyInflight.set(wallet, promise);
  return promise;
}
