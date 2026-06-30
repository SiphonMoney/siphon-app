import { ethers, Contract, Network } from 'ethers';
import crypto from 'crypto';
import { buildPoseidon } from 'circomlibjs';
import { prepareWithdrawalTransactionMulti, prepareSwapTransaction, prepareSplitTransaction } from "./generateProof";
import { getProvider, getSigner } from './nexus';
import { getNetwork, getReadProviderRpcUrl, getSelectedChainId } from './networks';
import entrypointArtifact from './abi/Entrypoint.json';
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';

// --------- Constants ----------
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TREE_DEPTH = 32;

// Per-chain read provider + deploy block come from the network registry so leaf scans always
// hit the SELECTED chain (Eth Sepolia / Base Sepolia) regardless of the wallet's current network.
const vaultDeployBlock = (chainId?: number): number => getNetwork(chainId).deployBlock;
// Initial getLogs window. Shrinks automatically when an RPC rejects the range (free tiers
// cap this — Alchemy free is 10 blocks, others 50/2k/10k). Override per-RPC if needed.
const GETLOGS_CHUNK = parseInt(process.env.NEXT_PUBLIC_GETLOGS_CHUNK || '2000', 10);

/** Retry a provider call with exponential backoff when the RPC rate-limits (HTTP 429). */
async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let delay = 300;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = JSON.stringify(err ?? '') + String((err as Error)?.message ?? '');
      const rateLimited = /429|too many requests|rate.?limit/i.test(msg);
      if (attempt >= tries - 1 || !rateLimited) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 4000);
    }
  }
}

/** Run async `fn` over `items` with bounded concurrency (avoids bursting the RPC). */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Pull `[from, to]` for a suggested block range out of a provider error, if present. */
function suggestedRangeFromError(err: unknown): number | null {
  const m = JSON.stringify(err ?? '').match(/\[0x([0-9a-fA-F]+),\s*0x([0-9a-fA-F]+)\]/);
  if (!m) return null;
  const span = parseInt(m[2], 16) - parseInt(m[1], 16) + 1;
  return span > 0 ? span : null;
}

/**
 * getLogs across a wide block range by walking it in chunks, shrinking the window when the
 * RPC rejects it (honouring the provider's suggested range when given). Works on free tiers
 * that cap eth_getLogs; just slower the smaller the cap.
 */
export async function getLogsChunked(
  provider: ethers.Provider,
  filter: { address: string; topics: (string | null)[] },
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  const out: ethers.Log[] = [];
  let chunk = Math.max(1, GETLOGS_CHUNK);
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + chunk - 1, toBlock);
    try {
      const part = await withRetry(() =>
        provider.getLogs({ ...filter, fromBlock: start, toBlock: end }),
      );
      out.push(...part);
      start = end + 1;
    } catch (err) {
      const suggested = suggestedRangeFromError(err);
      if (suggested && suggested < chunk) { chunk = suggested; continue; }
      if (chunk > 1) { chunk = Math.max(1, Math.floor(chunk / 2)); continue; }
      throw err; // already at 1-block windows and still failing — genuine error
    }
  }
  return out;
}

// Reuse one read provider per chain — avoids ethers spawning retry loops per call.
const readProviderCache = new Map<number, ethers.Provider>();

export function getReadProvider(chainId?: number): ethers.Provider {
  const net = getNetwork(chainId ?? getSelectedChainId());
  const cached = readProviderCache.get(net.chainId);
  if (cached) return cached;

  const rpcUrl = getReadProviderRpcUrl(net.chainId);
  const network = Network.from(net.chainId);
  if (rpcUrl) {
    const provider = new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
    readProviderCache.set(net.chainId, provider);
    return provider;
  }
  const walletProvider = getProvider();
  if (walletProvider) return walletProvider;
  throw new Error(`No RPC configured for chain ${net.chainId}.`);
}

/** Drop cached provider after a chain switch so reads target the new network. */
export function resetReadProvider(chainId?: number): void {
  if (chainId != null) readProviderCache.delete(chainId);
  else readProviderCache.clear();
}

// --------- Types ----------
export interface TokenInfo {
  symbol: string;
  decimals: number;
  address: string;
}

export interface CommitmentData {
  secret: string;
  nullifier: string;
  precommitment: string;
  commitment?: string;
  amount: string;
  nullifierHash?: string;
}

export interface WithdrawalTxData {
  recipient: string;
  amount: string;
  /** Multi-note: all nullifier hashes that were spent. */
  nullifierHashes: string[];
  /** Alias kept for single-note callers. */
  nullifierHash?: string;
  /** Change note commitment inserted into the tree (0 when draining all input value). */
  changeCommitment: string;
  /** Alias kept for single-note callers. */
  newCommitment?: string;
  stateRoot: string;
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  publicSignals?: string[];
  proof?: Record<string, unknown>;
}

export interface ZKData {
  withdrawalTxData: WithdrawalTxData;
  changeValue: bigint;
  newDepositKey: string;
  newDeposit: CommitmentData;
  /** All input notes consumed by this withdrawal. */
  spentDepositKeys: string[];
  spentDeposits: CommitmentData[];
  /** @deprecated use spentDepositKeys[0] */
  spentDepositKey: string | null;
  /** @deprecated use spentDeposits[0] */
  spentDeposit: CommitmentData | null;
  /** Pool precommitment id for the change note — resolve after tx confirms. */
  changePoolId: string | null;
  /**
   * Map from localStorage key → server commitments table id.
   * Used to call markCommitmentSpent() after withdrawal so the server stays in sync.
   * Only populated for notes that were synced from the server.
   */
  serverCommitmentIds: Record<string, string>;
}

// --------- Utilities ----------
export function modField(value: bigint): bigint {
  return value % FIELD_SIZE;
}

export function encodeProof(proof: (string | bigint)[]): string {
  const hexParts = proof.map(p => {
    const bn = (typeof p === 'bigint') ? p : BigInt(p);
    return bn.toString(16).padStart(64, '0');
  });
  return '0x' + hexParts.join('');
}

