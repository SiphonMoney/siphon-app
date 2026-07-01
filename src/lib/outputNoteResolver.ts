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
import { postPrecommitment } from './precommitmentStore';
import { postCommitment } from './commitmentStore';
import { deriveEncKey, encryptBlob, decryptBlob } from './noteAuth';

const PENDING_PREFIX = 'siphon-pending-output-';

interface PendingOutputNote {
  nullifier?: string;   // plaintext nullifier — never written to localStorage
  secret?: string;      // plaintext secret — never written to localStorage
  enc?: { enc_blob: string; iv: string }; // AES-GCM(wallet key) of {nullifier,secret} — local fallback if Supabase upload fails
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
  signer?: Signer | null,
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
  // Encrypt {nullifier,secret} with the wallet-derived key and keep it in the pending record too.
  // This is the local fallback so a Supabase upload failure can't permanently strand the funds —
  // the resolver recovers the secret from here if the server copy is missing. Plaintext secret
  // still never touches localStorage (only the AES-GCM ciphertext does).
  let enc: { enc_blob: string; iv: string } | undefined;
  if (signer) {
    try {
      const key = await deriveEncKey(signer);
      enc = await encryptBlob(key, { nullifier: cd.nullifier, secret: cd.secret });
    } catch (e) {
      console.warn('[OutputNote] local secret encryption failed (Supabase will be the only copy):', e);
    }
  }
  localStorage.setItem(pendingKey(chainId, token.symbol, cd.precommitment), JSON.stringify({
    precommitment: pending.precommitment,
    nullifierHash: pending.nullifierHash,
    chainId:       pending.chainId,
    symbol:        pending.symbol,
    tokenAddress:  pending.tokenAddress,
    decimals:      pending.decimals,
    ...(enc ? { enc } : {}),
  }));

  // Upload to Supabase so the precommitment survives across devices/clears.
  if (signer) {
    try {
      await postPrecommitment(signer, {
        nullifier:     cd.nullifier,
        secret:        cd.secret,
        precommitment: cd.precommitment,
        asset:         token.symbol,
        chainId,
      });
    } catch (e) {
      console.warn('[OutputNote] precommitment server upload failed (localStorage still holds it):', e);
    }
  }

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
  if (pendingKeys.length === 0 && !signer) return 0; // with a signer, still run server-side recovery below

