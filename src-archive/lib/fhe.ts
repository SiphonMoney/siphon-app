// fhe.ts — in-browser FHE via the siphon-fhe-wasm module (tfhe-rs compiled to WASM).
//
// All key generation, bound encryption, and result decryption happen client-side. The client
// (secret) key never leaves the browser; only the server (public) key and ciphertexts are
// uploaded. Byte-compatible with the Rust FHE engine (same tfhe 0.5 radix params).

import { loadClientKey, saveClientKey } from "./fheKeyStore";

// Lazy, client-only import. wasm-bindgen (bundler target) instantiates the wasm on first import;
// keep it out of SSR by importing dynamically.
type WasmModule = typeof import("../../fhe-wasm/pkg/siphon_fhe_wasm");
let _wasm: Promise<WasmModule> | null = null;
function getWasm(): Promise<WasmModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("FHE WASM is browser-only"));
  }
  if (!_wasm) _wasm = import("../../fhe-wasm/pkg/siphon_fhe_wasm");
  return _wasm;
}

/** Encrypt a USD price as cents (price * 100), matching the engine's plaintext comparison. */
export async function encryptBound(usd: number, clientKeyHex: string): Promise<string> {
  const wasm = await getWasm();
  const cents = BigInt(Math.round(usd * 100));
  return wasm.encrypt_price(cents, clientKeyHex);
}

/** Decrypt an engine-produced result ciphertext to a boolean trigger. */
export async function decryptResult(ciphertextHex: string, clientKeyHex: string): Promise<boolean> {
  const wasm = await getWasm();
  return wasm.decrypt_result(ciphertextHex, clientKeyHex);
}

/**
 * Ensure the user has FHE keys available client-side and that their server key is on the
 * backend. Generates a keypair on first use (~3s), persists the client key locally, and
 * uploads the server key once. Returns the client key hex.
 */
export async function ensureFheReady(
  userId: string,
  apiBase: string,
  wrappingKey?: CryptoKey
): Promise<string> {
  let clientKey = await loadClientKey(userId, wrappingKey);

  // Does the backend already hold our server key?
  let backendHasKey = false;
  try {
    const r = await fetch(`${apiBase}/hasServerKey/${userId}`);
    if (r.ok) backendHasKey = (await r.json()).has_key === true;
  } catch {
    // best-effort; we'll (re)upload below if we generate
  }

  if (clientKey && backendHasKey) return clientKey;

  const wasm = await getWasm();

  if (!clientKey) {
    console.log("[FHE] Generating keypair in-browser (one-time, ~3s)...");
    const keys = wasm.generate_keys() as { clientKey: string; serverKey: string };
    clientKey = keys.clientKey;
    await saveClientKey(userId, clientKey, wrappingKey);
    await uploadServerKey(userId, keys.serverKey, apiBase);
  } else if (!backendHasKey) {
    // We have a local client key but the backend lost the server key. We cannot rederive the
    // matching server key from the client key alone, so regenerate the full pair.
    console.warn("[FHE] Backend missing server key; regenerating keypair.");
    const keys = wasm.generate_keys() as { clientKey: string; serverKey: string };
    clientKey = keys.clientKey;
    await saveClientKey(userId, clientKey, wrappingKey);
    await uploadServerKey(userId, keys.serverKey, apiBase);
  }

  return clientKey;
}

async function uploadServerKey(userId: string, serverKeyHex: string, apiBase: string): Promise<void> {
  console.log(`[FHE] Uploading server key (${(serverKeyHex.length / 2 / 1e6).toFixed(0)} MB)...`);
  const res = await fetch(`${apiBase}/uploadServerKey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, server_key: serverKeyHex }),
  });
  if (!res.ok) throw new Error(`uploadServerKey failed: ${await res.text()}`);
}
