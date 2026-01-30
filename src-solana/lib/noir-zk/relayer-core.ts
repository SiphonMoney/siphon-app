/**
 * Relayer Core - Embedded Poseidon Merkle tree + commitment indexing
 *
 * This module provides the core relayer functionality without requiring
 * a separate server process. It runs directly inside Next.js API routes.
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';

// Program ID for siphon-zk-pool (deployed to devnet)
export const ZK_POOL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ZK_POOL_PROGRAM_ID || '3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb'
);

// Merkle tree configuration
export const MERKLE_TREE_HEIGHT = 20;
export const ROOT_HISTORY_SIZE = 32;

// PDA derivations (matching on-chain seeds)
export function getMerkleTreePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('merkle_tree')],
    ZK_POOL_PROGRAM_ID
  );
}

export function getPoolConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool_config')],
    ZK_POOL_PROGRAM_ID
  );
}

export function getPoolVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool_vault')],
    ZK_POOL_PROGRAM_ID
  );
}

export function getPoolTokenAccountPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool_token'), mint.toBuffer()],
    ZK_POOL_PROGRAM_ID
  );
}

export function getNullifierPDA(nullifierHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('nullifier'), Buffer.from(nullifierHash)],
    ZK_POOL_PROGRAM_ID
  );
}

export function getCommitmentRecordPDA(leafIndex: number): [PublicKey, number] {
  const indexBuf = Buffer.alloc(8);
  indexBuf.writeBigUInt64LE(BigInt(leafIndex));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('commitment'), indexBuf],
    ZK_POOL_PROGRAM_ID
  );
}

// Commitment data structure
export interface CommitmentEntry {
  index: number;
  commitment: Uint8Array;
  commitmentHex: string;
  commitmentDecimal: string;
  encryptedOutput: string;
}

// Tree state read from on-chain MerkleTree account
export interface OnChainTreeState {
  authority: PublicKey;
  nextIndex: number;
  currentRoot: Uint8Array;
  rootHistory: Uint8Array[]; // 32 entries of 32 bytes each
  rootHistoryIndex: number;
  height: number;
  bump: number;
}

// Local Merkle tree structure (rebuilt from commitments using Poseidon)
export interface LocalMerkleTree {
  layers: string[][]; // Each layer is array of decimal strings
  zeros: string[];    // Zero values for each level
  levels: number;
}

// Singleton state for the embedded relayer
class RelayerCore {
  private connection: Connection | null = null;
  private executorKeypair: Keypair | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private poseidonWasm: any = null;

  // Commitment index
  private utxoIndex = new Map<string, CommitmentEntry>();
  private commitmentIndex = new Map<string, CommitmentEntry>();
  private encryptedOutputsByIndex: string[] = [];
  private commitmentsByIndex: string[] = [];
  private isIndexing = false;
  private indexingPromise: Promise<void> | null = null;

  // Local Merkle tree
  private localTree: LocalMerkleTree | null = null;

  // Cache
  private cachedTreeState: OnChainTreeState | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  async initialize(rpcUrl: string, executorPrivateKey?: string) {
    // Use custom fetch config for better Node.js compatibility
    const fetchWithRetry = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fetch(input, { ...init, signal: AbortSignal.timeout(30000) });
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          console.log(`[RelayerCore] Fetch retry ${i + 1}/${maxRetries}`);
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
      }
      throw new Error('Fetch failed after retries');
    };

    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetch: fetchWithRetry as any,
    });

    if (executorPrivateKey) {
      try {
        this.executorKeypair = Keypair.fromSecretKey(bs58.decode(executorPrivateKey));
        console.log('[RelayerCore] Executor wallet:', this.executorKeypair.publicKey.toBase58());
      } catch (e) {
        console.error('[RelayerCore] Failed to load executor keypair:', e);
      }
    }

    // Initialize Poseidon hasher
    await this.ensurePoseidon();

    // Initial commitment indexing (must complete before processing withdrawals)
    await this.indexCommitments();

    console.log('[RelayerCore] Initialized and indexed');
  }

  private async ensurePoseidon() {
    if (!this.poseidonWasm) {
      try {
        const { WasmFactory } = await import('@lightprotocol/hasher.rs');
        this.poseidonWasm = await WasmFactory.getInstance();
        console.log('[RelayerCore] Poseidon hasher initialized');
      } catch (e) {
        console.error('[RelayerCore] Failed to initialize Poseidon:', e);
        throw new Error('Poseidon WASM initialization failed');
      }
    }
    return this.poseidonWasm;
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('RelayerCore not initialized');
    }
    return this.connection;
  }

  getExecutorKeypair(): Keypair {
    if (!this.executorKeypair) {
      throw new Error('Executor keypair not configured');
    }
    return this.executorKeypair;
  }

  // Read on-chain MerkleTree account state
  async getTreeState(forceRefresh = false): Promise<OnChainTreeState> {
    const now = Date.now();
    if (!forceRefresh && this.cachedTreeState && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.cachedTreeState;
    }

    const connection = this.getConnection();
    const [merkleTreePDA] = getMerkleTreePDA();

    const accountInfo = await connection.getAccountInfo(merkleTreePDA);
    if (!accountInfo) {
      throw new Error('MerkleTree account not found. Program may not be initialized.');
    }

    const data = accountInfo.data;

    // MerkleTree layout (zero_copy, #[repr(C)]):
    // 8 bytes: anchor discriminator
    // 32 bytes: authority (Pubkey)
    // 8 bytes: next_index (u64 LE)
    // 32 bytes: current_root
    // 1024 bytes: root_history (32 roots x 32 bytes)
    // 8 bytes: root_history_index (u64 LE)
    // 1 byte: height
    // 1 byte: bump
    // 6 bytes: padding

    let offset = 8; // Skip discriminator

    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const nextIndex = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    const currentRoot = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    const rootHistoryRaw = data.slice(offset, offset + 1024);
    const rootHistory: Uint8Array[] = [];
    for (let i = 0; i < ROOT_HISTORY_SIZE; i++) {
      rootHistory.push(new Uint8Array(rootHistoryRaw.slice(i * 32, (i + 1) * 32)));
    }
    offset += 1024;

    const rootHistoryIndex = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    const height = data[offset];
    offset += 1;

    const bump = data[offset];

    this.cachedTreeState = {
      authority,
      nextIndex,
      currentRoot,
      rootHistory,
      rootHistoryIndex,
      height,
      bump,
    };
    this.cacheTimestamp = now;

    return this.cachedTreeState;
  }

  // Index CommitmentInserted events from on-chain transactions
  async indexCommitments(): Promise<void> {
    // If already indexing, wait for the current operation to complete
    if (this.isIndexing && this.indexingPromise) {
      console.log('[RelayerCore] Waiting for in-progress indexing...');
      return this.indexingPromise;
    }

    // Start new indexing operation
    this.indexingPromise = this._doIndexCommitments();
    return this.indexingPromise;
  }

  private async _doIndexCommitments(): Promise<void> {
    if (this.isIndexing) return;
    this.isIndexing = true;

    try {
      const connection = this.getConnection();
      const [merkleTreePDA] = getMerkleTreePDA();

      console.log('[RelayerCore] Indexing commitment events...');

      const signatures = await connection.getSignaturesForAddress(
        merkleTreePDA,
        { limit: 1000 },
        'confirmed'
      );

      if (signatures.length === 0) {
        console.log('[RelayerCore] No transactions found');
        return;
      }

      // Process oldest first
      const sigsToProcess = [...signatures].reverse();
      let newCommitmentsFound = 0;

      for (const sigInfo of sigsToProcess) {
        if (sigInfo.err) continue;

        try {
          const tx = await connection.getTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          });

          if (!tx?.meta?.logMessages) continue;

          for (const log of tx.meta.logMessages) {
            if (!log.startsWith('Program data: ')) continue;

            try {
              const eventData = Buffer.from(log.slice('Program data: '.length), 'base64');

              // CommitmentInserted event layout:
              // 8 bytes: discriminator (sha256("event:CommitmentInserted")[0..8])
              // 8 bytes: index (u64 LE)
              // 32 bytes: commitment
              // 4 bytes: encrypted_output length (u32 LE)
              // N bytes: encrypted_output data
              // 8 bytes: amount
              // 1 byte: Option tag for mint
              // 32 bytes: mint (if Some)

              if (eventData.length < 52) continue;

              const index = new BN(eventData.slice(8, 16), 'le').toNumber();
              const commitment = eventData.slice(16, 48);
              const encLen = eventData.readUInt32LE(48);

              if (encLen === 0 || encLen > 10000 || 52 + encLen > eventData.length) continue;

              const encryptedOutput = eventData.slice(52, 52 + encLen).toString('hex');
              const commitmentHex = Buffer.from(commitment).toString('hex');

              if (this.utxoIndex.has(encryptedOutput)) continue;

              // Convert commitment to decimal string (matches SDK format)
              const commitmentDecimal = new BN(commitment).toString();

              const entry: CommitmentEntry = {
                index,
                commitment: new Uint8Array(commitment),
                commitmentHex,
                commitmentDecimal,
                encryptedOutput,
              };

              this.utxoIndex.set(encryptedOutput, entry);
              this.commitmentIndex.set(commitmentHex, entry);
              this.encryptedOutputsByIndex[index] = encryptedOutput;
              this.commitmentsByIndex[index] = commitmentDecimal;
              newCommitmentsFound++;
            } catch {
              // Not a valid event, skip
            }
          }
        } catch {
          // Skip individual transaction errors
        }
      }

      console.log(`[RelayerCore] Indexed ${newCommitmentsFound} new commitments. Total: ${this.utxoIndex.size}`);

      // Rebuild Merkle tree if we have new commitments
      if (newCommitmentsFound > 0 || !this.localTree) {
        await this.rebuildMerkleTree();

        // Update root on-chain if it has changed
        if (newCommitmentsFound > 0) {
          await this.updateRootOnChain();
        }
      }
    } catch (e) {
      console.error('[RelayerCore] Error indexing commitments:', e);
    } finally {
      this.isIndexing = false;
      this.indexingPromise = null;
    }
  }

  // Update the on-chain root if local tree root differs from on-chain
  private async updateRootOnChain(): Promise<void> {
    try {
      if (!this.localTree) {
        console.log('[RelayerCore] No local tree to update root from');
        return;
      }

      // Get local tree root
      const localRoot = this.localTree.layers[this.localTree.levels]?.[0] || this.localTree.zeros[this.localTree.levels];

      // Get on-chain tree state
      const treeState = await this.getTreeState(true); // force refresh
      const onChainRootHex = Buffer.from(treeState.currentRoot).toString('hex');

      // Convert local root to hex for comparison
      const localRootBN = new BN(localRoot);
      const localRootHex = localRootBN.toBuffer('be', 32).toString('hex');

      if (localRootHex === onChainRootHex) {
        console.log('[RelayerCore] Root already up-to-date on-chain');
        return;
      }

      console.log(`[RelayerCore] Updating root on-chain: ${localRoot.slice(0, 20)}...`);

      // Import ZkPoolClient dynamically to avoid circular dependency
      const { getZkPoolClient } = await import('./zk-pool-client');
      const zkClient = await getZkPoolClient();

      const result = await zkClient.updateRoot(localRoot);
      if (result.success) {
        console.log(`[RelayerCore] Root updated on-chain: ${result.signature}`);
      } else {
        console.error(`[RelayerCore] Failed to update root: ${result.error}`);
      }
    } catch (error) {
      console.error('[RelayerCore] Error updating root on-chain:', error);
      // Don't throw - indexing should continue even if root update fails
    }
  }

  // Rebuild the full Poseidon Merkle tree from indexed commitments
  private async rebuildMerkleTree(): Promise<void> {
    const wasm = await this.ensurePoseidon();
    const levels = MERKLE_TREE_HEIGHT;

    // Compute zero values for each level
    const zeros: string[] = [];
    zeros[0] = '0';
    for (let i = 1; i <= levels; i++) {
      zeros[i] = wasm.poseidonHashString([zeros[i - 1], zeros[i - 1]]);
    }

    // Collect all leaf commitments
    const leaves: string[] = [];
    for (let i = 0; i < this.commitmentsByIndex.length; i++) {
      leaves.push(this.commitmentsByIndex[i] || '0');
    }

    if (leaves.length === 0) {
      this.localTree = { layers: [[]], zeros, levels };
      console.log('[RelayerCore] Merkle tree rebuilt with 0 leaves');
      return;
    }

    // Build layers bottom-up
    const layers: string[][] = [];
    layers[0] = leaves;

    for (let level = 1; level <= levels; level++) {
      layers[level] = [];
      const prevLayer = layers[level - 1];
      for (let i = 0; i < Math.ceil(prevLayer.length / 2); i++) {
        const left = prevLayer[i * 2];
        const right = (i * 2 + 1) < prevLayer.length ? prevLayer[i * 2 + 1] : zeros[level - 1];
        layers[level][i] = wasm.poseidonHashString([left, right]);
      }
    }

    this.localTree = { layers, zeros, levels };

    const computedRoot = layers[levels]?.length > 0 ? layers[levels][0] : zeros[levels];
    console.log(`[RelayerCore] Merkle tree rebuilt with ${leaves.length} leaves, root: ${computedRoot.slice(0, 20)}...`);
  }

  // Find commitment entry by hex or decimal string
  private findCommitmentEntry(commitmentParam: string): CommitmentEntry | undefined {
    // Try direct hex lookup
    let entry = this.commitmentIndex.get(commitmentParam);
    if (entry) return entry;

    // Try converting decimal to hex
    try {
      const commitmentBN = new BN(commitmentParam, 10);
      const commitmentHex = commitmentBN.toBuffer('be', 32).toString('hex');
      entry = this.commitmentIndex.get(commitmentHex);
    } catch {
      // Not a valid decimal
    }

    return entry;
  }

  // Generate Merkle proof for a commitment
  async generateMerkleProof(commitmentParam: string): Promise<{
    pathElements: string[];
    pathIndices: number[];
    root: string;
  }> {
    let entry = this.findCommitmentEntry(commitmentParam);

    if (!entry) {
      // Re-index and try again
      console.log('[RelayerCore] Commitment not found, re-indexing...');
      await this.indexCommitments();
      entry = this.findCommitmentEntry(commitmentParam);
    }

    if (!entry) {
      throw new Error(`Commitment not found: ${commitmentParam}`);
    }

    // Ensure tree is built
    if (!this.localTree || this.localTree.layers[0].length === 0) {
      await this.rebuildMerkleTree();
    }

    if (!this.localTree) {
      throw new Error('Local Merkle tree is empty');
    }

    const tree = this.localTree;
    const targetIndex = entry.index;

    // Generate path (same logic as SDK's MerkleTree.path())
    const pathElements: string[] = [];
    const pathIndices: number[] = [];
    let idx = targetIndex;

    for (let level = 0; level < tree.levels; level++) {
      pathIndices.push(idx % 2);
      const siblingIdx = idx ^ 1;
      const sibling = siblingIdx < (tree.layers[level]?.length || 0)
        ? tree.layers[level][siblingIdx]
        : tree.zeros[level];
      pathElements.push(sibling);
      idx >>= 1;
    }

    const root = tree.layers[tree.levels]?.length > 0
      ? tree.layers[tree.levels][0]
      : tree.zeros[tree.levels];

    console.log(`[RelayerCore] Generated proof for index ${targetIndex}, root: ${root.slice(0, 20)}...`);

    return { pathElements, pathIndices, root };
  }

  // Get current Merkle root (from local tree)
  getMerkleRoot(): string {
    if (!this.localTree) {
      throw new Error('Merkle tree not built');
    }
    return this.localTree.layers[this.localTree.levels]?.length > 0
      ? this.localTree.layers[this.localTree.levels][0]
      : this.localTree.zeros[this.localTree.levels];
  }

  // Get next leaf index from on-chain state
  async getNextIndex(): Promise<number> {
    const state = await this.getTreeState();
    return state.nextIndex;
  }

  // Compute Poseidon hash
  async poseidonHash(inputs: string[]): Promise<string> {
    const wasm = await this.ensurePoseidon();
    return wasm.poseidonHashString(inputs);
  }

  // Generate commitment data (for deposit)
  async generateCommitment(value: bigint): Promise<{
    commitment: string;
    nullifier: string;
    secret: string;
    precommitment: string;
  }> {
    const wasm = await this.ensurePoseidon();

    // Generate random nullifier and secret (32 bytes each, as field elements)
    const nullifierBytes = crypto.getRandomValues(new Uint8Array(31)); // 31 bytes to stay under field
    const secretBytes = crypto.getRandomValues(new Uint8Array(31));

    const nullifier = new BN(nullifierBytes).toString();
    const secret = new BN(secretBytes).toString();

    // precommitment = Poseidon(nullifier, secret)
    const precommitment = wasm.poseidonHashString([nullifier, secret]);

    // commitment = Poseidon(value, precommitment)
    const commitment = wasm.poseidonHashString([value.toString(), precommitment]);

    return { commitment, nullifier, secret, precommitment };
  }

  // Encrypt output (simple XOR with shared secret for now - can be upgraded to proper encryption)
  encryptOutput(data: {
    value: bigint;
    nullifier: string;
    secret: string;
    leafIndex: number;
  }): Uint8Array {
    // Simple encoding: JSON → bytes (in production, use proper encryption)
    const json = JSON.stringify({
      value: data.value.toString(),
      nullifier: data.nullifier,
      secret: data.secret,
      leafIndex: data.leafIndex,
    });
    return new TextEncoder().encode(json);
  }

  // Get UTXOs by encrypted output range
  getEncryptedOutputsRange(start: number, end: number): {
    encrypted_outputs: string[];
    hasMore: boolean;
    total: number;
  } {
    const outputs: string[] = [];
    for (let i = start; i < Math.min(end, this.encryptedOutputsByIndex.length); i++) {
      if (this.encryptedOutputsByIndex[i]) {
        outputs.push(this.encryptedOutputsByIndex[i]);
      }
    }

    const total = this.commitmentsByIndex.length;
    return {
      encrypted_outputs: outputs,
      hasMore: end < total,
      total,
    };
  }

  // Check if UTXO exists
  async checkUtxoExists(encryptedOutput: string): Promise<boolean> {
    if (this.utxoIndex.has(encryptedOutput)) return true;

    // Re-index with retries
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      await this.indexCommitments();
      if (this.utxoIndex.has(encryptedOutput)) return true;
    }

    return false;
  }

  // Get commitment entry by encrypted output
  getCommitmentByEncryptedOutput(encryptedOutput: string): CommitmentEntry | undefined {
    return this.utxoIndex.get(encryptedOutput);
  }
}

// Singleton instance
let relayerCoreInstance: RelayerCore | null = null;

export async function getRelayerCore(): Promise<RelayerCore> {
  if (!relayerCoreInstance) {
    relayerCoreInstance = new RelayerCore();

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const executorKey = process.env.EXECUTOR_PRIVATE_KEY;

    await relayerCoreInstance.initialize(rpcUrl, executorKey);
  }
  return relayerCoreInstance;
}

export { RelayerCore };
