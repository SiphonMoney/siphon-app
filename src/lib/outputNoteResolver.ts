/**
 * Output-note lifecycle for "vault-mode" swaps (swap output is re-deposited into the Siphon
 * vault as a private note the user owns, instead of being sent to an external address).
 *
 * Flow:
 *  1. createVaultOutputNote() — at strategy creation, generate the note's secret material and
 *     stash a PENDING record locally. Only the `precommitment` is shared with the executor.
 *  2. The executor swaps + re-deposits, and the vault emits Deposited(amount, commitment,
 *     precommitment). The amount/commitment are unknown until then (slippage).
 *  3. resolvePendingOutputNotes() — read the Deposited event for our precommitment, learn the
 *     real amount + commitment, write a spendable localStorage note, and (best-effort) sync it
 *     to the server encrypted. The normal withdraw flow then discovers and spends it.
 *
 * The nullifier/secret never leave the browser in plaintext — the server copy is AES-encrypted
 * with a wallet-derived key (see noteStore). The amount/commitment come from public chain data,
 * so nothing here trusts the executor or server.
 */
import { ethers, Signer } from 'ethers';
import { generateCommitmentData, resolveOutputNote, invalidateLeafCache, type TokenInfo } from './zkHandler';
import { postNote } from './noteStore';

const PENDING_PREFIX = 'siphon-pending-output-';

interface PendingOutputNote {
  nullifier: string;
  secret: string;
  precommitment: string;
  nullifierHash: string;
  chainId: number;
  symbol: string;
  tokenAddress: string;
  decimals: number;
}

function pendingKey(chainId: number, symbol: string, precommitment: string): string {
  return `${PENDING_PREFIX}${chainId}-${symbol}-${precommitment}`;
}

/**
 * Generate the output note's secret material and persist a pending record. Returns the
 * `precommitment` to attach to the strategy (the only field the executor needs).
 */
export async function createVaultOutputNote(
  chainId: number,
  token: TokenInfo,
): Promise<{ precommitment: string }> {
  // Amount is irrelevant to the precommitment (= H(nullifier, secret)); pass '0'.
  const cd = await generateCommitmentData(chainId, token, '0');
  const tokenAddress = token.symbol === 'ETH' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : token.address;

  const pending: PendingOutputNote = {
    nullifier: cd.nullifier,
    secret: cd.secret,
    precommitment: cd.precommitment,
    nullifierHash: cd.nullifierHash ?? '',
    chainId,
    symbol: token.symbol,
    tokenAddress,
    decimals: token.decimals,
  };
  localStorage.setItem(pendingKey(chainId, token.symbol, cd.precommitment), JSON.stringify(pending));
  return { precommitment: cd.precommitment };
}

/**
 * Resolve every pending output note whose deposit has landed on-chain: read the Deposited
 * event, write a spendable localStorage note, sync it to the server (best-effort), and drop the
 * pending record. Safe to call repeatedly (e.g. from the balance/notes refresh loop). Returns
 * the number of notes resolved this pass.
 */
export async function resolvePendingOutputNotes(signer?: Signer | null): Promise<number> {
  if (typeof localStorage === 'undefined') return 0;

  const pendingKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PENDING_PREFIX)) pendingKeys.push(k);
  }

  let resolved = 0;
  for (const k of pendingKeys) {
    let rec: PendingOutputNote;
    try {
      rec = JSON.parse(localStorage.getItem(k) || '{}');
    } catch {
      continue;
    }
    if (!rec.precommitment || !rec.tokenAddress) continue;

    try {
      const hit = await resolveOutputNote(rec.tokenAddress, rec.precommitment, rec.chainId);
      if (!hit) continue; // deposit not on-chain yet — try again next pass

      const humanAmount = ethers.formatUnits(hit.amount, rec.decimals);
      // Spendable note in the format the withdraw scan expects:
      // key `${chainId}-${SYMBOL}-${commitment}` → { nullifier, secret, amount(human), commitment }
      const noteKey = `${rec.chainId}-${rec.symbol}-${hit.commitment}`;
      localStorage.setItem(
        noteKey,
        JSON.stringify({
          nullifier: rec.nullifier,
          secret: rec.secret,
          precommitment: rec.precommitment,
          nullifierHash: rec.nullifierHash,
          amount: humanAmount,
          commitment: hit.commitment,
          spent: false,
        }),
      );

      // Best-effort server sync so the note survives across devices/clears.
      if (signer) {
        try {
          await postNote(
            signer,
            { nullifier: rec.nullifier, secret: rec.secret, amount: humanAmount },
            hit.commitment,
            rec.nullifierHash,
            rec.symbol,
            rec.chainId,
          );
        } catch (e) {
          console.warn('[OutputNote] server sync failed (localStorage still holds it):', e);
        }
      }

      // Bust the cached leaf scan for this token so the spendable-balance scan re-reads the
      // tree and includes the newly-deposited leaf (otherwise the note looks "not on-chain").
      try { invalidateLeafCache(rec.tokenAddress); } catch { /* best-effort */ }

      localStorage.removeItem(k);
      resolved += 1;
      console.log(`[OutputNote] resolved ${rec.symbol} note: ${humanAmount} (commitment ${hit.commitment})`);
    } catch (e) {
      console.warn('[OutputNote] resolve failed for', k, e);
    }
  }
  return resolved;
}
