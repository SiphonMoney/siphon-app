import type { Signer } from "ethers";
import { getSigner } from "./nexus";
import { fetchNotes } from "./noteStore";

/** Pull encrypted notes from the trade-executor into localStorage (wallet-authenticated). */
export async function syncWalletNotesFromServer(signer?: Signer | null): Promise<number> {
  const activeSigner = signer ?? getSigner();
  if (!activeSigner) return 0;

  try {
    const serverNotes = await fetchNotes(activeSigner);
    let synced = 0;
    for (const note of serverNotes) {
      if (note.spent === "true") continue;
      const asset = String(note.asset || "").toUpperCase();
      const key = `${note.chain_id}-${asset}-${note.commitment}`;
      const payload = {
        nullifier: note.decrypted.nullifier,
        secret: note.decrypted.secret,
        amount: note.decrypted.amount,
        commitment: note.commitment,
        nullifierHash: note.nullifier_hash,
        spent: false,
      };
      localStorage.setItem(key, JSON.stringify(payload));
      synced += 1;
    }
    return synced;
  } catch (e) {
    console.warn("[syncWalletNotes] Server note fetch failed:", e);
    return 0;
  }
}
