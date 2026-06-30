/**
 * Strategy note reservation — closes the withdrawal race.
 *
 * A strategy's input note stays UNSPENT on-chain until the strategy executes. In that window the
 * user could withdraw the same note via a normal withdrawal, leaving the strategy with no funds.
 * To prevent that we mark the spent commitment(s) `pending` on the note DB at submit; the
 * withdrawal path (generateZKData) only ever re-hydrates `spent === 'false'` notes, so a reserved
 * note is no longer offered. Transitions are reconciled against strategy status:
 *   EXECUTED  → 'true'  (genuinely spent on-chain)
 *   FAILED    → 'false' (revert — give the note back so funds aren't locked)
 */
import { Signer } from "ethers";
import { markCommitmentSpent } from "./commitmentStore";

const RESERVED_KEY = (strategyId: string) => `siphon-reserved-${strategyId}`;

/** Reserve a strategy's input commitments: mark them `pending` + remember them for reconciliation. */
export async function reserveStrategyNotes(
  signer: Signer,
  strategyId: string,
  serverCommitmentIds: (string | null | undefined)[],
): Promise<void> {
  const ids = serverCommitmentIds.filter((x): x is string => !!x);
  if (!strategyId || ids.length === 0) return;
  try { localStorage.setItem(RESERVED_KEY(strategyId), JSON.stringify(ids)); } catch { /* quota */ }
  await Promise.allSettled(ids.map((id) => markCommitmentSpent(signer, id, "pending")));
}

/** Reconcile reserved notes against strategy statuses. Best-effort; safe to call repeatedly. */
export async function reconcileReservedNotes(
  signer: Signer,
  strategies: { id: string; status: string }[],
): Promise<void> {
  for (const s of strategies) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(RESERVED_KEY(s.id)); } catch { /* ignore */ }
    if (!raw) continue;

    const st = (s.status || "").toUpperCase();
    // EXPIRED/FAILED/CANCELLED → revert to 'false' so unspent funds return to the user.
    const terminal: "true" | "false" | null =
      st === "EXECUTED" ? "true"
        : (st === "FAILED" || st === "CANCELLED" || st === "EXPIRED" ? "false" : null);
    if (!terminal) continue;

    let ids: string[] = [];
    try { ids = JSON.parse(raw); } catch { ids = []; }
    await Promise.allSettled(ids.map((id) => markCommitmentSpent(signer, id, terminal)));
    try { localStorage.removeItem(RESERVED_KEY(s.id)); } catch { /* ignore */ }

    // The input notes were marked spent:true LOCALLY at submit to block the withdrawal race. If the
    // strategy didn't execute, return them to spendable (on-chain they're untouched). The server-
    // side markCommitmentSpent(..,'false') above is the backstop if this device misses this pass.
    if (terminal === "false") {
      try {
        const cleanupRaw = localStorage.getItem(`siphon-pending-cleanup-${s.id}`);
        if (cleanupRaw) {
          const localKeys: string[] = JSON.parse(cleanupRaw);
          const { markNoteSpent } = await import("./localNoteStore");
          for (const k of localKeys) markNoteSpent(k, false);
          localStorage.removeItem(`siphon-pending-cleanup-${s.id}`);
        }
      } catch { /* best-effort */ }
    }
  }
}
