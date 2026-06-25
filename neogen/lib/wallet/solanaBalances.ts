import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type { SolanaCluster } from "@/lib/wallet/chains";

export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaXiiqHmWBmtzFVBitTo9AJ";

function endpoint(cluster: SolanaCluster): string {
  return cluster === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

export function solanaConnection(cluster: SolanaCluster): Connection {
  return new Connection(endpoint(cluster), "confirmed");
}

/** Lamports as decimal integer string (for `balance_wei`-style fields). */
export async function fetchSolLamports(
  ownerBase58: string,
  cluster: SolanaCluster,
): Promise<string> {
  const conn = solanaConnection(cluster);
  const lamports = await conn.getBalance(new PublicKey(ownerBase58));
  return BigInt(lamports).toString(10);
}

export function lamportsToSolNumber(lamportsDecimal: string): number {
  const lamports = BigInt(lamportsDecimal || "0");
  const base = BigInt(LAMPORTS_PER_SOL);
  return Number(lamports) / Number(base);
}

/** USDC UI amount or null if no account. */
export async function fetchUsdcUiAmount(
  ownerBase58: string,
  cluster: SolanaCluster,
): Promise<number | null> {
  const mint =
    cluster === "mainnet-beta" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
  const conn = solanaConnection(cluster);
  const owner = new PublicKey(ownerBase58);
  const mintPk = new PublicKey(mint);
  const res = await conn.getParsedTokenAccountsByOwner(owner, { mint: mintPk });
  if (!res.value.length) return null;
  const parsed = res.value[0].account.data as {
    parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } };
  };
  const ui = parsed.parsed?.info?.tokenAmount?.uiAmount;
  if (ui == null || typeof ui !== "number") return null;
  return ui;
}