// --------- Generate Commitment Data (for deposits) ----------
export async function generateCommitmentData(
  _chainId: number,
  _token: TokenInfo,
  _amount: string
): Promise<CommitmentData> {
  console.log("generateCommitmentData() called", { _chainId, _token: _token.symbol, _amount });
  
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Generate secret and nullifier
  const secret = BigInt('0x' + crypto.randomBytes(32).toString('hex'));
  const nullifier = BigInt('0x' + crypto.randomBytes(32).toString('hex'));
  
  // Apply field modulo
  const secretMod = modField(secret);
  const nullifierMod = modField(nullifier);

  // Calculate precommitment: H(nullifier, secret)
  const precommitmentHash = BigInt(F.toObject(poseidon([nullifierMod, secretMod])));
  const precommitment = precommitmentHash;

  // Calculate nullifier hash: H(nullifier)
  const nullifierHash = BigInt(F.toObject(poseidon([nullifierMod])));

  console.log("Precommitment:", precommitment.toString());
  console.log("NullifierHash:", nullifierHash.toString());

  // Note: commitment will be added after deposit transaction
  // Commitment = H(amount, precommitment)
  const commitmentData: CommitmentData = {
    secret: secretMod.toString(),
    nullifier: nullifierMod.toString(),
    precommitment: precommitment.toString(),
    amount: _amount,
    nullifierHash: nullifierHash.toString()
  };

  return commitmentData;
}

// Verbose on-chain logging is off by default (the periodic balance refresh made it spammy).
// Set NEXT_PUBLIC_ZK_DEBUG=1 to re-enable.
const ZK_DEBUG = process.env.NEXT_PUBLIC_ZK_DEBUG === '1';
const zlog = (...args: unknown[]) => { if (ZK_DEBUG) console.log(...args); };

// A token's vault + merkleTree addresses never change — resolve once per chain and cache.
const vaultInfoCache = new Map<string, { vault: Contract; merkleTreeAddress: string }>();
async function resolveVault(
  tokenAddress: string,
  chainId?: number,
): Promise<{ vault: Contract; merkleTreeAddress: string }> {
  const net = getNetwork(chainId ?? getSelectedChainId());
  const cacheKey = `${net.chainId}:${tokenAddress.toLowerCase()}`;
  const hit = vaultInfoCache.get(cacheKey);
  if (hit) return hit;
  const provider = getReadProvider(net.chainId);
  const entrypoint = new Contract(
    net.entrypoint,
    entrypointArtifact.abi as ethers.InterfaceAbi,
    provider,
  );
  const vaultAddress = await entrypoint.getVault(tokenAddress);
  const vault = new Contract(vaultAddress, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
  const merkleTreeAddress = await vault.merkleTree();
  const info = { vault, merkleTreeAddress };
  vaultInfoCache.set(cacheKey, info);
  return info;
}

// --------- Helper: Get on-chain leaves ----------
async function getOnChainLeaves(tokenAddress: string, chainId?: number): Promise<bigint[]> {
  zlog("getOnChainLeaves() tokenAddress:", tokenAddress);
  const net = getNetwork(chainId ?? getSelectedChainId());
  const provider = getReadProvider(net.chainId);
  const { merkleTreeAddress } = await resolveVault(tokenAddress, net.chainId);
  zlog("MerkleTree address:", merkleTreeAddress);

  // LeafInserted(uint256 _index, uint256 _leaf, uint256 _root) — all non-indexed
  // topic[0] = keccak256("LeafInserted(uint256,uint256,uint256)")
  const LEAF_INSERTED_TOPIC = ethers.id("LeafInserted(uint256,uint256,uint256)");
  const latest = await provider.getBlockNumber();
  const rawLogs = await getLogsChunked(
    provider,
    { address: merkleTreeAddress, topics: [LEAF_INSERTED_TOPIC] },
    vaultDeployBlock(net.chainId),
    latest,
  );
  zlog("Fetched LeafInserted raw logs:", rawLogs.length);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const parsed = rawLogs.map(log => {
    const [index, leaf] = abiCoder.decode(['uint256', 'uint256', 'uint256'], log.data);
    return { index: BigInt(index.toString()), leaf: BigInt(leaf.toString()) };
  });

  parsed.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));

  const leaves = parsed.map(p => p.leaf);
  zlog("Parsed leaves count:", leaves.length);

  return leaves;
}

// --------- Resolve a pending "output note" from a vault-mode swap ----------
// When a vault-mode swap strategy is submitted, the browser pre-generates an output note's
// secret/precommitment but the amount + commitment aren't known until the swap actually runs
// (slippage). The executor re-deposits the realized output and emits Deposited(...). We learn
// the final amount + commitment by reading that on-chain event for our precommitment.
// Returns { amount, commitment } (decimal strings) or null if the deposit isn't on-chain yet.
export async function resolveOutputNote(
  tokenAddress: string,
  precommitment: string,
  chainId?: number,
): Promise<{ amount: string; commitment: string } | null> {
  const net = getNetwork(chainId ?? getSelectedChainId());
  const provider = getReadProvider(net.chainId);
  const { vault } = await resolveVault(tokenAddress, net.chainId);
  const vaultAddress = vault.target as string;

  // Deposited(address indexed depositor, uint256 amount, uint256 commitment, uint256 precommitment)
  const DEPOSITED_TOPIC = ethers.id("Deposited(address,uint256,uint256,uint256)");
  const latest = await provider.getBlockNumber();
  const logs = await getLogsChunked(
    provider,
    { address: vaultAddress, topics: [DEPOSITED_TOPIC] },
    vaultDeployBlock(net.chainId),
    latest,
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const target = BigInt(precommitment).toString();
  for (const log of logs) {
    const [amount, commitment, pre] = abiCoder.decode(['uint256', 'uint256', 'uint256'], log.data);
    if (BigInt(pre.toString()).toString() === target) {
      return {
        amount: BigInt(amount.toString()).toString(),
        commitment: BigInt(commitment.toString()).toString(),
      };
    }
  }
  return null;
}

// --------- True (on-chain-reconciled) vault balance ----------
// The naive balance sums every localStorage note, which over-counts: strategy "change" notes
// are saved as spendable before the withdrawal that creates them confirms, so an un-executed
// strategy leaves a phantom note. The real spendable balance only counts a note when:
//   1) its commitment is an actual on-chain leaf (the deposit/change really happened), AND
//   2) its nullifier hasn't been spent on-chain (it hasn't already been withdrawn).

interface TokenMeta { address: string; decimals: number; symbol: string }
export interface SpendableBalance { totalBalance: number; details: Record<string, number> }

// Cache the leaf scan — expensive (many eth_getLogs). Refresh infrequently.
const leavesCache = new Map<string, { leaves: Set<string>; ts: number }>();
const leavesInflight = new Map<string, Promise<Set<string>>>();
const LEAVES_TTL_MS = 600_000; // 10 min

export function invalidateLeafCache(tokenAddress?: string) {
  if (tokenAddress) {
    const cacheKey = `${getNetwork().chainId}:${tokenAddress.toLowerCase()}`;
    leavesCache.delete(cacheKey);
    leavesInflight.delete(cacheKey);
  } else {
    leavesCache.clear();
    leavesInflight.clear();
  }
}

export async function getLeafSet(tokenAddress: string, chainId?: number): Promise<Set<string>> {
  const net = getNetwork(chainId ?? getSelectedChainId());
  const cacheKey = `${net.chainId}:${tokenAddress.toLowerCase()}`;
  const hit = leavesCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < LEAVES_TTL_MS) return hit.leaves;

  const pending = leavesInflight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const raw = await getOnChainLeaves(tokenAddress, net.chainId);
    const set = new Set(raw.map((l) => l.toString()));
    leavesCache.set(cacheKey, { leaves: set, ts: Date.now() });
    return set;
  })();

  leavesInflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    leavesInflight.delete(cacheKey);
  }
}