  // Fetch the server's pending precommitment list once so we don't make a
  // round-trip + wallet sig request per resolved note inside the loop.
  let serverPending: Awaited<ReturnType<typeof import('./precommitmentStore').fetchPendingPrecommitments>> = [];
  if (signer) {
    try {
      const { fetchPendingPrecommitments } = await import('./precommitmentStore');
      serverPending = await fetchPendingPrecommitments(signer);
    } catch { /* best-effort */ }
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
      const noteKey = `${rec.chainId}-${rec.symbol}-${hit.commitment}`;

      // Recover the secret: prefer the server precommitment list, then the locally-encrypted copy
      // stored in the pending record (resilient to a Supabase upload/auth failure).
      const serverMatch = serverPending.find(p => p.decrypted.precommitment === rec.precommitment);
      let nullifier = rec.nullifier ?? serverMatch?.decrypted.nullifier;
      let secret    = rec.secret    ?? serverMatch?.decrypted.secret;
      if ((!nullifier || !secret) && rec.enc && signer) {
        try {
          const key = await deriveEncKey(signer);
          const dec = await decryptBlob<{ nullifier: string; secret: string }>(key, rec.enc.enc_blob, rec.enc.iv);
          nullifier = nullifier ?? dec.nullifier;
          secret    = secret    ?? dec.secret;
        } catch { /* ignore — fall through to metadata-only note */ }
      }

      if (signer && nullifier && secret) {
        // Full resolved note — encrypt nullifier + secret.
        const { writeNote } = await import('./localNoteStore');
        await writeNote(noteKey, {
          nullifier,
          secret,
          commitment:    hit.commitment,
          precommitment: rec.precommitment,
          nullifierHash: rec.nullifierHash,
          amount:        humanAmount,
          spent:         false,
        }, signer);
      } else {
        // No signer or secrets unavailable — write plaintext metadata only so balance scan
        // can see the note; it will be unspendable until re-resolved with a signer.
        localStorage.setItem(noteKey, JSON.stringify({
          commitment:    hit.commitment,
          precommitment: rec.precommitment,
          nullifierHash: rec.nullifierHash,
          amount:        humanAmount,
          spent:         false,
        }));
      }

      // Resolve on Supabase: write spendable commitment, mark precommitment resolved.
      if (signer) {
        try {
          await postCommitment(
            signer,
            {
              nullifier:  nullifier!,
              secret:     secret!,
              commitment: hit.commitment,
              amount:     humanAmount,
              chainId:    rec.chainId,
            },
            rec.symbol,
            'vault-output',
          );
        } catch (e) {
          console.warn('[OutputNote] commitment server sync failed (localStorage still holds it):', e);
        }
        // Mark the pending precommitment resolved.
        try {
          const { resolvePrecommitment } = await import('./precommitmentStore');
          if (serverMatch) await resolvePrecommitment(signer, serverMatch.id);
        } catch { /* best-effort */ }
      }

      // Bust the cached leaf scan for this token so the spendable-balance scan re-reads the
      // tree and includes the newly-deposited leaf (otherwise the note looks "not on-chain").
      try { invalidateLeafCache(rec.tokenAddress); } catch { /* best-effort */ }

      // Only drop the pending record once the note is FULLY resolved (secret written via the
      // signer branch). On the metadata-only branch (no signer / secret unavailable) KEEP it —
      // rec.enc is the only local copy of the secret, and a later signed pass needs it. Deleting
      // it here permanently strands the output funds (the normal TWAP/grid vault re-deposit case,
      // since the 60s balance poll calls this with no signer).
      const fullyResolved = !!(signer && nullifier && secret);
      if (fullyResolved) {
        localStorage.removeItem(k);
        console.log(`[OutputNote] resolved ${rec.symbol} note: ${humanAmount} (commitment ${hit.commitment})`);
      } else {
        console.log(`[OutputNote] ${rec.symbol} note seen on-chain (${humanAmount}) but no signer — keeping encrypted secret for a signed pass`);
      }
      resolved += 1;
    } catch (e) {
      console.warn('[OutputNote] resolve failed for', k, e);
    }
  }

  // Server-side recovery: an output note whose LOCAL pending record was already deleted (e.g. by an
  // older no-signer poll before the keep-secret fix) can still be rebuilt from the Supabase
  // precommitment, which holds the nullifier+secret. Finalize any pending precommitment whose
  // deposit is now on-chain and isn't already spendable locally.
  if (signer && serverPending.length > 0) {
    const { getTokens } = await import('./networks');
    const { writeNote } = await import('./localNoteStore');
    const { resolvePrecommitment } = await import('./precommitmentStore');
    const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    for (const sp of serverPending) {
      try {
        const { nullifier, secret, precommitment, asset, chainId } = sp.decrypted;
        if (!precommitment || !asset) continue;
        const symbol = String(asset).toUpperCase();
        const tok = getTokens(chainId)[symbol];
        const tokenAddress = symbol === 'ETH' ? NATIVE : tok?.address;
        if (!tokenAddress) continue;
        const hit = await resolveOutputNote(tokenAddress, precommitment, chainId);
        if (!hit) continue; // deposit not on-chain yet
        const noteKey = `${chainId}-${symbol}-${hit.commitment}`;
        const existing = localStorage.getItem(noteKey);
        const alreadyReadable = existing
          ? (() => { try { return !!JSON.parse(existing).nullifier_enc; } catch { return false; } })()
          : false;
        if (alreadyReadable) continue; // already spendable
        const humanAmount = ethers.formatUnits(hit.amount, tok ? tok.decimals : 18);
        // nullifierHash left '' — the withdraw path recomputes it from the nullifier.
        await writeNote(noteKey, {
          nullifier, secret, commitment: hit.commitment, precommitment, nullifierHash: '',
          amount: humanAmount, spent: false,
        }, signer);
        try {
          await postCommitment(signer, { nullifier, secret, commitment: hit.commitment, amount: humanAmount, chainId }, symbol, 'vault-output');
        } catch { /* best-effort */ }
        try { await resolvePrecommitment(signer, sp.id); } catch { /* best-effort */ }
        try { invalidateLeafCache(tokenAddress); } catch { /* best-effort */ }
        resolved += 1;
        console.log(`[OutputNote] recovered ${symbol} note from server precommitment: ${humanAmount} (commitment ${hit.commitment})`);
      } catch (e) {
        console.warn('[OutputNote] server recovery failed for precommitment', sp.id, e);
      }
    }
  }

  return resolved;
}
