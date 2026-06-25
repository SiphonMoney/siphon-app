// In-browser FHE for Siphon — thin typed wrapper over the wasm-bindgen module in
// fhe-wasm/pkg. The wasm is byte-compatible with the Rust FHE engine (tfhe 0.5,
// integer radix, PARAM_MESSAGE_2_CARRY_2_KS_PBS, NUM_BLOCKS=16, bincode 1.3 + hex).
//
// The client key is generated client-side. With TEE autonomous mode it is also sent (via
// trade-executor proxy) to the confidential VM for result-bit decryption only.

// Bundler-target wasm-bindgen module lives outside src/. next.config.ts enables
// asyncWebAssembly + topLevelAwait so webpack can resolve the .wasm import.
type FheModule = typeof import("../../fhe-wasm/pkg/siphon_fhe_wasm.js");

export interface FheKeyPair {
  /** Secret key — bincode+hex RadixClientKey. NEVER send to a server. */
  clientKey: string;
  /** Evaluation key — bincode+hex ServerKey. Safe to send to the engine. */
  serverKey: string;
}

let modPromise: Promise<FheModule> | null = null;

/** Lazily load + init the wasm module exactly once. Browser-only. */
async function loadFhe(): Promise<FheModule> {
  if (typeof window === "undefined") {
    throw new Error("FHE wasm is browser-only and cannot run during SSR.");
  }
  if (!modPromise) {
    modPromise = import("../../fhe-wasm/pkg/siphon_fhe_wasm.js").then((mod) => {
      // init() sets the panic hook; the wasm-bindgen start fn runs on import.
      try {
        mod.init();
      } catch {
        /* init is idempotent enough for our purposes */
      }
      return mod;
    });
  }
  return modPromise;
}

/** Warm the wasm so the first real call isn't paying load cost. Optional. */
export async function initFhe(): Promise<void> {
  await loadFhe();
}

/**
 * Derive a (compressed) server key from an existing client key. NOT byte-deterministic —
 * each call uses fresh randomness — but any derived key correctly evaluates ciphertexts
 * from this client key, so it's safe to re-derive and re-upload whenever the backend needs it.
 */
export async function deriveServerKey(clientKeyHex: string): Promise<string> {
  const mod = await loadFhe();
  return mod.derive_server_key(clientKeyHex);
}

// ── Per-wallet client key persistence ────────────────────────────────────────
// Only the small client key (~22KB) is persisted in localStorage — never the ~23MB
// server key (which exceeds localStorage quota and is re-derivable from the client key).
// The client key is the secret that decrypts results, so it stays on this device only.

const CLIENT_KEY_PREFIX = "siphon.fhe.clientKey.";

function clientKeyStorageKey(userId: string): string {
  return CLIENT_KEY_PREFIX + userId.toLowerCase();
}

/** Return the persisted client key for this user, or null if none stored. */
export function getStoredClientKey(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(clientKeyStorageKey(userId));
}

/**
 * Get the user's client key, generating + persisting a fresh keypair on first use.
 * `onGenerate` is invoked (if provided) only when a new key is actually generated,
 * so callers can surface the multi-second keygen to the user.
 */
export async function getOrCreateClientKey(
  userId: string,
  onGenerate?: () => void,
): Promise<string> {
  const existing = getStoredClientKey(userId);
  if (existing) return existing;

  onGenerate?.();
  const { clientKey } = await generateKeys();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(clientKeyStorageKey(userId), clientKey);
  }
  return clientKey;
}

/**
 * Generate a fresh FHE keypair. Heavy: server-key generation is single-threaded
 * in wasm and can take a few seconds. Returns { clientKey, serverKey } as hex.
 */
export async function generateKeys(): Promise<FheKeyPair> {
  const mod = await loadFhe();
  const pair = mod.generate_keys() as FheKeyPair;
  return pair;
}

/**
 * Encrypt a price (in whole currency units, e.g. dollars) under the given client
 * key. Mirrors the server: priceCents = round(price * 100), encrypted as u64.
 * Returns the ciphertext as bincode+hex.
 */
export async function encryptPrice(
  price: number,
  clientKeyHex: string,
): Promise<string> {
  const mod = await loadFhe();
  const cents = BigInt(Math.round(price * 100));
  return mod.encrypt_price(cents, clientKeyHex);
}

/**
 * Encrypt an already-in-cents value (use when the caller did its own scaling).
 */
export async function encryptPriceCents(
  cents: bigint,
  clientKeyHex: string,
): Promise<string> {
  const mod = await loadFhe();
  return mod.encrypt_price(cents, clientKeyHex);
}

/**
 * Decrypt an engine-produced result ciphertext. The engine encodes the trigger
 * as 1/0; this returns the boolean (true = condition met).
 */
export async function decryptResult(
  ciphertextHex: string,
  clientKeyHex: string,
): Promise<boolean> {
  const mod = await loadFhe();
  return mod.decrypt_result(ciphertextHex, clientKeyHex);
}

/**
 * Recursively encrypt a price condition tree in place: each LEAF's plaintext
 * `bound` (dollars) is replaced with `encrypted_bound` (hex), matching the
 * server's encrypt_tree. Returns a new tree; the input is not mutated.
 */
export async function encryptConditionTree(
  tree: unknown,
  clientKeyHex: string,
): Promise<unknown> {
  const clone = structuredClone(tree);
  await encryptTreeInPlace(clone, clientKeyHex);
  return clone;
}

async function encryptTreeInPlace(
  node: unknown,
  clientKeyHex: string,
): Promise<void> {
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.op === "LEAF") {
    const bound = obj.bound;
    if (typeof bound === "number") {
      obj.encrypted_bound = await encryptPrice(bound, clientKeyHex);
      delete obj.bound;
    }
    return;
  }

  const conditions = obj.conditions;
  if (Array.isArray(conditions)) {
    for (const child of conditions) {
      await encryptTreeInPlace(child, clientKeyHex);
    }
  }
}