export async function getSpendableVaultBalance(
  chainId: number,
  tokenMap: Record<string, TokenMeta>,
): Promise<SpendableBalance> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Collect candidate notes using plaintext metadata only — no decryption needed for balance.
  const { scanNoteMeta } = await import('./localNoteStore');
  const notesByToken: Record<string, Array<{ commitment?: string; nullifierHash?: string; amount: string }>> = {};
  for (const meta of scanNoteMeta(`${chainId}-`)) {
    if (meta.spent === true || meta.spent === 'true') continue;
    const parts = meta.key.split('-');
    if (parts.length < 3) continue;
    const sym = parts[1].toUpperCase();
    (notesByToken[sym] ||= []).push({
      commitment:    meta.commitment,
      nullifierHash: meta.nullifierHash,
      amount:        meta.amount,
    });
  }

  const details: Record<string, number> = {};
  let totalBalance = 0;

  for (const [sym, notes] of Object.entries(notesByToken)) {
    const tok = tokenMap[sym];
    if (!tok) continue;
    const tokenAddress = sym === 'ETH' ? NATIVE_TOKEN : tok.address;

    let leaves: Set<string>;
    let vault: Contract;
    try {
      ({ vault } = await resolveVault(tokenAddress)); // cached address resolution
      leaves = await getLeafSet(tokenAddress);        // cached leaf scan (3 min)
    } catch (e) {
      console.warn(`[balance] reconcile failed for ${sym}:`, e);
      continue;
    }

    const counted = new Set<string>();
    for (const n of notes) {
      if (!n.commitment || !leaves.has(n.commitment)) continue; // phantom / not on-chain
      if (counted.has(n.commitment)) continue;                   // dedupe stale duplicate keys
      if (n.nullifierHash) {
        try {
          if (await vault.nullifiers(BigInt(n.nullifierHash))) {
            // Nullifier is spent on-chain — mark it spent without touching encrypted fields.
            const { markNoteSpent } = await import('./localNoteStore');
            markNoteSpent(`${chainId}-${sym}-${n.commitment}`);
            continue; // already withdrawn
          }
        } catch { /* if the check fails, fall through and count it */ }
      }
      const amt = parseFloat(n.amount);
      if (!Number.isFinite(amt)) continue;
      counted.add(n.commitment);
      totalBalance += amt;
      details[sym] = (details[sym] || 0) + amt;
    }
  }

  return { totalBalance, details };
}

/** Sum unspent note amounts in localStorage for a chain (may include not-yet-indexed deposits). */
export function getLocalVaultNoteTotals(chainId: number): Record<string, number> {
  const details: Record<string, number> = {};
  if (typeof window === "undefined") return details;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(`${chainId}-`)) continue;
    const parts = key.split("-");
    if (parts.length < 3) continue;
    const sym = parts[1].toUpperCase();
    try {
      const d = JSON.parse(localStorage.getItem(key) || "{}");
      if (!d?.amount || d.spent === true || d.spent === "true") continue;
      const amt = parseFloat(String(d.amount));
      if (!Number.isFinite(amt)) continue;
      details[sym] = (details[sym] || 0) + amt;
    } catch {
      /* skip */
    }
  }
  return details;
}

// --------- Generate ZK Data (for withdrawals) ----------
export interface SwapBinding {
  pool: string;
  dstToken: string;
  fee: number | bigint;
  minAmountOut: bigint | string;
}

const MAX_NOTES = 6;

/** Build a 32-level Merkle authentication path for `leafIndex` from the full ordered leaf set. */
function buildMerklePath(
  leaves: bigint[],
  leafIndex: number,
  zeros: bigint[],
  poseidonHash: (a: bigint, b: bigint) => bigint,
): { pathElements: bigint[]; pathIndices: number[] } {
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let levelNodes: bigint[] = leaves.slice();
  let idx = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = idx % 2;
    pathIndices.push(isRight);
    const siblingIdx = isRight === 1 ? idx - 1 : idx + 1;
    pathElements.push(siblingIdx < levelNodes.length ? levelNodes[siblingIdx] : zeros[level]);
    const next: bigint[] = [];
    for (let i = 0; i < levelNodes.length; i += 2) {
      const left = levelNodes[i];
      const right = i + 1 < levelNodes.length ? levelNodes[i + 1] : zeros[level];
      next.push(poseidonHash(left, right));
    }
    levelNodes = next;
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices };
}

