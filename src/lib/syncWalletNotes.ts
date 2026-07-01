import type { Signer } from "ethers";
import { parseUnits } from "ethers";
import { getSigner } from "./nexus";
import { fetchNotes } from "./noteStore";
import { writeNote } from "./localNoteStore";
import { reconstructLeaf } from "./zkHandler";
import { getTokens } from "./networks";

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

      // Poison guard: never write a note whose secrets don't reproduce its own commitment
      // (a stale/corrupt server record from an older buggy resolve). The commitment is in the
      // record, so this is a PURE check (no chain read) — reconstruct the leaf and compare.
      // Without this, a poisoned server copy could overwrite a freshly-repaired local note.
      try {
        const tok = getTokens(Number(note.chain_id))[asset];
        const decimals = tok ? tok.decimals : 18;
        const amountWei = parseUnits(String(note.decrypted.amount), decimals);
        const { leaf } = await reconstructLeaf(BigInt(note.decrypted.nullifier), BigInt(note.decrypted.secret), amountWei);
        if (leaf !== BigInt(note.commitment)) {
          console.warn(`[syncWalletNotes] skipping inconsistent server note ${key} (secret doesn't reproduce commitment)`);
          continue;
        }
      } catch { /* unverifiable (bad decimals/parse) — fall through to prior best-effort write */ }

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
