/**
 * Noir ZK Client - Backend client for Siphon's ZK privacy layer
 *
 * This client embeds all relayer logic directly (Poseidon Merkle tree,
 * commitment indexing, proof generation) so no separate server is needed.
 * Just run `npm run dev` and deposits/withdrawals work.
 */

import { PublicKey, Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  DepositParams,
  WithdrawParams,
  DepositSPLParams,
  WithdrawSPLParams,
  PrivateBalance,
  PrivateBalanceSPL,
  TransactionResult,
  TOKEN_MINTS,
} from './types';
import { getRelayerCore } from './relayer-core';
import { getZkPoolClient } from './zk-pool-client';
import {
  addUtxo,
  markUtxoSpent,
  getUnspentUtxos,
  getTotalBalance,
} from './utxo-storage';

export interface NoirZkConfig {
  rpcUrl: string;
  privateKey?: string;
  relayerUrl?: string; // Kept for backwards compatibility, but not used
}

function privateKeyToKeypair(privateKey: string): Keypair {
  if (privateKey.startsWith('[')) {
    try {
      const secretKeyArray = JSON.parse(privateKey);
      return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch (e) {
      console.error('[Noir ZK] Failed to parse as JSON array:', e);
    }
  }

  try {
    const secretKey = bs58.decode(privateKey);
    if (secretKey.length !== 64) {
      throw new Error(`Invalid secret key length: ${secretKey.length}, expected 64`);
    }
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    console.error('[Noir ZK] Failed to parse as base58:', e);
  }

  throw new Error(`Invalid private key format. Length: ${privateKey.length}. Expected base58 string (88 chars) or JSON array [64 numbers].`);
}

export class NoirZkClient {
  private config: NoirZkConfig;
  private connection: Connection;
  private keypair: Keypair | null = null;

  constructor(config: NoirZkConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, 'confirmed');
  }

  async initialize(): Promise<void> {
    if (!this.config.privateKey) {
      throw new Error('Private key required to initialize Noir ZK client');
    }

    this.keypair = privateKeyToKeypair(this.config.privateKey);
    console.log('[Noir ZK] Client initialized with wallet:', this.keypair.publicKey.toBase58());

    // Initialize the embedded relayer core
    const relayer = await getRelayerCore();
    const treeState = await relayer.getTreeState();
    console.log('[Noir ZK] Connected to ZK pool, next index:', treeState.nextIndex);
  }

  private ensureInitialized(): Keypair {
    if (!this.keypair) {
      throw new Error('Noir ZK client not initialized. Call initialize() first.');
    }
    return this.keypair;
  }

  /**
   * Deposit SOL into the ZK privacy pool.
   *
   * Flow:
   * 1. Generate commitment (value, nullifier, secret) via Poseidon
   * 2. Send deposit transaction on-chain
   * 3. Store UTXO data for future withdrawals
   */
  async depositSOL(params: DepositParams): Promise<TransactionResult> {
    try {
      this.ensureInitialized();
      console.log(`[Noir ZK] Depositing ${params.lamports / LAMPORTS_PER_SOL} SOL to ZK pool`);

      const zkClient = await getZkPoolClient();
      const result = await zkClient.depositSOL(params.lamports);

      if (result.success && result.commitment && result.nullifier && result.secret) {
        // Store UTXO for future withdrawals
        const utxo = {
          commitment: result.commitment,
          nullifier: result.nullifier,
          secret: result.secret,
          value: params.lamports.toString(),
          leafIndex: result.leafIndex!,
          encryptedOutput: result.encryptedOutput!,
          spent: false,
          tokenType: 'SOL' as const,
        };

        addUtxo(utxo);

        console.log(`[Noir ZK] Deposit succeeded, commitment: ${result.commitment.substring(0, 16)}...`);

        // Return UTXO data so frontend can store it in localStorage
        return {
          success: true,
          signature: result.signature,
          utxo,
        };
      }

      return { success: false, error: result.error || 'Deposit failed' };
    } catch (error) {
      console.error('[Noir ZK] Deposit SOL error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Withdraw SOL from the ZK privacy pool.
   *
   * Flow:
   * 1. Find unspent UTXO with sufficient balance
   * 2. Generate Merkle proof
   * 3. Submit withdrawal transaction
   * 4. Mark UTXO as spent
   */
  async withdrawSOL(params: WithdrawParams): Promise<TransactionResult> {
    try {
      this.ensureInitialized();
      console.log(`[Noir ZK] Withdrawing ${params.lamports / LAMPORTS_PER_SOL} SOL to ${params.recipientAddress}`);

      // Use UTXOs from params if provided (for backend relayer), otherwise load from localStorage (for frontend)
      const unspent = params.utxos || getUnspentUtxos('SOL');
      if (unspent.length === 0) {
        return { success: false, error: 'No unspent UTXOs available' };
      }

      // Find UTXO with sufficient balance (simple greedy approach)
      const utxo = unspent.find(u => BigInt(u.value) >= BigInt(params.lamports));
      if (!utxo) {
        const totalBalance = params.utxos
          ? unspent.reduce((sum, u) => sum + BigInt(u.value), 0n)
          : getTotalBalance('SOL');
        return {
          success: false,
          error: `Insufficient balance. Requested: ${params.lamports}, Available: ${totalBalance}`,
        };
      }

      const zkClient = await getZkPoolClient();
      const result = await zkClient.withdrawSOL(params.recipientAddress, params.lamports, {
        commitment: utxo.commitment,
        nullifier: utxo.nullifier,
        secret: utxo.secret,
        value: utxo.value,
      });

      if (result.success) {
        // Mark UTXO as spent
        markUtxoSpent(utxo.commitment);
        console.log(`[Noir ZK] Withdrawal succeeded`);
        return {
          success: true,
          signature: result.signature,
        };
      }

      return { success: false, error: result.error || 'Withdrawal failed' };
    } catch (error) {
      console.error('[Noir ZK] Withdraw SOL error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getPrivateBalanceSOL(): Promise<PrivateBalance> {
    try {
      this.ensureInitialized();
      const balance = getTotalBalance('SOL');
      return { lamports: Number(balance) };
    } catch (error) {
      console.error('[Noir ZK] Failed to get private balance:', error);
      return { lamports: 0 };
    }
  }

  // --- SPL Token methods (simplified for now) ---

  async depositSPL(params: DepositSPLParams): Promise<TransactionResult> {
    try {
      this.ensureInitialized();
      const mintAddress = params.mintAddress.toBase58();
      console.log(`[Noir ZK] Depositing ${params.amount} tokens (mint: ${mintAddress}) to ZK pool`);

      const zkClient = await getZkPoolClient();

      // Currently only USDC is supported
      const { DEVNET_TOKEN_MINTS } = await import('./types');
      if (params.mintAddress.equals(DEVNET_TOKEN_MINTS.USDC)) {
        const result = await zkClient.depositUSDC(params.amount);

        if (result.success && result.commitment && result.nullifier && result.secret) {
          const utxo = {
            commitment: result.commitment,
            nullifier: result.nullifier,
            secret: result.secret,
            value: params.amount.toString(),
            leafIndex: result.leafIndex!,
            encryptedOutput: result.encryptedOutput!,
            spent: false,
            tokenType: 'SPL' as const,
            mint: mintAddress,
          };

          addUtxo(utxo);
          console.log(`[Noir ZK] SPL deposit succeeded, commitment: ${result.commitment.substring(0, 16)}...`);

          return {
            success: true,
            signature: result.signature,
            utxo,
          };
        }

        return { success: false, error: result.error || 'SPL deposit failed' };
      } else {
        return { success: false, error: 'Only USDC is supported for SPL deposits on devnet' };
      }
    } catch (error) {
      console.error('[Noir ZK] Deposit SPL error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async withdrawSPL(params: WithdrawSPLParams): Promise<TransactionResult> {
    try {
      this.ensureInitialized();
      const mintAddress = params.mintAddress.toBase58();
      console.log(`[Noir ZK] Withdrawing ${params.amount} tokens (mint: ${mintAddress}) to ${params.recipientAddress}`);

      // Use UTXOs from params if provided (for backend relayer), otherwise load from localStorage (for frontend)
      const unspent = params.utxos || getUnspentUtxos('SPL', mintAddress);
      if (unspent.length === 0) {
        return { success: false, error: 'No unspent UTXOs available for this token' };
      }

      const utxo = unspent.find(u => BigInt(u.value) >= BigInt(params.amount));
      if (!utxo) {
        const totalBalance = getTotalBalance('SPL', mintAddress);
        return {
          success: false,
          error: `Insufficient balance. Requested: ${params.amount}, Available: ${totalBalance}`,
        };
      }

      const zkClient = await getZkPoolClient();

      // Currently only USDC is supported
      const { DEVNET_TOKEN_MINTS } = await import('./types');
      if (params.mintAddress.equals(DEVNET_TOKEN_MINTS.USDC)) {
        const result = await zkClient.withdrawUSDC(params.amount, params.recipientAddress, {
          commitment: utxo.commitment,
          nullifier: utxo.nullifier,
          secret: utxo.secret,
          value: utxo.value,
        });

        if (result.success) {
          markUtxoSpent(utxo.commitment);
          console.log(`[Noir ZK] SPL withdrawal succeeded: ${result.signature}`);
          return { success: true, signature: result.signature };
        }

        return { success: false, error: result.error || 'SPL withdrawal failed' };
      } else {
        return { success: false, error: 'Only USDC is supported for SPL withdrawals on devnet' };
      }
    } catch (error) {
      console.error('[Noir ZK] Withdraw SPL error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getPrivateBalanceSPL(mintAddress: PublicKey): Promise<PrivateBalanceSPL> {
    const balance = getTotalBalance('SPL', mintAddress.toBase58());
    return { amount: Number(balance), mintAddress };
  }

  // --- Helpers ---

  async depositUSDC(amount: number): Promise<TransactionResult> {
    return this.depositSPL({ amount, mintAddress: TOKEN_MINTS.USDC });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async withdrawUSDC(amount: number, recipientAddress: string, utxos?: any[]): Promise<TransactionResult> {
    return this.withdrawSPL({ amount, mintAddress: TOKEN_MINTS.USDC, recipientAddress, utxos });
  }

  async getPrivateUSDCBalance(): Promise<number> {
    const balance = await this.getPrivateBalanceSPL(TOKEN_MINTS.USDC);
    return balance.amount;
  }

  async depositUSDT(amount: number): Promise<TransactionResult> {
    return this.depositSPL({ amount, mintAddress: TOKEN_MINTS.USDT });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async withdrawUSDT(amount: number, recipientAddress: string, utxos?: any[]): Promise<TransactionResult> {
    return this.withdrawSPL({ amount, mintAddress: TOKEN_MINTS.USDT, recipientAddress, utxos });
  }

  async getPrivateUSDTBalance(): Promise<number> {
    const balance = await this.getPrivateBalanceSPL(TOKEN_MINTS.USDT);
    return balance.amount;
  }

  // --- Pool info ---

  async getPoolBalance(): Promise<number> {
    const zkClient = await getZkPoolClient();
    return zkClient.getPoolBalance();
  }

  async getMerkleRoot(): Promise<string> {
    const relayer = await getRelayerCore();
    return relayer.getMerkleRoot();
  }

  async getNextIndex(): Promise<number> {
    const relayer = await getRelayerCore();
    return relayer.getNextIndex();
  }
}

// --- Singleton for backend ---

let backendClient: NoirZkClient | null = null;

export function getBackendClient(config?: NoirZkConfig): NoirZkClient {
  if (!backendClient && config) {
    backendClient = new NoirZkClient(config);
  }
  if (!backendClient) {
    throw new Error('Noir ZK client not initialized. Provide config on first call.');
  }
  return backendClient;
}

export async function initializeBackendClient(config: NoirZkConfig): Promise<NoirZkClient> {
  backendClient = new NoirZkClient(config);
  await backendClient.initialize();
  return backendClient;
}