export interface SwapProofData {
  amountIn: string;        // wei routed into the swap
  stateRoot: string;
  nullifier: string;       // nullifierHash — on-chain spent key for the input note
  newCommitment: string;   // change note inserted into the tree
  recipient: string;       // swap-output recipient (bound to proof)
  pool: string;
  dstToken: string;
  fee: number;
  minAmountOut: string;
  srcToken: string;        // input asset (NATIVE sentinel or ERC20)
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  spentNoteKey: string;    // localStorage key of the note being spent
  // change note secrets so the caller can persist/track the remainder
  change: { nullifier: string; secret: string; precommitment: string; commitment: string; amountWei: string };
}

/**
 * Build an atomic-swap proof for ONE note → Vault.swap. The reusable core for limit / TWAP /
 * grid slices: spends a single note (specific `_noteKey`, or the smallest note ≥ amountIn),
 * routes `_amountIn` through the swap bound to recipient/pool/dstToken/fee/minOut, and mints a
 * change note for the remainder. The executor later submits the returned struct via
 * Entrypoint.swap — it never custodies funds and never sees the note secrets.
 */
export async function generateSwapProof(
  _chainId: number,
  _inToken: TokenInfo,
  _amountIn: string,
  _recipient: string,
  _swap: SwapBinding,
  _noteKey?: string,
): Promise<SwapProofData | { error: string }> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const pHash = (a: bigint, b: bigint): bigint => BigInt(F.toObject(poseidon([a, b])));
  const pHash1 = (a: bigint): bigint => BigInt(F.toObject(poseidon([a])));

  const tokenAddress = _inToken.symbol === 'ETH' ? NATIVE_TOKEN : _inToken.address;
  const amountInWei = BigInt(ethers.parseUnits(_amountIn, _inToken.decimals).toString());
  if (amountInWei <= 0n) return { error: "Swap amountIn must be > 0." };

  const signer = getSigner();
  if (!signer) return { error: "Wallet not connected." };

  // 1. on-chain leaves + root
  let leaves: bigint[];
  try {
    leaves = [...await getLeafSet(tokenAddress, _chainId)].map(s => BigInt(s));
  } catch {
    return { error: "Failed to fetch on-chain leaves for swap proof." };
  }
  const { vault, merkleTreeAddress } = await resolveVault(tokenAddress, _chainId);
  const provider = getReadProvider(_chainId);
  const merkleTreeContract = new Contract(merkleTreeAddress, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider);
  const onChainRoot = BigInt((await merkleTreeContract.getRoot()).toString());

  // depth-32 Poseidon zeros (matches MerkleTree.sol)
  const zeros: bigint[] = [0n];
  for (let i = 1; i < TREE_DEPTH; i++) zeros[i] = pHash(zeros[i - 1], zeros[i - 1]);

  // 2. select the note to spend (specific key, or smallest unspent note ≥ amountIn)
  const { scanNoteMeta, readNote, markNoteSpent } = await import('./localNoteStore');
  const metas = scanNoteMeta(`${_chainId}-${_inToken.symbol}-`);
  let chosen: { key: string; data: CommitmentData; amountWei: bigint; leafIndex: number } | null = null;
  for (const meta of metas) {
    if (_noteKey && meta.key !== _noteKey) continue;
    if (!meta.commitment || !meta.amount) continue;
    if (meta.spent === true || meta.spent === 'true') continue;
    const data = await readNote(meta.key, signer);
    if (!data || !data.nullifier || !data.commitment) continue;
    const amountWei = BigInt(ethers.parseUnits(data.amount.toString(), _inToken.decimals).toString());
    if (amountWei < amountInWei) continue;
    const leafIndex = leaves.findIndex(l => l === BigInt(data.commitment));
    if (leafIndex === -1) continue;
    if (await vault.nullifiers(pHash1(BigInt(data.nullifier)))) { markNoteSpent(meta.key); continue; }
    if (_noteKey || !chosen || amountWei < chosen.amountWei) {
      chosen = { key: meta.key, data: { ...data, precommitment: data.precommitment ?? '' }, amountWei, leafIndex };
      if (_noteKey) break;
    }
  }
  if (!chosen) return { error: `No spendable ${_inToken.symbol} note ≥ ${_amountIn} found.` };

  // 3. change note (remainder = inValue - amountIn; 0 for a full-slice spend)
  const changeValue = chosen.amountWei - amountInWei;
  const change = await generateCommitmentData(_chainId, _inToken, ethers.formatUnits(changeValue, _inToken.decimals));

  // 4. build the swap witness (signal names match swap.circom)
  const { pathElements, pathIndices } = buildMerklePath(leaves, chosen.leafIndex, zeros, pHash);
  const nullifierHash = pHash1(BigInt(chosen.data.nullifier));
  const changeCommitment = pHash(changeValue, BigInt(change.precommitment));

  const circuitInput = {
    amountIn:      amountInWei.toString(),
    stateRoot:     onChainRoot.toString(),
    newCommitment: changeCommitment.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient:     BigInt(_recipient).toString(),
    pool:          BigInt(_swap.pool).toString(),
    dstToken:      BigInt(_swap.dstToken).toString(),
    fee:           BigInt(_swap.fee).toString(),
    minAmountOut:  BigInt(_swap.minAmountOut).toString(),
    inValue:       chosen.amountWei.toString(),
    inNullifier:   chosen.data.nullifier.toString(),
    inSecret:      chosen.data.secret.toString(),
    pathElements:  pathElements.map(v => v.toString()),
    pathIndices:   pathIndices.map(String),
    changeNullifier: change.nullifier.toString(),
    changeSecret:    change.secret.toString(),
  };

  const { proof, publicSignals } = await prepareSwapTransaction(circuitInput);
  // publicSignals: [amountIn, stateRoot, newCommitment, nullifierHash, recipient, pool, dstToken, fee, minOut]
  const newCommitmentOnChain = publicSignals[2];

  return {
    amountIn:      amountInWei.toString(),
    stateRoot:     onChainRoot.toString(),
    nullifier:     nullifierHash.toString(),
    newCommitment: newCommitmentOnChain,
    recipient:     _recipient,
    pool:          _swap.pool,
    dstToken:      _swap.dstToken,
    fee:           Number(_swap.fee),
    minAmountOut:  BigInt(_swap.minAmountOut).toString(),
    srcToken:      tokenAddress,
    pA: proof.pA as [string, string],
    pB: proof.pB as [[string, string], [string, string]],
    pC: proof.pC as [string, string],
    spentNoteKey:  chosen.key,
    change: {
      nullifier:     change.nullifier,
      secret:        change.secret,
      precommitment: change.precommitment,
      commitment:    newCommitmentOnChain,
      amountWei:     changeValue.toString(),
    },
  };
}

