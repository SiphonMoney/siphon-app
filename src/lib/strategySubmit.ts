// Client-side encrypted strategy submission.
//
// The browser:
//   1. holds a per-wallet FHE client key (generated + persisted locally),
//   2. uploads the matching (compressed) server key to the trade-executor once,
//   3. when TEE autonomous mode is on, uploads the client key to the confidential VM
//      (via trade-executor proxy) so decryption happens only inside that VM,
//   4. encrypts price bounds / condition tree locally,
//   5. POSTs the encrypted strategy to the trade-executor's /createStrategy.
// Plaintext bounds never leave the browser; the backend only ever sees ciphertext.

import {
  getOrCreateClientKey,
  deriveServerKey,
  encryptPrice,
  encryptConditionTree,
} from "@/lib/fhe";
import { ensureClientKeyInDecryptor, isTeeAutonomousMode } from "@/lib/decryptorClient";
import { getTradeExecutorBaseUrl } from "@/lib/tradeExecutorClient";
import { appendUserActivity } from "@/lib/userActivityLog";

function formatSubmitError(status: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return `Request failed (HTTP ${status})`;

  try {
    const json = JSON.parse(trimmed) as { error?: string; message?: string };
    const msg = json.error || json.message;
    if (msg) return msg;
  } catch {
    /* not JSON */
  }

  if (trimmed.startsWith("<!") || trimmed.includes("<html")) {
    if (status === 429) return "Rate limited — wait a minute and try again.";
    return `Server error (HTTP ${status}).`;
  }

  if (trimmed.length > 280) {
    return `${trimmed.slice(0, 280)}… (HTTP ${status})`;
  }
  return status >= 400 ? `${trimmed} (HTTP ${status})` : trimmed;
}

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
    throw new Error(formatSubmitError(res.status, text));
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
  // Swap output routing. 'vault' re-deposits the swap output into the asset_out vault as a
  // private note owned by output_precommitment (user withdraws it later themselves). 'address'
  // (default) sends the output to recipient_address.
  output_mode?: "vault" | "address";
  output_precommitment?: string;
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
  /** Called when the client key is being sent to the confidential VM. */
  onUploadClientKey?: () => void;
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

    // 2b. Confidential VM: upload client key so decryption happens only inside the TEE.
    if (isTeeAutonomousMode()) {
      console.log("🔐 [TEE] Uploading client key to confidential VM (decrypt happens only there)…");
      await ensureClientKeyInDecryptor(userId, clientKey, cb.onUploadClientKey);
    }

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
        (isTeeAutonomousMode()
          ? "Plaintext bounds stay in the browser; trigger decryption runs only in the confidential VM."
          : "Plaintext bounds NEVER leave the browser; only ciphertext + the server (eval) key are sent."),
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
      return { success: false, error: formatSubmitError(res.status, text) };
    }
    const data = JSON.parse(text);
    // Fire-and-forget: log the client-side encryption timings into the trade-executor terminal.
    void reportClientMetrics(userId, data?.strategy_id, m);
    try {
      appendUserActivity(userId, {
        kind: "strategy",
        strategyId: data?.strategy_id,
        status: "submitted",
        amount: payload.amount as number | string | undefined,
        token: payload.asset_in as string | undefined,
        label: `Strategy ${String(payload.strategy_type || "run").replace(/_/g, " ")}`,
      });
    } catch {
      /* activity log is best-effort */
    }
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
