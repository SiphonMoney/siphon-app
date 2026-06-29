// Multi-leg strategy builder (TWAP / RANGE_GRID).
//
// A TWAP/Grid order is executed as N INDEPENDENT shielded legs. This module turns a single
// deposit note into that ladder:
//
//   1. split  — Entrypoint.split slices ONE deposit note into N slice-notes in a single private
//               tx (always 8 commitments on-chain, zero-padded, so the real slice count is
//               hidden). Uses generateSplitProof().
//   2. prove  — one swap proof per slice-note (generateSwapProof), each spending a distinct note
//               with its own nullifier. N slices ⇒ N proofs ⇒ N nullifiers — never reused.
//   3. encrypt— each leg gets its OWN encrypted trigger:
//                 • grid rung  → encrypted price band (encryptPrice) keyed by buy/sell side
//                 • TWAP slice → encrypted FIRE-TIME (encryptPriceCents on the unix-second
//                   target), compared in the FHE engine against the public current time, so the
//                   cadence stays in ciphertext exactly like a price threshold.
//   4. assemble — return legs[] for the /createStrategy payload (the backend persists one
//                 StrategyLeg row per leg and the scheduler fires each independently).
//
// On-chain prerequisite: the deployed Entrypoint/Vault must expose split() + the multi-note
// withdraw/swap verifiers (the upgraded contracts). The split tx is submitted here via the
// caller-provided `submitSplit` so this module stays free of contract-wiring specifics.

import { ethers, Contract } from "ethers";
import {
  generateSplitProof,
  generateSwapProof,
  type TokenInfo,
  type SwapBinding,
  type SplitProofData,
  type SwapProofData,
} from "./zkHandler";
import { computeRangeGridLegs } from "./strategySpec";
import { encryptPrice, encryptPriceCents } from "./fhe";
import { getNetwork, NATIVE_TOKEN } from "./networks";
import { getSigner } from "./nexus";
import { writeNote, markNoteSpent } from "./localNoteStore";
import entrypointArtifact from "./abi/Entrypoint.json";

const ENTRYPOINT_ABI = entrypointArtifact.abi as ethers.InterfaceAbi;

const V3_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];
const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Resolve the Uniswap v3 pool for tokenIn/tokenOut on `chainId`, trying the requested fee tier
 * first then common ones. Returns the pool address for a leg's SwapBinding (bound into the swap
 * proof and checked by Vault.swap). Throws if no pool exists.
 */
export async function resolveSwapPool(
  chainId: number,
  tokenInAddr: string,
  tokenOutAddr: string,
  fee = 3000,
): Promise<{ pool: string; fee: number }> {
  const net = getNetwork(chainId);
  if (!net.uniswapV3Factory) throw new Error(`No uniswapV3Factory configured for chain ${chainId}`);
  const signer = getSigner();
  const provider = signer?.provider ?? ethers.getDefaultProvider(net.rpcUrl);
  const factory = new Contract(net.uniswapV3Factory, V3_FACTORY_ABI, provider);
  const tIn = tokenInAddr === NATIVE_TOKEN ? net.weth : tokenInAddr;
  const tOut = tokenOutAddr === NATIVE_TOKEN ? net.weth : tokenOutAddr;
  for (const f of [...new Set([fee, 3000, 500, 10000, 100])]) {
    const pool: string = await factory.getPool(tIn, tOut, f);
    if (pool && pool !== ZERO) return { pool, fee: f };
  }
  throw new Error(`No Uniswap v3 pool for ${tIn} → ${tOut} on chain ${chainId}`);
}

/**
 * Broadcast Entrypoint.split(asset, stateRoot, nullifierHash, outCommitments[8], pA, pB, pC),
 * then persist the real slice notes to the local encrypted note store so the per-leg swap proofs
 * can spend them by note key. Returns the tx hash + the slice note keys (split insert order).
 *
 * Requires the upgraded Entrypoint with split() (the multi-note contracts). On the legacy
 * single-note deployment this call reverts — multi-leg orders need the redeploy.
 */
