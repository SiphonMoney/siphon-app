"use client";

import { useEffect } from "react";
import { walletManager } from "@/components/extensions/walletManager";
import { initializeWithProvider } from "@/lib/nexus";

/** Restores wallet session after reload and keeps UI + signer in sync with the provider. */
export default function WalletSessionBootstrap() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const wallet = await walletManager.restorePersistedSession();
      if (cancelled) return;

      if (wallet?.id === "metamask" && window.ethereum) {
        try {
          await initializeWithProvider(window.ethereum);
        } catch (error) {
          console.error("Failed to restore ethers session:", error);
          walletManager.clearSession();
          window.dispatchEvent(new Event("walletDisconnected"));
          return;
        }
      }

      if (wallet) {
        window.dispatchEvent(new Event("walletConnected"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
