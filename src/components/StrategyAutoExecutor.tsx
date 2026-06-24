"use client";

/**
 * Background watcher: while the dapp is open and a wallet is connected, polls ARMED
 * strategies every few seconds, decrypts FHE results locally, and calls /executeStrategy
 * when the price condition is met. The server cannot do this (no client key).
 */

import { useCallback, useEffect, useRef } from "react";
import { processArmedStrategies } from "@/lib/strategyApi";
import { resolveWalletAddress } from "@/lib/walletAddress";

const POLL_MS = 5_000;

export default function StrategyAutoExecutor() {
  const inFlight = useRef(false);
  const notified = useRef(new Set<string>());

  const tick = useCallback(async () => {
    if (inFlight.current) return;

    const userId = resolveWalletAddress();
    if (!userId) return;

    inFlight.current = true;
    try {
      const executed = await processArmedStrategies(userId);
      for (const id of executed) {
        if (notified.current.has(id)) continue;
        notified.current.add(id);
        console.log(`[AutoExecutor] Strategy ${id} executed automatically`);
        window.dispatchEvent(
          new CustomEvent("siphon:strategyExecuted", { detail: { strategyId: id } }),
        );
      }
    } catch (e) {
      console.error("[AutoExecutor]", e);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void tick();
    const interval = setInterval(() => void tick(), POLL_MS);
    const onWake = () => void tick();
    window.addEventListener("walletConnected", onWake);
    window.addEventListener("siphon:strategySubmitted", onWake);
    return () => {
      clearInterval(interval);
      window.removeEventListener("walletConnected", onWake);
      window.removeEventListener("siphon:strategySubmitted", onWake);
    };
  }, [tick]);

  return null;
}
