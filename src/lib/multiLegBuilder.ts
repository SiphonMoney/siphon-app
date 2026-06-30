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
  generateZKData,
  invalidateLeafCache,
  type TokenInfo,
  type SwapBinding,
  type SplitProofData,
  type ZKData,
} from "./zkHandler";
import { computeRangeGridLegs } from "./strategySpec";
import { encryptPrice, encryptPriceCents } from "./fhe";
import { getNetwork, NATIVE_TOKEN, getZkWithdrawRecipient } from "./networks";
import { getSigner } from "./nexus";
import { createVaultOutputNote } from "./outputNoteResolver";
import { getTradeExecutorBaseUrl } from "./tradeExecutorClient";
import { writeNote, markNoteSpent } from "./localNoteStore";

// The bundled Entrypoint.json predates the split() upgrade, so declare split explicitly.
// Entrypoint.split(address asset, uint256 stateRoot, uint256 nullifierHash,
//   uint256[8] outCommitments, uint[2] pA, uint[2][2] pB, uint[2] pC)
const SPLIT_ABI = [
  "function split(address _asset, uint256 _stateRoot, uint256 _nullifierHash, uint256[8] _outCommitments, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC)",
];

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

  const entrypoint = new Contract(net.entrypoint, SPLIT_ABI, signer);
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

  // The 8 slice commitments are now on-chain leaves — bust the cached leaf scan so the per-leg
  // swap proofs can prove membership (otherwise getLeafSet returns the pre-split set and the
  // slice notes look "not on-chain").
  try { invalidateLeafCache(asset); } catch { /* best-effort */ }

  // Persist the real slice notes (encrypted) keyed `${chainId}-${SYMBOL}-${commitment}`.
  // Skip the protocol arming-fee slice (no nullifier/secret on this device) so sliceNoteKeys holds
  // only the USER slices the legs map to.
  const sliceNoteKeys: string[] = [];
  for (const slice of split.slices) {
    if (!slice.nullifier) continue;
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
  // Each leg re-deposits its swap output into the asset_out vault as a private note; this is that
  // note's precommitment (the executor mints Poseidon(actualOut, precommitment) on deposit).
  output_precommitment: string;
  // A single-slice WITHDRAW proof (executor withdraws this slice → swaps → re-deposits to vault).
  zk_proof: {
    pA: [string, string];
    pB: [[string, string], [string, string]];
    pC: [string, string];
    stateRoot: string;
    nullifierHashes: string[];    // one slice note spent per leg
    changeCommitment: string;
    newCommitment: string;        // == changeCommitment (backend reads either)
    amount: string;               // withdrawn value (slice amount, wei)
  };
}

export interface MultiLegResult {
  legs: BuiltLeg[];
  splitTxHash: string;
  scheduleAnchor: number;         // unix seconds the TWAP fire-times were computed against
  armingFeeWei?: string;          // Part A arming fee carved into the protocol fee slice (wei)
  armingPrecommitment?: string;   // the protocol precommitment that slice was minted to
}

/** A single-slice withdraw proof → the leg's zk_proof wire shape. */
function withdrawProofToLegProof(tx: ZKData["withdrawalTxData"]): BuiltLeg["zk_proof"] {
  return {
    pA: tx.pA,
    pB: tx.pB,
    pC: tx.pC,
    stateRoot: tx.stateRoot,
    nullifierHashes: tx.nullifierHashes,
    changeCommitment: tx.changeCommitment,
    newCommitment: tx.changeCommitment,
    amount: tx.amount,
  };
}

/**
 * Split the deposit, then build one WITHDRAW proof per slice (matching the single-strategy
 * main-branch flow). Each leg's proof is bound to the executor: the executor withdraws that
 * slice → swaps asset_in→asset_out → re-deposits the output into the asset_out vault as a private
 * note (output_precommitment). Shared by TWAP + Grid; the caller supplies the per-leg encrypted
 * bound via `encryptLeg(legIndex, sliceAmountHuman)`.
 *
 * `submitSplit` must broadcast Entrypoint.split(splitProof), resolve once the slice commitments
 * are on-chain leaves, and persist the slice notes to the local note store keyed
 * `${chainId}-${symbol}-${commitment}` so generateZKData can spend them by note key.
 */
