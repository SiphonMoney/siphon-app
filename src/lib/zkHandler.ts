import { ethers, Contract, Network } from 'ethers';
import crypto from 'crypto';
import { buildPoseidon } from 'circomlibjs';
import { prepareWithdrawalTransaction } from "./generateProof";
import { getProvider, getSigner } from './nexus';
import { getEntrypointContract } from './handler';
import { getNetwork, getReadProviderRpcUrl } from './networks';
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';

// --------- Constants ----------
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TREE_DEPTH = 32;

// Per-chain read provider + deploy block come from the network registry so leaf scans always
// hit the SELECTED chain (Eth Sepolia / Base Sepolia) regardless of the wallet's current network.
const vaultDeployBlock = (): number => getNetwork().deployBlock;
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
async function getLogsChunked(
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

function getReadProvider(): ethers.Provider {
  const net = getNetwork();
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
  nullifierHash: string;
  newCommitment: string;
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
  spentDepositKey: string | null;
  spentDeposit: CommitmentData | null;
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
async function resolveVault(tokenAddress: string): Promise<{ vault: Contract; merkleTreeAddress: string }> {
  const cacheKey = `${getNetwork().chainId}:${tokenAddress.toLowerCase()}`;
  const hit = vaultInfoCache.get(cacheKey);
  if (hit) return hit;
  const provider = getReadProvider();
  const entrypoint = await getEntrypointContract(provider);
  const vaultAddress = await entrypoint.getVault(tokenAddress);
  const vault = new Contract(vaultAddress, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
  const merkleTreeAddress = await vault.merkleTree();
  const info = { vault, merkleTreeAddress };
  vaultInfoCache.set(cacheKey, info);
  return info;
}

// --------- Helper: Get on-chain leaves ----------
async function getOnChainLeaves(tokenAddress: string): Promise<bigint[]> {
  zlog("getOnChainLeaves() tokenAddress:", tokenAddress);
  const provider = getReadProvider();
  const { merkleTreeAddress } = await resolveVault(tokenAddress);
  zlog("MerkleTree address:", merkleTreeAddress);

  // LeafInserted(uint256 _index, uint256 _leaf, uint256 _root) — all non-indexed
  // topic[0] = keccak256("LeafInserted(uint256,uint256,uint256)")
  const LEAF_INSERTED_TOPIC = ethers.id("LeafInserted(uint256,uint256,uint256)");
  const latest = await provider.getBlockNumber();
  const rawLogs = await getLogsChunked(
    provider,
    { address: merkleTreeAddress, topics: [LEAF_INSERTED_TOPIC] },
    vaultDeployBlock(),
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
  } else {
    leavesCache.clear();
  }
}

async function getLeafSet(tokenAddress: string): Promise<Set<string>> {
  const cacheKey = `${getNetwork().chainId}:${tokenAddress.toLowerCase()}`;
  const hit = leavesCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < LEAVES_TTL_MS) return hit.leaves;

  const pending = leavesInflight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const raw = await getOnChainLeaves(tokenAddress);
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
  // Collect candidate notes (unspent locally, with an amount) grouped by token symbol.
  const notesByToken: Record<string, Array<{ commitment?: string; nullifierHash?: string; amount: string }>> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(`${chainId}-`)) continue;
    const parts = key.split('-');
    if (parts.length < 3) continue;
    const sym = parts[1].toUpperCase();
    try {
      const d = JSON.parse(localStorage.getItem(key) || '{}');
      if (!d || !d.amount || d.spent) continue;
      (notesByToken[sym] ||= []).push({
        commitment: d.commitment != null ? String(d.commitment) : undefined,
        nullifierHash: d.nullifierHash != null ? String(d.nullifierHash) : undefined,
        amount: String(d.amount),
      });
    } catch { /* skip unparseable */ }
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
          if (await vault.nullifiers(BigInt(n.nullifierHash))) continue; // already withdrawn
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

// --------- Generate ZK Data (for withdrawals) ----------
export interface SwapBinding {
  pool: string;
  dstToken: string;
  fee: number | bigint;
  minAmountOut: bigint | string;
}

export async function generateZKData(
  _chainId: number,
  _token: TokenInfo,
  _amount: string,
  _recipient: string,
  _swap?: SwapBinding
): Promise<ZKData | { error: string }> {
  console.log("generateZKData() called", { _chainId, _token: _token.symbol, _amount, _recipient, _swap });

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // 1. FETCH LEAVES FIRST 
  const tokenAddress = _token.symbol === 'ETH' ? NATIVE_TOKEN : _token.address;
  let leaves: bigint[] = [];
  try {
      const leafSet = await getLeafSet(tokenAddress);
      leaves = [...leafSet].map((s) => BigInt(s));
      console.log("Found leaves count:", leaves.length);
  } catch (err) {
      console.error("Failed to fetch on-chain leaves:", err);
      return { error: "Failed to connect to blockchain to verify deposits." };
  }

  // Sync server notes into localStorage
  const signer = getSigner();
  if (signer) {
    try {
      const { fetchNotes } = await import('./noteStore');
      const serverNotes = await fetchNotes(signer);
      for (const note of serverNotes) {
        if (note.spent === 'false') {
          const key = `${note.chain_id}-${note.asset}-${note.commitment}`;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify({
              nullifier: note.decrypted.nullifier,
              secret: note.decrypted.secret,
              amount: note.decrypted.amount,
              commitment: note.commitment,
            }));
          }
        }
      }
    } catch (e) {
      console.warn('Server note fetch failed, using localStorage only', e);
    }
  }

  // 2. FIND A VALID SPENDABLE DEPOSIT
  let storedDeposit: CommitmentData | null = null;
  let spentDepositKey: string | null = null;
  let leafIndex = -1;

  console.log("Scanning localStorage for spendable deposits...");
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Filter for keys matching this chain and token
    if (!key.startsWith(`${_chainId}-${_token.symbol}-`)) continue;

    const data = JSON.parse(localStorage.getItem(key) || '{}');
    
    // Check if data is locally valid and unspent
    if (data && data.commitment && data.amount && (data.spent === 'false' || data.spent === false || data.spent === undefined)) {
      try {
        const storedAmountBN = BigInt(
          ethers.parseUnits(data.amount.toString(), _token.decimals).toString()
        );
        const requestedBN = BigInt(
          ethers.parseUnits(_amount, _token.decimals).toString()
        );

        // Check if amount is sufficient
        if (storedAmountBN >= requestedBN) {
            // 🔍 CRITICAL CHECK: Does this commitment exist on-chain?
            const localCommitment = BigInt(data.commitment);
            
            // Search for it in the leaves we just fetched
            const foundIndex = leaves.findIndex(leaf => leaf === localCommitment);
            
            if (foundIndex !== -1) {
                console.log("✅ Match found! Local commitment exists on-chain at index:", foundIndex);
                storedDeposit = data;
                spentDepositKey = key;
                leafIndex = foundIndex; // Save the index now
                break; // Stop looking, we found a good one
            } else {
                console.warn("⚠️ Ghost Deposit detected (exists locally but NOT on-chain):", key);
                // We SKIP this key and continue the loop. 
                // We do NOT crash here.
            }
        }
      } catch (e) {
        console.warn("Failed to process key", key, e);
      }
    }
  }

  // If after checking ALL keys, we still don't have a valid deposit:
  if (!storedDeposit || !spentDepositKey || leafIndex === -1) {
    console.error("No valid, confirmed deposit found.");
    return { error: "No valid deposit found on-chain. Please deposit funds again or wait for confirmation." };
  }

  console.log("Selected stored deposit:", { spentDepositKey, leafIndex });

  // 3) Reconstruct secrets and values
  const existingSecret = BigInt(storedDeposit.secret);
  const existingNullifier = BigInt(storedDeposit.nullifier);
  if (!storedDeposit.commitment) {throw new Error('Stored deposit is missing commitment');}
  const existingCommitment = BigInt(storedDeposit.commitment);
  const existingValue = BigInt( ethers.parseUnits(storedDeposit.amount, _token.decimals).toString() );
  const withdrawnValue = BigInt( ethers.parseUnits(_amount, _token.decimals).toString() );

  console.log("existingSecret:", existingSecret.toString());
  console.log("existingNullifier:", existingNullifier.toString());
  console.log("existingCommitment:", existingCommitment.toString());
  console.log("existingValue:", existingValue.toString());
  console.log("withdrawnValue:", withdrawnValue.toString());

  // 4) Derive new secrets for change output
  const newSecret = BigInt(F.toObject(poseidon([existingSecret, 1n])));
  const newNullifier = BigInt(F.toObject(poseidon([existingNullifier, 1n])));
  const changeValue = existingValue - withdrawnValue;

  console.log("Derived newSecret:", newSecret.toString());
  console.log("Derived newNullifier:", newNullifier.toString());
  console.log("Change Value:", changeValue.toString());

  // 5) Build Merkle proof using filledSubtrees + zeros from the contract
  // This mirrors the incremental insertion logic in MerkleTree.sol exactly.
  const tokenAddress5 = _token.symbol === 'ETH' ? NATIVE_TOKEN : _token.address;
  // Read-only on-chain reads (root, filledSubtrees, zeros) — use the RPC fallback so this
  // works without the wallet provider initialized, same as getOnChainLeaves above.
  const provider5 = getReadProvider();
  const entrypoint5 = await getEntrypointContract(provider5);
  const vaultAddr5 = await entrypoint5.getVault(tokenAddress5);
  const vault5 = new Contract(vaultAddr5, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider5);
  const merkleTreeAddr5 = await vault5.merkleTree();
  const merkleTree5 = new Contract(merkleTreeAddr5, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider5);

  // Fetch on-chain state. These are TREE_DEPTH*2 calls — run them with bounded concurrency
  // and 429 retries so public RPC gateways (e.g. Tenderly) don't rate-limit the burst.
  const onChainRoot = BigInt((await withRetry(() => merkleTree5.getRoot())).toString());
  const levels = Array.from({ length: TREE_DEPTH }, (_, i) => i);
  // Empty-subtree hashes per level (zeros[0] = empty leaf). Needed to pad partial levels.
  const zeros: bigint[] = await mapLimit(levels, 2, (i) =>
    withRetry(() => merkleTree5.zeros(i)).then((v: bigint) => BigInt(v.toString())),
  );

  console.log("✅ On-chain root:", onChainRoot.toString());

  // Build the Merkle authentication path for `leafIndex` from the FULL on-chain leaf set.
  // The previous filledSubtrees/zeros shortcut only yields a valid path for the *last* inserted
  // leaf; spending any older deposit needs the real siblings, which we hash up here level by
  // level (Poseidon(left,right), padding missing right nodes with zeros[level]).
  const poseidonHash = (a: bigint, b: bigint): bigint => BigInt(F.toObject(poseidon([a, b])));
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

  const computedRoot = levelNodes[0];
  if (computedRoot !== onChainRoot) {
    console.warn(`[Proof] ⚠️ computed root ${computedRoot} != on-chain root ${onChainRoot} — proof would fail`);
  } else {
    console.log("✅ computed Merkle root matches on-chain root");
  }
  console.log("✅ pathElements built (length:", pathElements.length, ")");
  console.log("✅ pathIndices:", pathIndices.slice(0, 8));

  // 6) Generate new commitment
  const newPrecommitment = BigInt(F.toObject(poseidon([newNullifier, newSecret])));
  const newCommitment = BigInt(F.toObject(poseidon([changeValue, newPrecommitment])));

  console.log("newPrecommitment:", newPrecommitment.toString());
  console.log("newCommitment:", newCommitment.toString());

  // 7) Generate the Groth16 proof locally in the browser (snarkjs + /public/zk circuit files).
  // The remote proving-relayer (:5010) isn't deployed and its auth path triggers a blocking
  // MetaMask signature popup, and the /api/prove route needs rapidsnark + a machine-specific
  // ZK_BUILD_DIR — so local proving is the reliable path. Heavy: takes ~20–60s in the browser.
  let withdrawalTxData: WithdrawalTxData;
  {
    console.log("[Proof] Generating Groth16 proof locally (snarkjs)…");
    const rawWithdrawalTxData = await prepareWithdrawalTransaction({
      existingValue: existingValue.toString(),
      existingNullifier: existingNullifier.toString(),
      existingSecret: existingSecret.toString(),
      withdrawnValue: withdrawnValue.toString(),
      newNullifier: newNullifier.toString(),
      newSecret: newSecret.toString(),
      pathElements: pathElements,
      pathIndices: pathIndices,
      recipient: _recipient,
      stateRoot: onChainRoot.toString(),
      // Swap-binding public signals (0 for plain withdraw / fee payment). For a swap these MUST
      // match the values passed to Entrypoint.swap, or Vault.swap reverts InvalidSwapParams.
      pool:         _swap ? _swap.pool : 0,
      dstToken:     _swap ? _swap.dstToken : 0,
      fee:          _swap ? _swap.fee : 0,
      minAmountOut: _swap ? _swap.minAmountOut.toString() : 0,
    });
    withdrawalTxData = rawWithdrawalTxData as unknown as WithdrawalTxData;
  }

  console.log("prepareWithdrawalTransaction returned summary:", {
    amount: withdrawalTxData.amount?.toString?.() ?? withdrawalTxData.amount,
    nullifierHash: withdrawalTxData.nullifierHash?.toString?.() ?? withdrawalTxData.nullifierHash,
    newCommitment: withdrawalTxData.newCommitment?.toString?.() ?? withdrawalTxData.newCommitment,
    proofLength: withdrawalTxData.proof ? Object.keys(withdrawalTxData.proof).length : 0,
    publicSignals: withdrawalTxData.publicSignals ?? "none"
  });

  // 8) Validate proof format (Groth16: pA[2], pB[2][2], pC[2])
  if (!Array.isArray(withdrawalTxData.pA) || withdrawalTxData.pA.length !== 2 ||
      !Array.isArray(withdrawalTxData.pB) || withdrawalTxData.pB.length !== 2 ||
      !Array.isArray(withdrawalTxData.pC) || withdrawalTxData.pC.length !== 2) {
    console.error("Groth16 proof components missing or malformed:", withdrawalTxData.pA, withdrawalTxData.pB, withdrawalTxData.pC);
    return { error: "Proof has invalid Groth16 format" };
  }

  console.log("pA:", withdrawalTxData.pA);
  console.log("pB:", withdrawalTxData.pB);
  console.log("pC:", withdrawalTxData.pC);

  // 9) Package ZK Data
  const zkData: ZKData = {
    withdrawalTxData: withdrawalTxData,
    changeValue: changeValue,
    newDepositKey: `${_chainId}-${_token.symbol}-${withdrawalTxData.newCommitment.toString()}`,
    newDeposit: {
      secret: newSecret.toString(),
      nullifier: newNullifier.toString(),
      precommitment: newPrecommitment.toString(),
      commitment: withdrawalTxData.newCommitment.toString(),
      amount: ethers.formatUnits(changeValue, _token.decimals)
    },
    spentDepositKey: spentDepositKey,
    spentDeposit: storedDeposit
  };

  return zkData;
}