// Client-side encrypted strategy submission.
//
// Replaces the old server-side flow (POST plaintext bounds -> payload-generator, which
// generated keys and encrypted them server-side). Now the browser:
//   1. holds a per-wallet FHE client key (generated + persisted locally, never uploaded),
//   2. uploads the matching (compressed) server key to the trade-executor once,
//   3. encrypts the price bounds / condition tree locally,
//   4. POSTs the encrypted strategy to the trade-executor's /createStrategy.
// The client (secret) key never leaves the device; the backend only ever sees ciphertext.

import { getTradeExecutorBaseUrl } from "@/lib/tradeExecutorClient";

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = process.env.NEXT_PUBLIC_API_TOKEN || "";
  if (token) headers["X-API-TOKEN"] = token;
  return headers;
}

/**
 * Ensure the trade-executor has this user's FHE server key on file. The server key is
 * re-derivable from the client key, so if the backend doesn't have it (first strategy,
 * or DB reset) we derive and upload it. Returns once a key is guaranteed present.
 */
export async function ensureServerKeyUploaded(
  userId: string,
  clientKey: string,
  onUpload?: () => void,
): Promise<void> {
  const base = getTradeExecutorBaseUrl();

  let hasKey = false;
  try {
    const res = await fetch(`${base}/hasServerKey/${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      hasKey = Boolean(json?.has_key);
    }
  } catch {
    // Network/server hiccup — fall through and attempt upload.
  }
  if (hasKey) return;

  onUpload?.();
  const serverKey = await deriveServerKey(clientKey);
  const res = await fetch(`${base}/uploadServerKey`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, server_key: serverKey }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`uploadServerKey failed: HTTP ${res.status}: ${text}`);
  }
}

export interface StrategyInput {
  user_id: string;
  strategy_type: string;
  asset_in: string;
  asset_out: string;
  amount: number;
  recipient_address: string;
  zk_proof: unknown;
  to_chain?: string;
  from_chain?: string;
  // Plaintext bounds (used when there's no condition tree). Encrypted here, never sent raw.
  upper_bound?: number;
  lower_bound?: number;
  // Composable strategies: tree with plaintext LEAF `bound`s, encrypted here.
  condition_tree?: unknown | null;
  // Any extra fields (side, grid_levels, slices, …) are forwarded untouched.
  [key: string]: unknown;
}

export interface SubmitResult {
  success: boolean;
  data?: { strategy_id?: string | number; payload_id?: string; [key: string]: unknown };
  error?: string;
}

export interface SubmitCallbacks {
  /** Called when a fresh FHE keypair is being generated (multi-second). */
  onKeygen?: () => void;
  /** Called when the server key is being uploaded (one-time, ~20MB). */
  onUploadKey?: () => void;
  /** Called when bounds are being encrypted. */
  onEncrypt?: () => void;
}

/**
 * Encrypt + submit a strategy entirely client-side. `input` is the same shape the builder
 * already assembles (plaintext bounds / tree); this function encrypts them and posts the
 * ciphertext to the trade-executor.
 */
export async function submitEncryptedStrategy(
  input: StrategyInput,
  cb: SubmitCallbacks = {},
): Promise<SubmitResult> {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const t0 = now();
  const m: ClientMetrics = { keygenMs: 0, serverKeyMs: 0, encryptMs: 0, submitMs: 0, totalMs: 0 };
  let didKeygen = false;
  try {
    const userId = input.user_id;
    if (!userId) return { success: false, error: "Missing user_id." };

    // 1. Per-wallet client key (generate + persist on first use). Time the keygen only if it ran.
    console.log("🔐 [FHE] Starting client-side encryption…");
    const tKey = now();
    const clientKey = await getOrCreateClientKey(userId, () => {
      didKeygen = true;
      console.log("🔐 [FHE] No client key found — generating a fresh FHE keypair (one-time, ~3-5s)…");
      cb.onKeygen?.();
    });
    if (didKeygen) m.keygenMs = now() - tKey;
    console.log(`🔐 [FHE] Client key ready (${didKeygen ? `generated in ${m.keygenMs.toFixed(0)}ms` : "loaded from localStorage"}).`);

    // 2. Make sure the matching server key is uploaded (derive + upload, if not already on file).
    const tSrv = now();
    await ensureServerKeyUploaded(userId, clientKey, cb.onUploadKey);
    m.serverKeyMs = now() - tSrv;

    // 3. Encrypt bounds / tree locally.
    cb.onEncrypt?.();
    const usingTree = input.condition_tree != null;
    const tEnc = now();
    console.log(`🔐 [FHE] Encrypting ${usingTree ? "condition tree" : `bounds (upper=${input.upper_bound ?? 0}, lower=${input.lower_bound ?? 0})`} in the browser…`);

    let encrypted_upper_bound: string | undefined;
    let encrypted_lower_bound: string | undefined;
    let condition_tree: unknown = undefined;

    if (usingTree) {
      condition_tree = await encryptConditionTree(input.condition_tree, clientKey);
    } else {
      const upper = typeof input.upper_bound === "number" ? input.upper_bound : 0;
      const lower = typeof input.lower_bound === "number" ? input.lower_bound : 0;
      encrypted_upper_bound = await encryptPrice(upper, clientKey);
      encrypted_lower_bound = await encryptPrice(lower, clientKey);
    }
    m.encryptMs = now() - tEnc;
    const ctChars = usingTree
      ? JSON.stringify(condition_tree).length
      : (encrypted_upper_bound?.length ?? 0) + (encrypted_lower_bound?.length ?? 0);
    console.log(
      `🔐 [FHE] ✅ Encrypted in ${m.encryptMs.toFixed(0)}ms → ${ctChars.toLocaleString()} hex chars of ciphertext. ` +
        `Plaintext bounds NEVER leave the browser; only ciphertext + the server (eval) key are sent.`,
    );

    // 4. Build the wire payload — strip plaintext bounds, attach ciphertext. No client key.
    const {
      upper_bound: _u,
      lower_bound: _l,
      condition_tree: _ct,
      ...rest
    } = input;
    void _u;
    void _l;
    void _ct;

    const payload: Record<string, unknown> = {
      ...rest,
      ...(usingTree
        ? { condition_tree }
        : { encrypted_upper_bound, encrypted_lower_bound }),
    };

    const base = getTradeExecutorBaseUrl();
    const tSubmit = now();
    const res = await fetch(`${base}/createStrategy`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    m.submitMs = now() - tSubmit;
    m.totalMs = now() - t0;
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = JSON.parse(text);
    // Fire-and-forget: log the client-side encryption timings into the trade-executor terminal.
    void reportClientMetrics(userId, data?.strategy_id, m);
    return { success: true, data };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

interface ClientMetrics {
  keygenMs: number;
  serverKeyMs: number;
  encryptMs: number;
  submitMs: number;
  totalMs: number;
}

/** POST the in-browser encryption timings to the trade-executor so they show up in its logs. */
async function reportClientMetrics(
  userId: string,
  strategyId: string | number | undefined,
  m: ClientMetrics,
): Promise<void> {
  // Also surface in the browser console for quick local inspection.
  console.log(
    `[FHE timing] keygen=${m.keygenMs.toFixed(0)}ms serverKey=${m.serverKeyMs.toFixed(0)}ms ` +
      `encrypt=${m.encryptMs.toFixed(0)}ms submit=${m.submitMs.toFixed(0)}ms total=${m.totalMs.toFixed(0)}ms`,
  );
  try {
    await fetch(`${getTradeExecutorBaseUrl()}/clientMetrics`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId, strategy_id: strategyId, ...m }),
    });
  } catch {
    /* metrics are best-effort */
  }
}
