// Wallet-connect FHE key warmup.
//
// Pre-generates the per-wallet FHE keypair the moment a wallet connects, so the first
// order doesn't pay keygen (~3-5s), server-key derivation (heavy wasm) or the ~20MB
// server-key upload at submit time.
//
// Storage split:
//   - client key (~22KB hex, SECRET)      → localStorage (unchanged, via fhe.ts)
//   - server key (~23MB hex, eval key)    → IndexedDB — it exceeds the ~5MB localStorage
//     quota, and is re-derivable, so IndexedDB is a cache, not the source of truth.
//
// The cached server key is bound to a fingerprint of the client key that derived it.
// A fingerprint mismatch (new device / regenerated client key) forces a re-derive and
// re-upload — this preserves the stale-key-mismatch protection that made
// ensureServerKeyUploaded always re-upload before.

import { getOrCreateClientKey, getStoredClientKey, deriveServerKey } from "@/lib/fhe";
import { getTradeExecutorBaseUrl } from "@/lib/tradeExecutorClient";

export interface FheKeyState {
  stage: "idle" | "generating" | "deriving" | "uploading" | "ready" | "error";
  /** Wallet the state refers to (lowercase), or null before the first warmup. */
  userId: string | null;
  clientKeyReady: boolean;
  serverKeyReady: boolean;
  /** Server key confirmed on file with the trade-executor. */
  uploaded: boolean;
  /** Byte size of the cached server key, once known. */
  serverKeyBytes: number | null;
  error?: string;
}

export const FHE_KEYS_EVENT = "siphon:fheKeys";

let state: FheKeyState = {
  stage: "idle",
  userId: null,
  clientKeyReady: false,
  serverKeyReady: false,
  uploaded: false,
  serverKeyBytes: null,
};

export function getFheKeyState(): FheKeyState {
  return state;
}

function setState(patch: Partial<FheKeyState>): void {
  state = { ...state, ...patch };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<FheKeyState>(FHE_KEYS_EVENT, { detail: state }));
  }
}

// ── Client-key fingerprint ───────────────────────────────────────────────────
// Binds a cached/uploaded server key to the exact client key that derived it.

async function fingerprintClientKey(clientKeyHex: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientKeyHex));
    return Array.from(new Uint8Array(digest).slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Non-secure-context fallback (dev over http): cheap rolling hash.
  let h = 0n;
  for (let i = 0; i < clientKeyHex.length; i++) {
    h = (h * 131n + BigInt(clientKeyHex.charCodeAt(i))) & 0xffffffffffffffffn;
  }
  return h.toString(16);
}

// ── IndexedDB cache for the server key ───────────────────────────────────────

const DB_NAME = "siphon-fhe";
const STORE = "serverKeys";

interface ServerKeyRow {
  userId: string;        // lowercase wallet
  clientKeyFp: string;   // fingerprint of the client key this server key was derived from
  serverKey: string;     // bincode+hex ServerKey
  ts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetServerKey(userId: string): Promise<ServerKeyRow | null> {
  try {
    const db = await openDb();
    return await new Promise<ServerKeyRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(userId.toLowerCase());
      req.onsuccess = () => resolve((req.result as ServerKeyRow) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // IndexedDB unavailable (private mode etc.) — cache miss, we re-derive
  }
}

async function idbPutServerKey(row: ServerKeyRow): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[FHE] server-key cache write failed (will re-derive next time):", e);
  }
}

// In-memory copy so repeat submits in one session never touch IndexedDB.
const memServerKeys = new Map<string, { clientKeyFp: string; serverKey: string }>();

/**
 * Server key for this wallet: memory → IndexedDB → derive (and persist).
 * Always matched to the CURRENT client key via fingerprint.
 */
export async function getOrCreateServerKey(userId: string, clientKey: string): Promise<string> {
  const uid = userId.toLowerCase();
  const fp = await fingerprintClientKey(clientKey);

  const mem = memServerKeys.get(uid);
  if (mem && mem.clientKeyFp === fp) return mem.serverKey;

  const cached = await idbGetServerKey(uid);
  if (cached && cached.clientKeyFp === fp) {
    memServerKeys.set(uid, { clientKeyFp: fp, serverKey: cached.serverKey });
    setState({ serverKeyReady: true, serverKeyBytes: Math.floor(cached.serverKey.length / 2) });
    return cached.serverKey;
  }

  setState({ stage: "deriving" });
  const serverKey = await deriveServerKey(clientKey);
  memServerKeys.set(uid, { clientKeyFp: fp, serverKey });
  void idbPutServerKey({ userId: uid, clientKeyFp: fp, serverKey, ts: Date.now() });
  setState({ serverKeyReady: true, serverKeyBytes: Math.floor(serverKey.length / 2) });
  return serverKey;
}