export async function submitSplitOnChain(
  chainId: number,
  token: TokenInfo,
  split: SplitProofData,
): Promise<{ txHash: string; sliceNoteKeys: string[] }> {
  const signer = getSigner();
  if (!signer) throw new Error("Wallet not connected.");
  const net = getNetwork(chainId);
  const asset = token.symbol === "ETH" ? NATIVE_TOKEN : token.address;

  const entrypoint = new Contract(net.entrypoint, ENTRYPOINT_ABI, signer);
  const tx = await entrypoint.split(
    asset,
    split.stateRoot,
    split.nullifierHash,
    split.outCommitments,
    split.pA,
    split.pB,
    split.pC,
  );
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`split tx failed: ${tx.hash}`);
  }

  // Persist the real slice notes (encrypted) keyed `${chainId}-${SYMBOL}-${commitment}`.
  const sliceNoteKeys: string[] = [];
  for (const slice of split.slices) {
    const key = `${chainId}-${token.symbol}-${slice.commitment}`;
    await writeNote(
      key,
      {
        nullifier: slice.nullifier,
        secret: slice.secret,
        commitment: slice.commitment,
        precommitment: slice.precommitment,
        amount: ethers.formatUnits(slice.amountWei, token.decimals),
        spent: false,
      },
      signer,
    );
    sliceNoteKeys.push(key);
  }
  // The split input note is consumed.
  if (split.spentNoteKey) markNoteSpent(split.spentNoteKey);

  return { txHash: tx.hash, sliceNoteKeys };
}

export interface BuiltLeg {
  leg_index: number;
  amount: number;                 // human units (asset_in)
  side?: "LIMIT_BUY" | "LIMIT_SELL";
  eval_mode: "price" | "time";
  target_price?: number;          // grid rung price (reference)
  encrypted_upper_bound?: string; // sell-rung price band
  encrypted_lower_bound?: string; // buy-rung price band  OR  TWAP encrypted fire-time
  zk_proof: {
    pA: [string, string];
    pB: [[string, string], [string, string]];
    pC: [string, string];
    stateRoot: string;
    nullifierHashes: string[];    // one slice note spent per leg
    newCommitment: string;
    pool: string;
    dstToken: string;
    fee: number;
    minAmountOut: string;
    amountIn: string;
  };
}

export interface MultiLegResult {
  legs: BuiltLeg[];
  splitTxHash: string;
  scheduleAnchor: number;         // unix seconds the TWAP fire-times were computed against
}

/** A swap proof → the leg's zk_proof wire shape (single slice note ⇒ 1-element nullifier array). */
function swapProofToLegProof(p: SwapProofData): BuiltLeg["zk_proof"] {
  return {
    pA: p.pA,
    pB: p.pB,
    pC: p.pC,
    stateRoot: p.stateRoot,
    nullifierHashes: [p.nullifier],
    newCommitment: p.newCommitment,
    pool: p.pool,
    dstToken: p.dstToken,
    fee: p.fee,
    minAmountOut: p.minAmountOut,
    amountIn: p.amountIn,
  };
}

/**
 * Split the deposit, then build one swap proof per slice. Shared by TWAP + Grid; the caller
 * supplies the per-leg encrypted bound via `encryptLeg(legIndex, sliceAmountHuman)`.
 *
 * `submitSplit` must broadcast Entrypoint.split(splitProof) and resolve once the slice
 * commitments are on-chain leaves (so the subsequent swap proofs can prove membership). It also
 * must persist the slice notes to the local note store keyed `${chainId}-${symbol}-${commitment}`
 * so generateSwapProof can find them by note key.
 */