const SPLIT_N = 8;

export interface SplitSliceNote {
  nullifier: string; secret: string; precommitment: string; commitment: string; amountWei: string;
}
export interface SplitProofData {
  stateRoot: string;
  nullifierHash: string;       // input note spent on-chain
  outCommitments: string[];    // all 8 (on-chain insert order)
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  spentNoteKey: string;        // localStorage key of the note being split
  slices: SplitSliceNote[];    // the real (non-zero) slice notes to persist + swap later
}

/**
 * Split ONE note into `_sliceCount` equal slice-notes (+ zero-pad to 8) for a TWAP/grid.
 * One private tx (Entrypoint.split) — hides the slice amounts and count (always 8 commitments),
 * removing the deposit-side fingerprint of N separate deposits. The returned `slices` are the
 * independent notes each future swap proof will spend.
 */
export async function generateSplitProof(
  _chainId: number,
  _token: TokenInfo,
  _sliceCount: number,
  _noteKey?: string,
  // Part A arming fee: carve slice[0] as a PROTOCOL-owned note (precommitment from the fee pool).
  // Only the precommitment is needed (the split circuit commits Poseidon(value, precommitment));
  // the protocol holds the secret. User slices then split (V - armingFee).
  _feeSlice?: { amountWei: bigint; precommitment: string },
): Promise<SplitProofData | { error: string }> {
  const maxUser = _feeSlice ? SPLIT_N - 1 : SPLIT_N;
  if (_sliceCount < 1 || _sliceCount > maxUser) return { error: `sliceCount must be 1..${maxUser}` };

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const pHash = (a: bigint, b: bigint): bigint => BigInt(F.toObject(poseidon([a, b])));
  const pHash1 = (a: bigint): bigint => BigInt(F.toObject(poseidon([a])));

  const tokenAddress = _token.symbol === 'ETH' ? NATIVE_TOKEN : _token.address;
  const signer = getSigner();
  if (!signer) return { error: "Wallet not connected." };

  // 1. on-chain leaves + root
  let leaves: bigint[];
  try {
    leaves = [...await getLeafSet(tokenAddress, _chainId)].map(s => BigInt(s));
  } catch {
    return { error: "Failed to fetch on-chain leaves for split." };
  }
  const { vault, merkleTreeAddress } = await resolveVault(tokenAddress, _chainId);
  const provider = getReadProvider(_chainId);
  const merkleTreeContract = new Contract(merkleTreeAddress, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider);
  const onChainRoot = BigInt((await merkleTreeContract.getRoot()).toString());
  const zeros: bigint[] = [0n];
  for (let i = 1; i < TREE_DEPTH; i++) zeros[i] = pHash(zeros[i - 1], zeros[i - 1]);

  // 2. select the note to split (specific key, or largest unspent note)
  const { scanNoteMeta, readNote, markNoteSpent } = await import('./localNoteStore');
  const metas = scanNoteMeta(`${_chainId}-${_token.symbol}-`);
  let chosen: { key: string; data: CommitmentData; amountWei: bigint; leafIndex: number } | null = null;
  for (const meta of metas) {
    if (_noteKey && meta.key !== _noteKey) continue;
    if (!meta.commitment || !meta.amount) continue;
    if (meta.spent === true || meta.spent === 'true') continue;
    const data = await readNote(meta.key, signer);
    if (!data || !data.nullifier || !data.commitment) continue;
    const amountWei = BigInt(ethers.parseUnits(data.amount.toString(), _token.decimals).toString());
    if (amountWei <= 0n) continue;
    const leafIndex = leaves.findIndex(l => l === BigInt(data.commitment));
    if (leafIndex === -1) continue;
    if (await vault.nullifiers(pHash1(BigInt(data.nullifier)))) { markNoteSpent(meta.key); continue; }
    if (_noteKey || !chosen || amountWei > chosen.amountWei) {
      chosen = { key: meta.key, data: { ...data, precommitment: data.precommitment ?? '' }, amountWei, leafIndex };
      if (_noteKey) break;
    }
  }
  if (!chosen) return { error: `No spendable ${_token.symbol} note found to split.` };

  // 3. slice amounts. With a fee slice: slice[0] = armingFee (protocol), user slices split the rest.
  const V = chosen.amountWei;
  const armingFee = _feeSlice ? _feeSlice.amountWei : 0n;
  if (armingFee >= V) return { error: "Arming fee exceeds deposit." };
  const userV = V - armingFee;
  const base = userV / BigInt(_sliceCount);

  // 4. build 8 output notes (fee slice + user slices + zero pad)
  const outValue: bigint[] = [];
  const outNote: SplitSliceNote[] = [];
  for (let i = 0; i < SPLIT_N; i++) {
    if (_feeSlice && i === 0) {
      // Protocol-owned arming-fee slice — precommitment only (no nullifier/secret on this device).
      outValue.push(armingFee);
      outNote.push({
        nullifier: "", secret: "", precommitment: _feeSlice.precommitment,
        commitment: pHash(armingFee, BigInt(_feeSlice.precommitment)).toString(),
        amountWei: armingFee.toString(),
      });
      continue;
    }
    const u = _feeSlice ? i - 1 : i;   // user-slice index (shifted past the fee slice)
    const v = u >= _sliceCount ? 0n : (u < _sliceCount - 1 ? base : userV - base * BigInt(_sliceCount - 1));
    const cd = await generateCommitmentData(_chainId, _token, ethers.formatUnits(v, _token.decimals));
    outValue.push(v);
    outNote.push({
      nullifier: cd.nullifier, secret: cd.secret, precommitment: cd.precommitment,
      commitment: pHash(v, BigInt(cd.precommitment)).toString(), amountWei: v.toString(),
    });
  }

  // 5. witness
  const { pathElements, pathIndices } = buildMerklePath(leaves, chosen.leafIndex, zeros, pHash);
  const nullifierHash = pHash1(BigInt(chosen.data.nullifier));
  const circuitInput = {
    stateRoot:     onChainRoot.toString(),
    nullifierHash: nullifierHash.toString(),
    outCommitment: outNote.map(o => o.commitment),
    inValue:       V.toString(),
    inNullifier:   chosen.data.nullifier.toString(),
    inSecret:      chosen.data.secret.toString(),
    pathElements:  pathElements.map(v => v.toString()),
    pathIndices:   pathIndices.map(String),
    outValue:      outValue.map(v => v.toString()),
    outNullifier:  outNote.map(o => o.nullifier),
    outSecret:     outNote.map(o => o.secret),
  };

  const { proof, publicSignals } = await prepareSplitTransaction(circuitInput);
  // publicSignals: [stateRoot, nullifierHash, outCommitment[0..7]]
  const outCommitments = publicSignals.slice(2, 2 + SPLIT_N);

  return {
    stateRoot:     onChainRoot.toString(),
    nullifierHash: nullifierHash.toString(),
    outCommitments,
    pA: proof.pA as [string, string],
    pB: proof.pB as [[string, string], [string, string]],
    pC: proof.pC as [string, string],
    spentNoteKey:  chosen.key,
    slices:        outNote.slice(0, _sliceCount),
  };
}

