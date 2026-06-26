// fheKeyStore.ts — persistence for the user's FHE client (secret) key.
//
// The client key is generated in the browser and MUST stay here: it can decrypt the user's
// price bounds and the trigger results. It never goes to any backend. We persist it in
// IndexedDB (keyed by wallet address) so it survives reloads and can decrypt results computed
// while the tab was closed.
//
// At-rest hardening: pass a `wrappingKey` (AES-GCM CryptoKey, e.g. derived from the same wallet
// signature the dark-pool viewing key uses in keyManagement.ts) to encrypt the stored key. If
// omitted, the key is stored unwrapped — functional, but a TODO for production.

const DB_NAME = "siphon-fhe";
const STORE = "client-keys";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => reject(r.error);
      })
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

interface StoredKey {
  // If `iv` is present the payload is AES-GCM ciphertext; otherwise it's the plaintext hex.
  iv?: number[];
  data: string; // hex client key, or base64 ciphertext when iv present
}

async function encryptHex(hex: string, wrappingKey: CryptoKey): Promise<StoredKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    new TextEncoder().encode(hex)
  );
  return { iv: Array.from(iv), data: btoa(String.fromCharCode(...new Uint8Array(ct))) };
}

async function decryptHex(stored: StoredKey, wrappingKey: CryptoKey): Promise<string> {
  const iv = new Uint8Array(stored.iv as number[]);
  const ct = Uint8Array.from(atob(stored.data), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, ct as BufferSource);
  return new TextDecoder().decode(pt);
}

export async function loadClientKey(userId: string, wrappingKey?: CryptoKey): Promise<string | null> {
  const stored = await idbGet<StoredKey>(userId);
  if (!stored) return null;
  if (stored.iv) {
    if (!wrappingKey) throw new Error("client key is encrypted but no wrappingKey was provided");
    return decryptHex(stored, wrappingKey);
  }
  return stored.data;
}

export async function saveClientKey(userId: string, hex: string, wrappingKey?: CryptoKey): Promise<void> {
  if (wrappingKey) {
    await idbSet(userId, await encryptHex(hex, wrappingKey));
  } else {
    console.warn("[fheKeyStore] storing FHE client key unwrapped (no wrappingKey). See TODO.");
    await idbSet(userId, { data: hex } as StoredKey);
  }
}
