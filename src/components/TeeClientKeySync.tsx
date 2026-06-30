"use client";

/**
 * When TEE autonomous mode is on, sync an existing local client key to the confidential VM
 * on wallet connect (so returning users don't need to re-submit a strategy).
 */

import { useEffect } from "react";
import { getStoredClientKey } from "@/lib/fhe";
import { ensureClientKeyInDecryptor, isTeeAutonomousMode } from "@/lib/decryptorClient";
import { resolveWalletAddress } from "@/lib/walletAddress";

export default function TeeClientKeySync() {
  useEffect(() => {
    if (!isTeeAutonomousMode()) return;

    let done = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    // Returns true once the key is synced (or there's genuinely nothing to sync yet).
    const sync = async (): Promise<boolean> => {
      const userId = resolveWalletAddress();
      if (!userId) return false; // wallet not connected yet — keep polling
      const clientKey = getStoredClientKey(userId);
      if (!clientKey) return false; // no key for this wallet yet (e.g. before first strategy)
      try {
        await ensureClientKeyInDecryptor(userId, clientKey);
        console.log("[TEE] Client key synced to confidential VM");
        return true;
      } catch (e) {
        console.warn("[TEE] Client key sync failed (will retry):", e);
        return false;
      }
    };

    // MetaMask auto-reconnect can land after mount and won't always fire walletConnected,
    // and the decryptor (in-memory keys) may have restarted — so poll until the key is synced.
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const tick = async () => {
      if (done) return;
      if (await sync()) { done = true; stop(); }
    };

    void tick();
    timer = setInterval(tick, 3000); // retry every 3s
    // Stop polling after ~2 min so we don't loop forever if the user never connects.
    const giveUp = setTimeout(stop, 120_000);
    window.addEventListener("walletConnected", tick);
    return () => {
      stop();
      clearTimeout(giveUp);
      window.removeEventListener("walletConnected", tick);
    };
  }, []);

  return null;
}
