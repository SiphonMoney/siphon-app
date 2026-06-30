"use client";

/**
 * Reconciles reserved strategy input notes (marked `pending` at submit) against strategy status:
 * EXECUTED → 'true', FAILED/CANCELLED → 'false' (revert). Runs in BOTH TEE and non-TEE modes via
 * /strategies polling, so a reserved note never stays stuck pending (funds locked) on failure.
 */
import { useEffect } from "react";
import { getStrategies } from "@/lib/strategyApi";
import { reconcileReservedNotes } from "@/lib/strategyNoteReservation";
import { pruneSpentCommitments } from "@/lib/commitmentStore";
import { resolveWalletAddress } from "@/lib/walletAddress";
import { getSigner } from "@/lib/nexus";

const PRUNE_KEY = "siphon-last-prune";
const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000; // sweep spent commitments at most every 6h

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

        // Throttled space reclaim: delete long-spent commitment rows (>7d) at most every 6h.
        let last = 0;
        try { last = Number(localStorage.getItem(PRUNE_KEY) || 0); } catch { /* ignore */ }
        if (Date.now() - last > PRUNE_EVERY_MS) {
          try { localStorage.setItem(PRUNE_KEY, String(Date.now())); } catch { /* ignore */ }
          void pruneSpentCommitments(signer).catch(() => {});
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
