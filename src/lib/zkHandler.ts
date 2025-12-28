import { ethers, Contract, Log } from 'ethers';
import crypto from 'crypto';
import { buildPoseidon } from 'circomlibjs';
import { prepareWithdrawalTransaction } from "./generateProof";
import { getProvider } from './nexus';
import { getEntrypointContract } from './handler';
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';

// --------- Constants ----------
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TREE_DEPTH = 32;

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
}

export interface WithdrawalTxData {
  recipient: string;
  amount: string;
  nullifierHash: string;
  newCommitment: string;
  proof: (string | bigint)[];
  publicSignals?: string[];
  stateRoot?: string;
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

  console.log("Generated secret (mod):", secretMod.toString());
  console.log("Generated nullifier (mod):", nullifierMod.toString());
  console.log("Precommitment:", precommitment.toString());

  // Note: commitment will be added after deposit transaction
  // Commitment = H(amount, precommitment)
  const commitmentData: CommitmentData = {
    secret: secretMod.toString(),
    nullifier: nullifierMod.toString(),
    precommitment: precommitment.toString(),
    amount: _amount
  };

  return commitmentData;
}

// --------- Helper: Get on-chain leaves ----------
async function getOnChainLeaves(tokenAddress: string): Promise<bigint[]> {
  console.log("getOnChainLeaves() tokenAddress:", tokenAddress);
  
  const provider = getProvider();
  if (!provider) throw new Error("Provider not found");

  const entrypoint = await getEntrypointContract(provider);
  const vaultAddress = await entrypoint.getVault(tokenAddress);
  console.log("Vault address (from entrypoint):", vaultAddress);

  const vault = new Contract(vaultAddress, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
  const merkleTreeAddress = await vault.merkleTree();
  console.log("MerkleTree address:", merkleTreeAddress);

  const merkleTree = new Contract(merkleTreeAddress, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider);
  const filter = merkleTree.filters.LeafInserted();
  const logs = await merkleTree.queryFilter(filter, 0, 'latest');
  console.log("Fetched LeafInserted logs count:", logs.length);

  const merkleTreeInterface = new ethers.Interface(merkleTreeAbiJson.abi as ethers.InterfaceAbi);
  const decoded = logs.map(l => {
    try {
      return merkleTreeInterface.parseLog(l as Log);
    } catch (e) {
      console.warn("Failed to parse MerkleTree log:", e);
      return null;
    }
  }).filter(Boolean) as ethers.LogDescription[];

  // Sort by index
  decoded.sort((a, b) => {
    const ia = BigInt(a.args._index.toString());
    const ib = BigInt(b.args._index.toString());
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  });

  const leaves = decoded.map(d => BigInt(d.args._leaf));
  console.log("Parsed leaves count:", leaves.length);

  return leaves;
}

// --------- Generate ZK Data (for withdrawals) ----------
export async function generateZKData(
  _chainId: number,
  _token: TokenInfo,
  _amount: string,
  _recipient: string
): Promise<ZKData | { error: string }> {
  console.log("generateZKData() called", { _chainId, _token: _token.symbol, _amount, _recipient });

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // 1. FETCH LEAVES FIRST 
  const tokenAddress = _token.symbol === 'ETH' ? NATIVE_TOKEN : _token.address;
  let leaves: bigint[] = [];
  try {
      leaves = await getOnChainLeaves(tokenAddress);
      console.log("Found leaves count:", leaves.length);
  } catch (err) {
      console.error("Failed to fetch on-chain leaves:", err);
      return { error: "Failed to connect to blockchain to verify deposits." };
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
    if (data && data.commitment && data.amount && !data.spent) {
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

  // 5) Generate Merkle proof for fixed 32-level tree
  // We already have 'leaves' and 'leafIndex' from Step 2
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  // Compute pathIndices for ALL 32 levels
  let currentIndex = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = currentIndex % 2;
    pathIndices.push(isRight);
    currentIndex = Math.floor(currentIndex / 2);
  }

  console.log("Path indices:", pathIndices.slice(0, 12));

  // Build tree level by level
  let nodesAtLevel = leaves.length;
  let currentLevel: bigint[] = [...leaves];

  console.log(`Starting with ${nodesAtLevel} leaves`);

  currentIndex = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = pathIndices[level];
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
    const sibling = (siblingIndex < nodesAtLevel) ? (currentLevel[siblingIndex] ?? 0n) : 0n;
    pathElements.push(sibling);

    const nodesAtNextLevel = Math.floor((nodesAtLevel + 1) / 2);
    const nextLevel: bigint[] = new Array(nodesAtNextLevel);

    if (level < 5) {
      console.log(
        `Level ${level}: idx=${currentIndex}, nodesAtLevel=${nodesAtLevel}, ` +
        `nodesAtNextLevel=${nodesAtNextLevel}, isRight=${isRight}, ` +
        `sibling[${siblingIndex}]=${sibling.toString().substring(0, 20)}...`
      );
    }

    for (let i = 0; i < nodesAtNextLevel; i++) {
      const leftIdx = i * 2;
      const rightIdx = i * 2 + 1;
      const left = (leftIdx < nodesAtLevel) ? (currentLevel[leftIdx] ?? 0n) : 0n;
      const right = (rightIdx < nodesAtLevel) ? (currentLevel[rightIdx] ?? 0n) : 0n;
      const hash = BigInt(F.toObject(poseidon([left, right])));
      nextLevel[i] = hash;

      if (level < 5 && i < 4) {
        console.log(
          `  -> hash(node[${leftIdx}]=${left.toString().substring(0, 15)}..., ` +
          `node[${rightIdx}]=${right.toString().substring(0, 15)}...) -> ` +
          `[${i}]=${hash.toString().substring(0, 20)}...`
        );
      }
    }

    currentLevel = nextLevel;
    nodesAtLevel = nodesAtNextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  const computedRoot = currentLevel[0] ?? 0n;
  console.log("✅ Extracted pathElements (length:", pathElements.length, ")");
  console.log("✅ Extracted pathIndices (length:", pathIndices.length, ")");
  console.log("✅ Computed root:", computedRoot.toString());

  // 6) Generate new commitment
  const newPrecommitment = BigInt(F.toObject(poseidon([newNullifier, newSecret])));
  const newCommitment = BigInt(F.toObject(poseidon([changeValue, newPrecommitment])));

  console.log("newPrecommitment:", newPrecommitment.toString());
  console.log("newCommitment:", newCommitment.toString());

  // 7) Call prepareWithdrawalTransaction to generate proof
  console.log("Calling prepareWithdrawalTransaction() to produce proof...");
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
    stateRoot: computedRoot.toString(),
    publicInputsHash: 0n
  });

  const withdrawalTxData = rawWithdrawalTxData as unknown as WithdrawalTxData;

  console.log("prepareWithdrawalTransaction returned summary:", {
    amount: withdrawalTxData.amount?.toString?.() ?? withdrawalTxData.amount,
    nullifierHash: withdrawalTxData.nullifierHash?.toString?.() ?? withdrawalTxData.nullifierHash,
    newCommitment: withdrawalTxData.newCommitment?.toString?.() ?? withdrawalTxData.newCommitment,
    proofLength: Array.isArray(withdrawalTxData.proof) 
      ? withdrawalTxData.proof.length 
      : typeof withdrawalTxData.proof,
    publicSignals: withdrawalTxData.publicSignals ?? "none"
  });

  // 8) Validate proof format
  if (!Array.isArray(withdrawalTxData.proof)) {
    console.error("Proof is not array:", withdrawalTxData.proof);
    return { error: "Proof has invalid format" };
  }

  if (withdrawalTxData.proof.length !== 24) {
    console.error("Proof length mismatch:", withdrawalTxData.proof.length, "expected 24");
    return { error: `Proof length ${withdrawalTxData.proof.length} != 24` };
  }

  console.log("Proof sample first 4 elements:", withdrawalTxData.proof.slice(0, 4));

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