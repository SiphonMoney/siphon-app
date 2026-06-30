import type { Signer } from "ethers";
import { getSigner } from "./nexus";
import { fetchNotes } from "./noteStore";
import { writeNote } from "./localNoteStore";

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
      // Must go through writeNote so the secret/nullifier are stored as nullifier_enc/secret_enc.
      // A raw setItem of plaintext fields is unreadable by readNote (it requires *_enc), which
      // made synced notes show in the balance but be unspendable on withdraw ("Have 0.0").
      await writeNote(
        key,
        {
          nullifier:     note.decrypted.nullifier,
          secret:        note.decrypted.secret,
          commitment:    note.commitment,
          precommitment: "", // not returned by the server note payload; unused by the withdraw proof
          nullifierHash: note.nullifier_hash,
          amount:        note.decrypted.amount,
          spent:         false,
        },
        activeSigner,
      );
      synced += 1;
    }
    return synced;
  } catch (e) {
    console.warn("[syncWalletNotes] Server note fetch failed:", e);
    return 0;
  }
}
