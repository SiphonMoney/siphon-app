import { ethers, Contract } from 'ethers';
import crypto from 'crypto';
import { buildPoseidon } from 'circomlibjs';
import { prepareWithdrawalTransaction } from "./generateProof";
import { getProvider, getSigner } from './nexus';
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

  // LeafInserted(uint256 _index, uint256 _leaf, uint256 _root) — all non-indexed
  // topic[0] = keccak256("LeafInserted(uint256,uint256,uint256)")
  const LEAF_INSERTED_TOPIC = ethers.id("LeafInserted(uint256,uint256,uint256)");
  const rawLogs = await provider.getLogs({
    address: merkleTreeAddress,
    topics: [LEAF_INSERTED_TOPIC],
    fromBlock: 0,
    toBlock: 'latest',
  });
  console.log("Fetched LeafInserted raw logs:", rawLogs.length);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const parsed = rawLogs.map(log => {
    const [index, leaf] = abiCoder.decode(['uint256', 'uint256', 'uint256'], log.data);
    return { index: BigInt(index.toString()), leaf: BigInt(leaf.toString()) };
  });

  parsed.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));

  const leaves = parsed.map(p => p.leaf);
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
  const provider5 = getProvider();
  if (!provider5) return { error: "Provider not found" };
  const entrypoint5 = await getEntrypointContract(provider5);
  const vaultAddr5 = await entrypoint5.getVault(tokenAddress5);
  const vault5 = new Contract(vaultAddr5, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider5);
  const merkleTreeAddr5 = await vault5.merkleTree();
  const merkleTree5 = new Contract(merkleTreeAddr5, merkleTreeAbiJson.abi as ethers.InterfaceAbi, provider5);

  // Fetch on-chain state
  const onChainRoot = BigInt((await merkleTree5.getRoot()).toString());
  const filledSubtrees: bigint[] = await Promise.all(
    Array.from({ length: TREE_DEPTH }, (_, i) => merkleTree5.filledSubtrees(i).then((v: bigint) => BigInt(v.toString())))
  );
  const zeros: bigint[] = await Promise.all(
    Array.from({ length: TREE_DEPTH }, (_, i) => merkleTree5.zeros(i).then((v: bigint) => BigInt(v.toString())))
  );

  console.log("✅ On-chain root:", onChainRoot.toString());

  // Reconstruct path using the incremental tree state at insertion time.
  // At leafIndex, for each level: if the leaf was a right child (odd index),
  // the sibling is filledSubtrees[level] (the previously filled left subtree).
  // If it was a left child (even index), the sibling is zeros[level].
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isRight = idx % 2;
    pathIndices.push(isRight);
    if (isRight === 1) {
      // leaf is right child — sibling is the filled left subtree at this level
      pathElements.push(filledSubtrees[level]);
    } else {
      // leaf is left child — sibling is the zero value at this level
      pathElements.push(zeros[level]);
    }
    idx = Math.floor(idx / 2);
  }

  console.log("✅ pathElements built (length:", pathElements.length, ")");
  console.log("✅ pathIndices:", pathIndices.slice(0, 8));

  // 6) Generate new commitment
  const newPrecommitment = BigInt(F.toObject(poseidon([newNullifier, newSecret])));
  const newCommitment = BigInt(F.toObject(poseidon([changeValue, newPrecommitment])));

  console.log("newPrecommitment:", newPrecommitment.toString());
  console.log("newCommitment:", newCommitment.toString());

  // 7) Call prepareWithdrawalTransaction to generate proof (try remote relayer first, fallback to local)
  let withdrawalTxData: WithdrawalTxData;
  
  if (signer) {
    try {
      console.log("Calling remote proving relayer...");
      const { prepareWithdrawalTransactionRemote } = await import('./proofRelayer');
      withdrawalTxData = await prepareWithdrawalTransactionRemote({
        existingValue:     existingValue.toString(),
        existingNullifier: existingNullifier.toString(),
        existingSecret:    existingSecret.toString(),
        withdrawnValue:    withdrawnValue.toString(),
        newNullifier:      newNullifier.toString(),
        newSecret:         newSecret.toString(),
        pathElements:      pathElements.map((el: bigint) => el.toString()),
        pathIndices:       pathIndices,
        recipient:         _recipient,
        stateRoot:         onChainRoot.toString(),
      }, signer);
    } catch (e) {
      console.warn('[Proof] Relayer failed, falling back to local snarkjs', e);
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
      });
      withdrawalTxData = rawWithdrawalTxData as unknown as WithdrawalTxData;
    }
  } else {
    console.log("No signer connected, using local proving...");
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