async function buildLegsFromSplit(
  chainId: number,
  inToken: TokenInfo,
  outToken: TokenInfo,
  sliceCount: number,
  encryptLeg: (legIndex: number, sliceAmountHuman: string) => Promise<Pick<BuiltLeg, "encrypted_upper_bound" | "encrypted_lower_bound" | "side" | "eval_mode" | "target_price">>,
  submitSplit: (split: SplitProofData) => Promise<{ txHash: string; sliceNoteKeys: string[] }>,
  armingFeeWei: bigint = 0n,   // Part A: carve this from the deposit as a protocol fee slice
): Promise<MultiLegResult> {
  const scheduleAnchor = Math.floor(Date.now() / 1000);
  const executor = getZkWithdrawRecipient(chainId); // proofs withdraw to the executor wallet
  const signer = getSigner() ?? undefined;

  // Part A — upfront arming fee. The split circuit needs every output's secret, so a protocol-owned
  // fee SLICE is impossible; instead collect the arming fee as a SEPARATE shielded deposit into the
  // fee-vault with a protocol precommitment (deposit() only needs the precommitment, not the secret).
  // Best-effort: if the pool is empty / it reverts, strategy creation continues without the fee.
  let armingPrecommitment: string | undefined;
  let armingCollectedWei = 0n;
  if (armingFeeWei > 0n && signer) {
    try {
      const r = await fetch(`${getTradeExecutorBaseUrl()}/fee-pool/next?chain_id=${chainId}&asset=${inToken.symbol}`);
      const j = await r.json();
      if (j?.precommitment) {
        const net = getNetwork(chainId);
        const asset = inToken.symbol === "ETH" ? NATIVE_TOKEN : inToken.address;
        const ep = new Contract(net.entrypoint, ["function deposit(address,uint256,uint256) payable returns (uint256)"], signer);
        // Explicit gas → skip MetaMask's eth_estimateGas (its Infura RPC rate-limits under load).
        const tx = await ep.deposit(asset, armingFeeWei, BigInt(j.precommitment),
          { gasLimit: 600000n, ...(inToken.symbol === "ETH" ? { value: armingFeeWei } : {}) });
        await tx.wait();
        armingPrecommitment = String(j.precommitment);
        armingCollectedWei = armingFeeWei;
      }
    } catch (e) { console.warn("[Fee] arming-fee deposit skipped:", e); }
  }

  // 1. Split one deposit note into N slice notes (private, on-chain).
  const split = await generateSplitProof(chainId, inToken, sliceCount);
  if ("error" in split) throw new Error(`split proof failed: ${split.error}`);
  const { txHash: splitTxHash, sliceNoteKeys } = await submitSplit(split);
  if (sliceNoteKeys.length < sliceCount) {
    throw new Error(`split produced ${sliceNoteKeys.length} slice notes, need ${sliceCount}`);
  }
  const userSlices = split.slices;

  // 2+3+4. Per slice: withdraw proof (this slice → executor) + output vault note + encrypted trigger.
  const legs: BuiltLeg[] = [];
  for (let i = 0; i < sliceCount; i++) {
    const noteKey = sliceNoteKeys[i];
    const slice = userSlices[i];
    const sliceAmountHuman = ethers.formatUnits(slice.amountWei, inToken.decimals);

    const zk = await generateZKData(chainId, inToken, sliceAmountHuman, executor, undefined, noteKey);
    if ("error" in zk) throw new Error(`leg ${i} withdraw proof failed: ${zk.error}`);

    // One private asset_out note per leg; the executor mints it on re-deposit.
    const out = await createVaultOutputNote(chainId, outToken, signer);

    const bound = await encryptLeg(i, sliceAmountHuman);
    legs.push({
      leg_index: i,
      amount: parseFloat(sliceAmountHuman),
      ...bound,
      output_precommitment: out.precommitment,
      zk_proof: withdrawProofToLegProof(zk.withdrawalTxData),
    });
  }

  return {
    legs, splitTxHash, scheduleAnchor,
    armingFeeWei: armingPrecommitment ? armingCollectedWei.toString() : undefined,
    armingPrecommitment,
  };
}

/**
 * TWAP: N equal slices, each firing at anchor + k*interval (encrypted fire-time, FHE-gated).
 * `clientKeyHex` is the user's FHE client key (used to encrypt each fire-time).
 */
export async function buildTwapLegs(opts: {
  chainId: number;
  inToken: TokenInfo;
  outToken: TokenInfo;
  sliceCount: number;
  intervalSec: number;
  clientKeyHex: string;
  submitSplit: (split: SplitProofData) => Promise<{ txHash: string; sliceNoteKeys: string[] }>;
  armingFeeWei?: bigint;
}): Promise<MultiLegResult> {
  const { chainId, inToken, outToken, sliceCount, intervalSec, clientKeyHex, submitSplit, armingFeeWei = 0n } = opts;
  const anchor = Math.floor(Date.now() / 1000);
  const encryptLeg = async (i: number) => {
    // Encode the fire-time RELATIVE to the schedule anchor (k*interval seconds), so values stay
    // small (e.g. 0, 60, 120). The scheduler compares against elapsed-since-anchor. Absolute unix
    // time (~1.7e9) would exceed the FHE integer width and crashes the comparison.
    const fireOffset = BigInt(i * intervalSec);
    return {
      eval_mode: "time" as const,
      encrypted_lower_bound: await encryptPriceCents(fireOffset, clientKeyHex),
    };
  };
  const res = await buildLegsFromSplit(chainId, inToken, outToken, sliceCount, encryptLeg, submitSplit, armingFeeWei);
  return { ...res, scheduleAnchor: anchor };
}

/**
 * Grid: N rungs across [low, high]; even rungs buy (fire on price ≤ rung), odd rungs sell
 * (fire on price ≥ rung). Each rung gets an encrypted price band keyed by its side.
 */
export async function buildGridLegs(opts: {
  chainId: number;
  inToken: TokenInfo;
  outToken: TokenInfo;
  low: number;
  high: number;
  levels: number;
  clientKeyHex: string;
  submitSplit: (split: SplitProofData) => Promise<{ txHash: string; sliceNoteKeys: string[] }>;
  armingFeeWei?: bigint;
}): Promise<MultiLegResult> {
  const { chainId, inToken, outToken, low, high, levels, clientKeyHex, submitSplit, armingFeeWei = 0n } = opts;
  const rungs = computeRangeGridLegs(low, high, levels);
  const encryptLeg = async (i: number) => {
    const rung = rungs[i];
    const encBound = await encryptPrice(rung.price, clientKeyHex);
    return rung.legType === "LIMIT_BUY"
      ? { eval_mode: "price" as const, side: "LIMIT_BUY" as const, target_price: rung.price, encrypted_lower_bound: encBound }
      : { eval_mode: "price" as const, side: "LIMIT_SELL" as const, target_price: rung.price, encrypted_upper_bound: encBound };
  };
  return buildLegsFromSplit(chainId, inToken, outToken, levels, encryptLeg, submitSplit, armingFeeWei);
}