export async function generateZKData(
  _chainId: number,
  _token: TokenInfo,
  _amount: string,
  _recipient: string,
  _swap?: SwapBinding,
  _noteKey?: string,   // restrict spend to ONE specific note (TWAP/grid slice)
): Promise<ZKData | { error: string }> {
  console.log("generateZKData() called", { _chainId, _token: _token.symbol, _amount, _recipient, _swap });

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const poseidonHash = (a: bigint, b: bigint): bigint => BigInt(F.toObject(poseidon([a, b])));

  // 1. FETCH LEAVES
  const tokenAddress = _token.symbol === 'ETH' ? NATIVE_TOKEN : _token.address;
  let leaves: bigint[] = [];
  try {
    const leafSet = await getLeafSet(tokenAddress, _chainId);
    leaves = [...leafSet].map((s) => BigInt(s));
    console.log("Found leaves count:", leaves.length);
  } catch (err) {
    console.error("Failed to fetch on-chain leaves:", err);
    return { error: "Failed to connect to blockchain to verify deposits." };
  }

  // 2. Sync server commitments into localStorage.
  // Also build serverCommitmentIds map (localStorage key → server row id) so the
  // withdrawal path can call markCommitmentSpent() for each spent input note.
  const signer = getSigner();
  const serverCommitmentIds: Record<string, string> = {};
  if (signer) {
    try {
      const { fetchCommitments } = await import('./commitmentStore');
      const { writeNote } = await import('./localNoteStore');
      const serverComms = await fetchCommitments(signer);
      for (const c of serverComms) {
        const key = `${c.decrypted.chainId}-${c.asset}-${c.decrypted.commitment}`;
        // Track server id for every unspent note so we can mark it spent after withdrawal.
        if (c.spent === 'false') {
          serverCommitmentIds[key] = c.id;
          // Write from server if: (a) key is absent, OR (b) key exists but is a metadata-only
          // entry (no nullifier_enc) — vault-mode output notes are stored as metadata-only until
          // resolvePendingOutputNotes runs, but generateZKData's old guard skipped them because
          // the key existed. Check for nullifier_enc to detect the unencrypted stub.
          const existing = localStorage.getItem(key);
          const needsWrite = !existing || (() => {
            try { return !JSON.parse(existing).nullifier_enc; } catch { return true; }
          })();
          if (needsWrite) {
            await writeNote(key, {
              nullifier:     c.decrypted.nullifier,
              secret:        c.decrypted.secret,
              commitment:    c.decrypted.commitment,
              amount:        c.decrypted.amount,
              nullifierHash: c.decrypted.nullifierHash ?? '',
              precommitment: c.decrypted.precommitment ?? '',
              spent:         false,
            }, signer);
          }
        }
      }
    } catch (e) {
      console.warn('Server commitment fetch failed, using localStorage only', e);
    }
  }

  // 3. FETCH ON-CHAIN ROOT
  const provider = getReadProvider(_chainId);
  const entrypoint = new Contract(
    getNetwork(_chainId).entrypoint,
    entrypointArtifact.abi as ethers.InterfaceAbi,
    provider,
  );
  const vaultAddr = await entrypoint.getVault(tokenAddress);
  const vaultContract = new Contract(vaultAddr, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
  const merkleTreeAddr = await vaultContract.merkleTree();
  const merkleTreeContract = new Contract(merkleTreeAddr, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider);
  const onChainRoot = BigInt((await withRetry(() => merkleTreeContract.getRoot())).toString());
  console.log("✅ On-chain root:", onChainRoot.toString());

  // Pre-computed Poseidon zeros for depth 32
  const zeros: bigint[] = [
    0n,
    14744269619966411208579211824598458697587494354926760081771325075741142829156n,
    7423237065226347324353380772367382631490014989348495481811164164159255474657n,
    11286972368698509976183087595462810875513684078608517520839298933882497716792n,
    3607627140608796879659380071776844901612302623152076817094415224584923813162n,
    19712377064642672829441595136074946683621277828620209496774504837737984048981n,
    20775607673010627194014556968476266066927294572720319469184847051418138353016n,
    3396914609616007258851405644437304192397291162432396347162513310381425243293n,
    21551820661461729022865262380882070649935529853313286572328683688269863701601n,
    6573136701248752079028194407151022595060682063033565181951145966236778420039n,
    12413880268183407374852357075976609371175688755676981206018884971008854919922n,
    14271763308400718165336499097156975241954733520325982997864342600795471836726n,
    20066985985293572387227381049700832219069292839614107140851619262827735677018n,
    9394776414966240069580838672673694685292165040808226440647796406499139370960n,
    11331146992410411304059858900317123658895005918277453009197229807340014528524n,
    15819538789928229930262697811477882737253464456578333862691129291651619515538n,
    19217088683336594659449020493828377907203207941212636669271704950158751593251n,
    21035245323335827719745544373081896983162834604456827698288649288827293579666n,
    6939770416153240137322503476966641397417391950902474480970945462551409848591n,
    10941962436777715901943463195175331263348098796018438960955633645115732864202n,
    15019797232609675441998260052101280400536945603062888308240081994073687793470n,
    11702828337982203149177882813338547876343922920234831094975924378932809409969n,
    11217067736778784455593535811108456786943573747466706329920902520905755780395n,
    16072238744996205792852194127671441602062027943016727953216607508365787157389n,
    17681057402012993898104192736393849603097507831571622013521167331642182653248n,
    21694045479371014653083846597424257852691458318143380497809004364947786214945n,
    8163447297445169709687354538480474434591144168767135863541048304198280615192n,
    14081762237856300239452543304351251708585712948734528663957353575674639038357n,
    16619959921569409661790279042024627172199214148318086837362003702249041851090n,
    7022159125197495734384997711896547675021391130223237843255817587255104160365n,
    4114686047564160449611603615418567457008101555090703535405891656262658644463n,
    12549363297364877722388257367377629555213421373705596078299904496781819142130n,
  ];

  // 4. GREEDY MULTI-NOTE SELECTION
  // Collect all unspent, on-chain-confirmed notes, greedy-fill from largest to smallest.
  const withdrawnValueTotal = BigInt(ethers.parseUnits(_amount, _token.decimals).toString());

  const { vault: vaultForNullifier } = await resolveVault(tokenAddress, _chainId);
  const { scanNoteMeta, readNote, markNoteSpent } = await import('./localNoteStore');
  const _zkSigner = getSigner();
  const noteMetas = scanNoteMeta(`${_chainId}-${_token.symbol}-`);

  interface CandidateNote {
    key: string;
    data: CommitmentData;
    amountWei: bigint;
    leafIndex: number;
  }
  const candidates: CandidateNote[] = [];

  for (const meta of noteMetas) {
    const key = meta.key;
    // TWAP/grid: spend exactly the named slice note, not a greedy mix of others.
    if (_noteKey && key !== _noteKey) continue;
    if (!meta.commitment || !meta.amount) continue;
    if (meta.spent === true || meta.spent === 'true') continue;

    const data = _zkSigner ? await readNote(key, _zkSigner) : null;
    if (!data) continue;

    try {
      const amountWei = BigInt(ethers.parseUnits(data.amount.toString(), _token.decimals).toString());
      if (amountWei === 0n) continue;

      // Nullifier spent check
      if (data.nullifier) {
        const nullifierHash = F.toString(poseidon([BigInt(data.nullifier)]));
        const isSpent = await vaultForNullifier.nullifiers(BigInt(nullifierHash));
        if (isSpent) {
          markNoteSpent(key);
          continue;
        }
      }

      // On-chain commitment check
      const commitment = BigInt(data.commitment);
      const foundIndex = leaves.findIndex(leaf => leaf === commitment);
      if (foundIndex === -1) {
        console.warn("⚠️ Ghost Deposit (not on-chain):", key);
        continue;
      }

      candidates.push({ key, data: { ...data, precommitment: data.precommitment ?? '' }, amountWei, leafIndex: foundIndex });
    } catch (e) {
      console.warn("Failed to process note", key, e);
    }
  }

  // Sort descending by amount — greedy fill
  candidates.sort((a, b) => (a.amountWei > b.amountWei ? -1 : a.amountWei < b.amountWei ? 1 : 0));

  const selectedNotes: CandidateNote[] = [];
  let accumulated = 0n;
  for (const c of candidates) {
    if (accumulated >= withdrawnValueTotal) break;
    if (selectedNotes.length >= MAX_NOTES) break;
    selectedNotes.push(c);
    accumulated += c.amountWei;
  }

  if (accumulated < withdrawnValueTotal) {
    return { error: `Insufficient balance. Have ${ethers.formatUnits(accumulated, _token.decimals)}, need ${_amount}.` };
  }

  const N = selectedNotes.length;
  console.log(`Selected ${N} note(s) totaling ${ethers.formatUnits(accumulated, _token.decimals)} ${_token.symbol}`);

  // 5. CLAIM CHANGE NOTE SECRETS FROM POOL
  // Secrets are claimed from the pre-generated pool in DB so they survive a tab-close
  // between proof generation and tx confirmation. Falls back to deterministic derivation
  // if no signer is available (shouldn't happen in practice).
  let changeNullifier: bigint, changeSecret: bigint, changePrecommitment: bigint;
  let changePoolId: string | null = null;
  if (signer) {
    try {
      const { claimFromPool } = await import('./sparePool');
      const claimed = await claimFromPool(signer);
      changeNullifier     = BigInt(claimed.nullifier);
      changeSecret        = BigInt(claimed.secret);
      changePrecommitment = BigInt(claimed.precommitment);
      changePoolId        = claimed.id;
    } catch (poolErr) {
      console.warn('[generateZKData] pool claim failed, using deterministic fallback:', poolErr);
      const nullifierXor  = selectedNotes.reduce((acc, n) => acc ^ BigInt(n.data.nullifier), 0n);
      changeNullifier     = BigInt(F.toObject(poseidon([nullifierXor, 1n])));
      changeSecret        = BigInt(F.toObject(poseidon([nullifierXor, 2n])));
      changePrecommitment = BigInt(F.toObject(poseidon([changeNullifier, changeSecret])));
      // changePoolId stays null — no pool entry to resolve
    }
  } else {
    const nullifierXor  = selectedNotes.reduce((acc, n) => acc ^ BigInt(n.data.nullifier), 0n);
    changeNullifier     = BigInt(F.toObject(poseidon([nullifierXor, 1n])));
    changeSecret        = BigInt(F.toObject(poseidon([nullifierXor, 2n])));
    changePrecommitment = BigInt(F.toObject(poseidon([changeNullifier, changeSecret])));
  }
  const changeValue = accumulated - withdrawnValueTotal;
  // Circuit always computes Poseidon(changeValue, changePrecommitment) with no zero short-circuit.
  // Must pass the real hash even when changeValue === 0.
  const changeCommitmentBig = BigInt(F.toObject(poseidon([changeValue, changePrecommitment])));

  // 6. BUILD MERKLE PATHS FOR EACH INPUT NOTE
  const pathElementsAll: bigint[][] = [];
  const pathIndicesAll: number[][] = [];
  for (const note of selectedNotes) {
    const { pathElements, pathIndices } = buildMerklePath(leaves, note.leafIndex, zeros, poseidonHash);
    const computedRoot = (() => {
      let levelNodes = leaves.slice();
      let idx = note.leafIndex;
      for (let level = 0; level < TREE_DEPTH; level++) {
        const next: bigint[] = [];
        for (let i = 0; i < levelNodes.length; i += 2) {
          next.push(poseidonHash(levelNodes[i], i + 1 < levelNodes.length ? levelNodes[i + 1] : zeros[level]));
        }
        levelNodes = next; idx = Math.floor(idx / 2);
      }
      return levelNodes[0];
    })();
    if (computedRoot !== onChainRoot) {
      console.warn(`[Proof] ⚠️ computed root for note[${note.leafIndex}] != on-chain root`);
    }
    pathElementsAll.push(pathElements);
    pathIndicesAll.push(pathIndices);
  }

  // 7. ASSEMBLE CIRCUIT INPUT AND GENERATE PROOF
  // Circuit signals (per withdrawal.circom Withdrawal(32, N)):
  //   Public:  withdrawnValue, stateRoot, changeCommitment, nullifierHash[N], recipient
  //   Private: inValue[N], inNullifier[N], inSecret[N], pathElements[N][32], pathIndices[N][32],
  //            changeNullifier, changeSecret
  // changeValue is computed internally by the circuit (inSum[N] - withdrawnValue) — do NOT pass it.
  const nullifierHashesInput = selectedNotes.map(n =>
    BigInt(F.toObject(poseidon([BigInt(n.data.nullifier)]))).toString()
  );

  const circuitInput: Record<string, unknown> = {
    withdrawnValue:   withdrawnValueTotal.toString(),
    stateRoot:        onChainRoot.toString(),
    changeCommitment: changeCommitmentBig.toString(),
    nullifierHash:    nullifierHashesInput,
    recipient:        BigInt(_recipient).toString(),
    changeNullifier:  changeNullifier.toString(),
    changeSecret:     changeSecret.toString(),
    inValue:          selectedNotes.map(n => n.amountWei.toString()),
    inNullifier:      selectedNotes.map(n => n.data.nullifier.toString()),
    inSecret:         selectedNotes.map(n => n.data.secret.toString()),
    pathElements:    pathElementsAll.map(pe => pe.map(v => v.toString())),
    pathIndices:     pathIndicesAll.map(pi => pi.map(String)),
  };

  console.log("[Proof] Generating Groth16 W" + N + " proof locally (snarkjs)…");
  const result = await prepareWithdrawalTransactionMulti(circuitInput, N);
  const { proof: rawProof, publicSignals } = result;

  // publicSignals order: [withdrawnValue, stateRoot, changeCommitment, nullifierHash[0..N-1], recipient]
  // Use the circuit's authoritative changeCommitment output (publicSignals[2]) as the stored
  // key and on-chain value — NOT the locally-computed Poseidon. They should agree if JS and
  // circom Poseidon are identical, but the circuit output is the ground truth.
  const changeCommitmentOnChain = BigInt(publicSignals[2]);
  const nullifierHashes: string[] = selectedNotes.map((_, i) => publicSignals[3 + i]);

  const withdrawalTxData: WithdrawalTxData = {
    recipient:        _recipient,
    amount:           withdrawnValueTotal.toString(),
    nullifierHashes,
    nullifierHash:    nullifierHashes[0],
    changeCommitment: changeCommitmentOnChain.toString(),
    newCommitment:    changeCommitmentOnChain.toString(),
    stateRoot:        onChainRoot.toString(),
    pA:               rawProof.pA as [string, string],
    pB:               rawProof.pB as [[string, string], [string, string]],
    pC:               rawProof.pC as [string, string],
    publicSignals,
  };

  // 8. VALIDATE PROOF FORMAT
  if (!Array.isArray(withdrawalTxData.pA) || withdrawalTxData.pA.length !== 2 ||
      !Array.isArray(withdrawalTxData.pB) || withdrawalTxData.pB.length !== 2 ||
      !Array.isArray(withdrawalTxData.pC) || withdrawalTxData.pC.length !== 2) {
    return { error: "Proof has invalid Groth16 format" };
  }

  // 9. PACKAGE ZK DATA
  // Compute change note nullifier hash for on-chain spent check during balance reconciliation.
  const changeNullifierHash = BigInt(F.toObject(poseidon([changeNullifier]))).toString();

  const zkData: ZKData = {
    withdrawalTxData,
    changeValue,
    newDepositKey: `${_chainId}-${_token.symbol}-${changeCommitmentOnChain.toString()}`,
    newDeposit: {
      secret:        changeSecret.toString(),
      nullifier:     changeNullifier.toString(),
      precommitment: changePrecommitment.toString(),
      commitment:    changeCommitmentOnChain.toString(),
      nullifierHash: changeNullifierHash,
      amount:        ethers.formatUnits(changeValue, _token.decimals),
    },
    spentDepositKeys: selectedNotes.map(n => n.key),
    spentDeposits:    selectedNotes.map(n => n.data),
    spentDepositKey:  selectedNotes[0].key,
    spentDeposit:     selectedNotes[0].data,
    changePoolId,
    serverCommitmentIds,
  };

  return zkData;
}