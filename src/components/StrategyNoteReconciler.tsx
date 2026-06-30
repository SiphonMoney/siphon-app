"use client";

/**
 * Reconciles reserved strategy input notes (marked `pending` at submit) against strategy status:
 * EXECUTED → 'true', FAILED/CANCELLED → 'false' (revert). Runs in BOTH TEE and non-TEE modes via
 * /strategies polling, so a reserved note never stays stuck pending (funds locked) on failure.
 */
import { useEffect } from "react";
import { getStrategies } from "@/lib/strategyApi";
import { reconcileReservedNotes } from "@/lib/strategyNoteReservation";
import { resolveWalletAddress } from "@/lib/walletAddress";
import { getSigner } from "@/lib/nexus";

export default function StrategyNoteReconciler() {
  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      const userId = resolveWalletAddress();
      const signer = getSigner();
      if (!userId || !signer) return;
      try {
        const { success, strategies } = await getStrategies(userId);
        if (success && strategies?.length) {
          await reconcileReservedNotes(
            signer,
            strategies.map((s) => ({ id: s.id, status: s.status })),
          );
        }
      } catch {
        /* best-effort; retried next tick */
      }
    };

    void tick();
    const iv = setInterval(() => { if (!stopped) void tick(); }, 20_000);
    const onExecuted = () => { if (!stopped) void tick(); };
    window.addEventListener("siphon:strategyExecuted", onExecuted);
    return () => {
      stopped = true;
      clearInterval(iv);
      window.removeEventListener("siphon:strategyExecuted", onExecuted);
    };
  }, []);

  return null;
}
