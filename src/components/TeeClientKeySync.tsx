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

    const sync = async () => {
      const userId = resolveWalletAddress();
      if (!userId) return;
      const clientKey = getStoredClientKey(userId);
      if (!clientKey) return;
      try {
        await ensureClientKeyInDecryptor(userId, clientKey);
        console.log("[TEE] Client key synced to confidential VM");
      } catch (e) {
        console.warn("[TEE] Client key sync failed:", e);
      }
    };

    void sync();
    window.addEventListener("walletConnected", sync);
    return () => window.removeEventListener("walletConnected", sync);
  }, []);

  return null;
}