async function buildLegsFromSplit(
  chainId: number,
  inToken: TokenInfo,
  sliceCount: number,
  swap: SwapBinding,
  recipient: string,
  encryptLeg: (legIndex: number, sliceAmountHuman: string) => Promise<Pick<BuiltLeg, "encrypted_upper_bound" | "encrypted_lower_bound" | "side" | "eval_mode" | "target_price">>,
  submitSplit: (split: SplitProofData) => Promise<{ txHash: string; sliceNoteKeys: string[] }>,
): Promise<MultiLegResult> {
  const scheduleAnchor = Math.floor(Date.now() / 1000);

  // 1. Split one deposit note into N slice notes (private, on-chain).
  const split = await generateSplitProof(chainId, inToken, sliceCount);
  if ("error" in split) throw new Error(`split proof failed: ${split.error}`);
  const { txHash: splitTxHash, sliceNoteKeys } = await submitSplit(split);
  if (sliceNoteKeys.length < sliceCount) {
    throw new Error(`split produced ${sliceNoteKeys.length} slice notes, need ${sliceCount}`);
  }

  // 2+3. Per slice: swap proof + encrypted trigger.
  const legs: BuiltLeg[] = [];
  for (let i = 0; i < sliceCount; i++) {
    const noteKey = sliceNoteKeys[i];
    const slice = split.slices[i];
    const sliceAmountHuman = ethers.formatUnits(slice.amountWei, inToken.decimals);

    const proof = await generateSwapProof(chainId, inToken, sliceAmountHuman, recipient, swap, noteKey);
    if ("error" in proof) throw new Error(`leg ${i} swap proof failed: ${proof.error}`);

    const bound = await encryptLeg(i, sliceAmountHuman);
    legs.push({
      leg_index: i,
      amount: parseFloat(sliceAmountHuman),
      ...bound,
      zk_proof: swapProofToLegProof(proof),
    });
  }

  return { legs, splitTxHash, scheduleAnchor };
}

/**
 * TWAP: N equal slices, each firing at anchor + k*interval (encrypted fire-time, FHE-gated).
 * `clientKeyHex` is the user's FHE client key (used to encrypt each fire-time).
 */
export async function buildTwapLegs(opts: {
  chainId: number;
  inToken: TokenInfo;
  sliceCount: number;
  intervalSec: number;
  swap: SwapBinding;
  recipient: string;
  clientKeyHex: string;
  submitSplit: (split: SplitProofData) => Promise<{ txHash: string; sliceNoteKeys: string[] }>;
}): Promise<MultiLegResult> {
  const { chainId, inToken, sliceCount, intervalSec, swap, recipient, clientKeyHex, submitSplit } = opts;
  const anchor = Math.floor(Date.now() / 1000);
  const encryptLeg = async (i: number) => {
    const fireTime = BigInt(anchor + i * intervalSec); // unix seconds
    return {
      eval_mode: "time" as const,
      encrypted_lower_bound: await encryptPriceCents(fireTime, clientKeyHex),
    };
  };
  const res = await buildLegsFromSplit(chainId, inToken, sliceCount, swap, recipient, encryptLeg, submitSplit);
  return { ...res, scheduleAnchor: anchor };
}

/**
 * Grid: N rungs across [low, high]; even rungs buy (fire on price ≤ rung), odd rungs sell
 * (fire on price ≥ rung). Each rung gets an encrypted price band keyed by its side.
 */
export async function buildGridLegs(opts: {
  chainId: number;
  inToken: TokenInfo;
  low: number;
  high: number;
  levels: number;
  swap: SwapBinding;
  recipient: string;
  clientKeyHex: string;
  submitSplit: (split: SplitProofData) => Promise<{ txHash: string; sliceNoteKeys: string[] }>;
}): Promise<MultiLegResult> {
  const { chainId, inToken, low, high, levels, swap, recipient, clientKeyHex, submitSplit } = opts;
  const rungs = computeRangeGridLegs(low, high, levels);
  const encryptLeg = async (i: number) => {
    const rung = rungs[i];
    const encBound = await encryptPrice(rung.price, clientKeyHex);
    return rung.legType === "LIMIT_BUY"
      ? { eval_mode: "price" as const, side: "LIMIT_BUY" as const, target_price: rung.price, encrypted_lower_bound: encBound }
      : { eval_mode: "price" as const, side: "LIMIT_SELL" as const, target_price: rung.price, encrypted_upper_bound: encBound };
  };
  return buildLegsFromSplit(chainId, inToken, levels, swap, recipient, encryptLeg, submitSplit);
}