/** Cached server key for display/copy (no derive). Null if not warmed yet. */
export async function getCachedServerKey(userId: string): Promise<string | null> {
  const uid = userId.toLowerCase();
  const mem = memServerKeys.get(uid);
  if (mem) return mem.serverKey;
  const clientKey = getStoredClientKey(userId);
  const row = await idbGetServerKey(uid);
  if (!row) return null;
  // Only hand out a server key that matches the current client key.
  if (clientKey && row.clientKeyFp !== (await fingerprintClientKey(clientKey))) return null;
  return row.serverKey;
}

// ── Upload to the trade-executor ─────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = process.env.NEXT_PUBLIC_API_TOKEN || "";
  if (token) headers["X-API-TOKEN"] = token;
  return headers;
}

function uploadFlagKey(uid: string, base: string): string {
  return `siphon.fhe.skUploaded.${uid}.${base}`;
}

/**
 * Ensure the trade-executor has the server key matching THIS client key.
 *
 * Fast path: if we already uploaded this exact client key's server key (fingerprint
 * recorded in localStorage) AND the executor confirms it still has one on file
 * (/hasServerKey), skip the ~20MB upload entirely. A regenerated client key changes
 * the fingerprint → re-upload (same protection as the old always-upload behavior);
 * an executor DB reset makes /hasServerKey return false → re-upload.
 */
export async function ensureServerKeyUploaded(
  userId: string,
  clientKey: string,
  onUpload?: () => void,
): Promise<void> {
  const uid = userId.toLowerCase();
  const base = getTradeExecutorBaseUrl();
  const fp = await fingerprintClientKey(clientKey);
  const flagKey = uploadFlagKey(uid, base);

  if (typeof window !== "undefined" && window.localStorage.getItem(flagKey) === fp) {
    try {
      const res = await fetch(`${base}/hasServerKey/${userId}`, { headers: authHeaders() });
      if (res.ok && (await res.json())?.has_key === true) {
        setState({ uploaded: true });
        return;
      }
    } catch {
      /* can't confirm — fall through and upload */
    }
  }

  onUpload?.();
  setState({ stage: "uploading" });
  const serverKey = await getOrCreateServerKey(userId, clientKey);
  const res = await fetch(`${base}/uploadServerKey`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, server_key: serverKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `Server key upload failed (HTTP ${res.status})`);
  }
  if (typeof window !== "undefined") window.localStorage.setItem(flagKey, fp);
  setState({ uploaded: true });
}

// ── Warmup orchestration ─────────────────────────────────────────────────────

const inflight = new Map<string, Promise<void>>();
const warmedOk = new Set<string>();

/**
 * Full warmup for a wallet: client key (generate + persist on first connect),
 * server key (derive + IndexedDB cache), executor upload. Single-flight per wallet,
 * no-op once completed this session. Safe to call on every walletConnected event.
 */
export function warmFheKeys(userId: string): Promise<void> {
  const uid = userId.toLowerCase();
  if (warmedOk.has(uid)) return Promise.resolve();
  const running = inflight.get(uid);
  if (running) return running;

  const p = (async () => {
    if (state.userId !== uid) {
      // Different wallet — don't carry over the previous wallet's readiness flags.
      state = { stage: "idle", userId: uid, clientKeyReady: false, serverKeyReady: false, uploaded: false, serverKeyBytes: null };
    }
    setState({ userId: uid, error: undefined });
    const t0 = Date.now();
    const hadKey = !!getStoredClientKey(userId);
    if (!hadKey) {
      console.log("🔐 [FHE] New wallet — pre-generating FHE keypair now so orders are instant…");
      setState({ stage: "generating" });
    }
    const clientKey = await getOrCreateClientKey(userId);
    setState({ clientKeyReady: true });

    await getOrCreateServerKey(userId, clientKey);
    await ensureServerKeyUploaded(userId, clientKey);

    setState({ stage: "ready" });
    warmedOk.add(uid);
    console.log(`🔐 [FHE] Keys warmed for ${uid} in ${Date.now() - t0}ms (client+server key ready, executor has server key).`);
  })()
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[FHE] key warmup failed (orders will fall back to on-demand keygen):", msg);
      setState({ stage: "error", error: msg });
      throw e;
    })
    .finally(() => inflight.delete(uid));

  inflight.set(uid, p);
  return p;
}
