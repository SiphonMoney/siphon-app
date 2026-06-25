/**
 * Upload the FHE client key to the confidential-vm decryptor (via trade-executor proxy).
 * Decryption of strategy inputs never happens — only the engine's encrypted result bit
 * is decrypted inside the VM.
 */

import { getTradeExecutorBaseUrl } from "@/lib/tradeExecutorClient";

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = process.env.NEXT_PUBLIC_API_TOKEN || "";
  if (token) headers["X-API-TOKEN"] = token;
  return headers;
}

/** True when autonomous TEE execution is enabled (no browser decrypt loop). */
export function isTeeAutonomousMode(): boolean {
  return process.env.NEXT_PUBLIC_TEE_AUTONOMOUS === "true";
}

export async function hasClientKeyInDecryptor(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${getTradeExecutorBaseUrl()}/hasClientKey/${encodeURIComponent(userId)}`,
    );
    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json?.has_key);
  } catch {
    return false;
  }
}

/**
 * Send the client key to the confidential VM (one-time per wallet). The browser keeps a
 * local copy for encrypting bounds; the VM copy enables server-side trigger decryption.
 */
export async function ensureClientKeyInDecryptor(
  userId: string,
  clientKeyHex: string,
  onUpload?: () => void,
): Promise<void> {
  if (!isTeeAutonomousMode()) return;

  const already = await hasClientKeyInDecryptor(userId);
  if (already) return;

  onUpload?.();
  const res = await fetch(`${getTradeExecutorBaseUrl()}/uploadClientKey`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, client_key: clientKeyHex }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text.length > 200 ? `Failed to upload client key to confidential VM (${res.status})` : text,
    );
  }
}
