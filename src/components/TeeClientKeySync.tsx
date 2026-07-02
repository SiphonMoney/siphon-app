"use client";

/**
 * When TEE autonomous mode is on, sync an existing local client key to the confidential VM
 * on wallet connect (so returning users don't need to re-submit a strategy).
 */

import { useEffect } from "react";
import { getStoredClientKey, generateKeys, encryptPriceCents } from "@/lib/fhe";
import { ensureClientKeyInDecryptor, isTeeAutonomousMode } from "@/lib/decryptorClient";
import { ensureServerKeyUploaded, warmFheKeys } from "@/lib/fheKeyWarmup";
import { resolveWalletAddress } from "@/lib/walletAddress";
import { createVaultOutputNote } from "@/lib/outputNoteResolver";
import { NATIVE_TOKEN } from "@/lib/networks";
import type { TokenInfo } from "@/lib/zkHandler";
import { getTradeExecutorBaseUrl } from "@/lib/tradeExecutorClient";
import { getSigner } from "@/lib/nexus";

export default function TeeClientKeySync() {
  // PROTOCOL ADMIN: generate N protocol fee-note precommitments (owned by the connected protocol
  // wallet) and upload them to the executor's fee-vault sweep pool. Run while connected as the
  // protocol/treasury wallet: `await window.__siphonGenFeePool(20, '<ADMIN_API_TOKEN>')`.
  useEffect(() => {
    (window as unknown as { __siphonGenFeePool?: (n: number, adminToken: string, asset?: string) => Promise<unknown> }).__siphonGenFeePool =
      async (count = 20, adminToken = "", asset = "ETH") => {
        // Fee notes are generated for ETH (the primary fee asset) by default.
        const token: TokenInfo = { symbol: asset, address: asset === "ETH" ? NATIVE_TOKEN : "", decimals: asset === "ETH" ? 18 : 6 };
        const signer = getSigner() ?? undefined;
        const chainId = Number((await signer?.provider?.getNetwork())?.chainId ?? 11155111);
        const precommitments: string[] = [];
        for (let i = 0; i < count; i++) {
          const out = await createVaultOutputNote(chainId, token, signer);
          precommitments.push(out.precommitment);
        }
        const r = await fetch(`${getTradeExecutorBaseUrl()}/admin/fee-pool`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-ADMIN-TOKEN": adminToken },
          body: JSON.stringify({ chain_id: chainId, asset, precommitments }),
        });
        const j = await r.json();
        console.log("[FeePool] uploaded", precommitments.length, "precommitments:", j);
        return j;
      };
  }, []);

  // DEV: manual resync — re-derive + re-upload the server key (to the executor) and the client
  // key (to the decryptor) from the CURRENT stored client key, so both match the ciphertexts the
  // browser produced. Call `await window.__siphonResync()` in the console.
  useEffect(() => {
    (window as unknown as { __siphonResync?: () => Promise<string> }).__siphonResync = async () => {
      const userId = resolveWalletAddress();
      if (!userId) return "no wallet connected";
      const clientKey = getStoredClientKey(userId);
      if (!clientKey) return "no stored client key for " + userId;
      await ensureServerKeyUploaded(userId, clientKey);
      await ensureClientKeyInDecryptor(userId, clientKey);
      return "resynced server+client key for " + userId.toLowerCase();
    };

    // DEV self-test: generate a FRESH wasm keypair, encrypt fire_time=0, and round-trip it
    // through the native engine + decryptor. If triggered=true, wasm keys ARE engine-compatible.
    (window as unknown as { __siphonFheSelfTest?: () => Promise<unknown> }).__siphonFheSelfTest = async () => {
      const { clientKey, serverKey } = await generateKeys(); // fresh matched pair (compressed server key)
      const ct0 = await encryptPriceCents(0n, clientKey);    // fire_time = 0
      const r = await fetch("http://localhost:5005/debugEval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_key: serverKey, client_key: clientKey, encrypted_lower_bound: ct0, current_time: 100 }),
      });
      const j = await r.json();
      console.log("[FHE SELF-TEST]", j);
      return j;
    };
  }, []);

  // FHE key warmup: the moment a wallet connects, pre-generate the client key, derive +
  // cache the server key (IndexedDB) and pre-upload it to the trade-executor — so the
  // first order skips the multi-second keygen/derive and the ~20MB upload entirely.
  // warmFheKeys is single-flight + once-per-wallet, so repeated calls are free.
  useEffect(() => {
    const warm = (): boolean => {
      const userId = resolveWalletAddress();
      if (!userId) return false;
      void warmFheKeys(userId).catch(() => {/* logged inside; orders fall back to on-demand keygen */});
      return true;
    };

    // MetaMask auto-reconnect can land after mount without firing walletConnected — poll
    // briefly until an address shows up, then stop.
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (!warm()) {
      timer = setInterval(() => { if (warm()) stop(); }, 2000);
      setTimeout(stop, 120_000);
    }
    window.addEventListener("walletConnected", warm);
    return () => {
      stop();
      window.removeEventListener("walletConnected", warm);
    };
  }, []);

  useEffect(() => {
    if (!isTeeAutonomousMode()) return;

    let done = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    // Returns true once the key is synced (or there's genuinely nothing to sync yet).
    const sync = async (): Promise<boolean> => {
      const userId = resolveWalletAddress();
      if (!userId) return false; // wallet not connected yet — keep polling
      const clientKey = getStoredClientKey(userId);
      if (!clientKey) return false; // no key for this wallet yet (e.g. before first strategy)
      try {
        await ensureClientKeyInDecryptor(userId, clientKey);
        console.log("[TEE] Client key synced to confidential VM");
        return true;
      } catch (e) {
        console.warn("[TEE] Client key sync failed (will retry):", e);
        return false;
      }
    };

    // MetaMask auto-reconnect can land after mount and won't always fire walletConnected,
    // and the decryptor (in-memory keys) may have restarted — so poll until the key is synced.
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const tick = async () => {
      if (done) return;
      if (await sync()) { done = true; stop(); }
    };

    void tick();
    timer = setInterval(tick, 3000); // retry every 3s
    // Stop polling after ~2 min so we don't loop forever if the user never connects.
    const giveUp = setTimeout(stop, 120_000);
    window.addEventListener("walletConnected", tick);
    return () => {
      stop();
      clearTimeout(giveUp);
      window.removeEventListener("walletConnected", tick);
    };
  }, []);

  return null;
}
