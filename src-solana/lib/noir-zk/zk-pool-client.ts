/**
 * ZK Pool Client - Direct on-chain interaction with siphon-zk-pool program
 *
 * Uses Anchor to build and send transactions for deposits, withdrawals,
 * and root updates. No separate relayer server required.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import {
  getRelayerCore,
  ZK_POOL_PROGRAM_ID,
  getMerkleTreePDA,
  getPoolConfigPDA,
  getPoolVaultPDA,
  getPoolTokenAccountPDA,
  getNullifierPDA,
  getCommitmentRecordPDA,
} from './relayer-core';
import { TransactionResult } from './types';

// Import the IDL
import idl from '../siphon/zk-pool-idl.json';

// Fee recipient (same as in create-alt.js)
const FEE_RECIPIENT = new PublicKey('DTqtRSGtGf414yvMPypCv2o1P8trwb9SJXibxLgAWYhw');

export interface DepositResult {
  success: boolean;
  signature?: string;
  commitment?: string;
  nullifier?: string;
  secret?: string;
  encryptedOutput?: string;
  leafIndex?: number;
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  signature?: string;
  nullifierHash?: string;
  error?: string;
}

export class ZkPoolClient {
  private connection: Connection;
  private executorKeypair: Keypair;
  private program: Program;

  constructor(connection: Connection, executorKeypair: Keypair) {
    this.connection = connection;
    this.executorKeypair = executorKeypair;

    // Create a wallet adapter for Anchor
    const wallet: Wallet = {
      publicKey: executorKeypair.publicKey,
      signTransaction: async (tx: any) => {
        if (tx instanceof VersionedTransaction) {
          tx.sign([executorKeypair]);
        } else {
          tx.partialSign(executorKeypair);
        }
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        return txs.map(tx => {
          if (tx instanceof VersionedTransaction) {
            tx.sign([executorKeypair]);
          } else {
            tx.partialSign(executorKeypair);
          }
          return tx;
        });
      },
      payer: executorKeypair,
    };

    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });

    // @ts-ignore - IDL type compatibility
    this.program = new Program(idl, ZK_POOL_PROGRAM_ID, provider);
  }

  /**
   * Deposit SOL into the ZK pool.
   *
   * Flow:
   * 1. Generate commitment (value, nullifier, secret) via Poseidon
   * 2. Build deposit_sol instruction
   * 3. Send transaction
   * 4. Return commitment data for wallet storage
   */
  async depositSOL(lamports: number): Promise<DepositResult> {
    try {
      const relayer = await getRelayerCore();

      // Get next leaf index from on-chain state
      const nextIndex = await relayer.getNextIndex();
      console.log(`[ZkPoolClient] Depositing ${lamports / LAMPORTS_PER_SOL} SOL, leaf index: ${nextIndex}`);

      // Generate commitment
      const { commitment, nullifier, secret, precommitment } = await relayer.generateCommitment(BigInt(lamports));

      // Convert commitment to bytes
      const commitmentBN = new BN(commitment);
      const commitmentBytes = commitmentBN.toArray('be', 32);

      // Create encrypted output (for client-side UTXO management)
      const encryptedOutput = relayer.encryptOutput({
        value: BigInt(lamports),
        nullifier,
        secret,
        leafIndex: nextIndex,
      });

      // Derive PDAs
      const [merkleTreePDA] = getMerkleTreePDA();
      const [poolConfigPDA] = getPoolConfigPDA();
      const [poolVaultPDA] = getPoolVaultPDA();
      const [commitmentRecordPDA] = getCommitmentRecordPDA(nextIndex);

      // Build transaction
      const tx = await this.program.methods
        .depositSol(
          commitmentBytes,
          Buffer.from(encryptedOutput),
          new BN(lamports),
          new BN(nextIndex)
        )
        .accounts({
          depositor: this.executorKeypair.publicKey,
          poolConfig: poolConfigPDA,
          merkleTree: merkleTreePDA,
          poolVault: poolVaultPDA,
          commitmentRecord: commitmentRecordPDA,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Add compute budget
      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      );

      // Sign and send
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.executorKeypair.publicKey;
      tx.sign(this.executorKeypair);

      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });

      console.log(`[ZkPoolClient] Deposit tx submitted: ${signature}`);

      // Wait for confirmation
      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log(`[ZkPoolClient] Deposit confirmed: ${signature}`);

      // Re-index commitments to pick up the new one
      await relayer.indexCommitments();

      return {
        success: true,
        signature,
        commitment,
        nullifier,
        secret,
        encryptedOutput: Buffer.from(encryptedOutput).toString('hex'),
        leafIndex: nextIndex,
      };
    } catch (error) {
      console.error('[ZkPoolClient] Deposit SOL error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deposit failed',
      };
    }
  }

  /**
   * Withdraw SOL from the ZK pool.
   *
   * Flow:
   * 1. Get Merkle proof for commitment
   * 2. Compute nullifier hash
   * 3. Build withdraw_sol instruction
   * 4. Send transaction
   */
  async withdrawSOL(
    recipientAddress: string,
    lamports: number,
    commitmentData: {
      commitment: string;
      nullifier: string;
      secret: string;
      value: string;
    }
  ): Promise<WithdrawResult> {
    try {
      const relayer = await getRelayerCore();
      const recipient = new PublicKey(recipientAddress);

      console.log(`[ZkPoolClient] Withdrawing ${lamports / LAMPORTS_PER_SOL} SOL to ${recipientAddress}`);

      // Generate Merkle proof
      const proof = await relayer.generateMerkleProof(commitmentData.commitment);

      // Compute nullifier hash = Poseidon(nullifier)
      const nullifierHash = await relayer.poseidonHash([commitmentData.nullifier]);
      const nullifierHashBN = new BN(nullifierHash);
      const nullifierHashBytes = nullifierHashBN.toArray('be', 32);

      // Get state root (from proof)
      const stateRootBN = new BN(proof.root);
      const stateRootBytes = stateRootBN.toArray('be', 32);

      // For partial withdrawals, compute new commitment
      // For full withdrawals, new commitment is zero
      const originalValue = BigInt(commitmentData.value);
      const withdrawValue = BigInt(lamports);
      const changeValue = originalValue - withdrawValue;

      let newCommitmentBytes: number[];
      if (changeValue > 0n) {
        // Partial withdrawal - generate change commitment
        const changeCommitment = await relayer.generateCommitment(changeValue);
        const changeCommitmentBN = new BN(changeCommitment.commitment);
        newCommitmentBytes = changeCommitmentBN.toArray('be', 32);
      } else {
        // Full withdrawal - no change
        newCommitmentBytes = new Array(32).fill(0);
      }

      // Calculate fee (25 bps = 0.25%)
      const fee = Math.floor(lamports * 25 / 10000);
      const amountAfterFee = lamports - fee;

      // Derive PDAs
      const [merkleTreePDA] = getMerkleTreePDA();
      const [poolConfigPDA] = getPoolConfigPDA();
      const [poolVaultPDA] = getPoolVaultPDA();
      const [nullifierPDA] = getNullifierPDA(new Uint8Array(nullifierHashBytes));

      // Fetch PoolConfig to get the fee_recipient
      const poolConfigAccount = await this.connection.getAccountInfo(poolConfigPDA);
      if (!poolConfigAccount) {
        throw new Error('PoolConfig account not found');
      }

      // PoolConfig layout (Borsh): 8 (disc) + 32 (admin) + 32 (relayer) + 2 (fee_bps) + 32 (fee_recipient) + ...
      const feeRecipientOffset = 8 + 32 + 32 + 2;
      const feeRecipientBytes = poolConfigAccount.data.slice(feeRecipientOffset, feeRecipientOffset + 32);
      const feeRecipient = new PublicKey(feeRecipientBytes);

      console.log(`[ZkPoolClient] Using fee_recipient from PoolConfig: ${feeRecipient.toBase58()}`);

      // Build WithdrawInputs struct
      const withdrawInputs = {
        nullifierHash: nullifierHashBytes,
        stateRoot: stateRootBytes,
        newCommitment: newCommitmentBytes,
      };

      // Build transaction
      const tx = await this.program.methods
        .withdrawSol(
          withdrawInputs,
          recipient,
          new BN(amountAfterFee),
          new BN(fee)
        )
        .accounts({
          relayer: this.executorKeypair.publicKey,
          poolConfig: poolConfigPDA,
          merkleTree: merkleTreePDA,
          poolVault: poolVaultPDA,
          nullifierAccount: nullifierPDA,
          recipient,
          feeRecipient,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Add compute budget
      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })
      );

      // Sign and send
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.executorKeypair.publicKey;
      tx.sign(this.executorKeypair);

      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });

      console.log(`[ZkPoolClient] Withdraw tx submitted: ${signature}`);

      // Wait for confirmation
      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log(`[ZkPoolClient] Withdraw confirmed: ${signature}`);

      // Re-index to pick up any new commitment (change output)
      await relayer.indexCommitments();

      return {
        success: true,
        signature,
        nullifierHash,
      };
    } catch (error) {
      console.error('[ZkPoolClient] Withdraw SOL error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed',
      };
    }
  }

  /**
   * Push a new Merkle root on-chain (relayer only).
   */
  async updateRoot(newRoot: string): Promise<TransactionResult> {
    try {
      const newRootBN = new BN(newRoot);
      const newRootBytes = newRootBN.toArray('be', 32);

      const [merkleTreePDA] = getMerkleTreePDA();
      const [poolConfigPDA] = getPoolConfigPDA();

      const tx = await this.program.methods
        .updateRoot(newRootBytes)
        .accounts({
          relayer: this.executorKeypair.publicKey,
          poolConfig: poolConfigPDA,
          merkleTree: merkleTreePDA,
        })
        .transaction();

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.executorKeypair.publicKey;
      tx.sign(this.executorKeypair);

      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log(`[ZkPoolClient] Root updated: ${signature}`);

      return { success: true, signature };
    } catch (error) {
      console.error('[ZkPoolClient] Update root error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Root update failed',
      };
    }
  }

  /**
   * Deposit USDC into the ZK pool.
   */
  async depositUSDC(amount: number): Promise<DepositResult> {
    try {
      const { DEVNET_TOKEN_MINTS } = await import('./types');
      const usdcMint = DEVNET_TOKEN_MINTS.USDC;

      const relayer = await getRelayerCore();
      const nextIndex = await relayer.getNextIndex();
      console.log(`[ZkPoolClient] Depositing ${amount} USDC, leaf index: ${nextIndex}`);

      // Generate commitment
      const { commitment, nullifier, secret } = await relayer.generateCommitment(BigInt(amount));

      const commitmentBN = new BN(commitment);
      const commitmentBytes = commitmentBN.toArray('be', 32);

      const encryptedOutput = relayer.encryptOutput({
        value: BigInt(amount),
        nullifier,
        secret,
        leafIndex: nextIndex,
      });

      // Derive PDAs
      const [merkleTreePDA] = getMerkleTreePDA();
      const [poolConfigPDA] = getPoolConfigPDA();
      const [poolVaultPDA] = getPoolVaultPDA();
      const [commitmentRecordPDA] = getCommitmentRecordPDA(nextIndex);

      // Pool token account is an ATA owned by poolVault
      const poolTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        poolVaultPDA,
        true // allowOwnerOffCurve - allow PDA as owner
      );

      // Get depositor's token account
      const depositorTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        this.executorKeypair.publicKey
      );

      // Build transaction
      const tx = await this.program.methods
        .depositSpl(
          commitmentBytes,
          Buffer.from(encryptedOutput),
          new BN(amount),
          new BN(nextIndex)
        )
        .accounts({
          depositor: this.executorKeypair.publicKey,
          poolConfig: poolConfigPDA,
          merkleTree: merkleTreePDA,
          tokenMint: usdcMint,
          depositorTokenAccount,
          poolTokenAccount: poolTokenAccount,
          poolVault: poolVaultPDA,
          commitmentRecord: commitmentRecordPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.executorKeypair.publicKey;
      tx.sign(this.executorKeypair);

      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });

      console.log(`[ZkPoolClient] USDC deposit tx submitted: ${signature}`);

      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log(`[ZkPoolClient] USDC deposit confirmed: ${signature}`);

      await relayer.indexCommitments();

      return {
        success: true,
        signature,
        commitment,
        nullifier,
        secret,
        encryptedOutput: Buffer.from(encryptedOutput).toString('hex'),
        leafIndex: nextIndex,
      };
    } catch (error) {
      console.error('[ZkPoolClient] Deposit USDC error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'USDC deposit failed',
      };
    }
  }

  /**
   * Withdraw USDC from the ZK pool.
   */
  async withdrawUSDC(
    amount: number,
    recipientAddress: string,
    commitmentData: {
      commitment: string;
      nullifier: string;
      secret: string;
      value: string;
    }
  ): Promise<WithdrawResult> {
    try {
      const { DEVNET_TOKEN_MINTS } = await import('./types');
      const usdcMint = DEVNET_TOKEN_MINTS.USDC;

      const relayer = await getRelayerCore();
      const recipient = new PublicKey(recipientAddress);

      console.log(`[ZkPoolClient] Withdrawing ${amount} USDC to ${recipientAddress}`);

      // Generate Merkle proof
      const proof = await relayer.generateMerkleProof(commitmentData.commitment);

      // Compute nullifier hash
      const nullifierHash = await relayer.poseidonHash([commitmentData.nullifier]);
      const nullifierHashBN = new BN(nullifierHash);
      const nullifierHashBytes = nullifierHashBN.toArray('be', 32);

      // Get state root
      const stateRootBN = new BN(proof.root);
      const stateRootBytes = stateRootBN.toArray('be', 32);

      // Handle change commitment
      const originalValue = BigInt(commitmentData.value);
      const withdrawValue = BigInt(amount);
      const changeValue = originalValue - withdrawValue;

      let newCommitmentBytes: number[];
      if (changeValue > 0n) {
        const changeCommitment = await relayer.generateCommitment(changeValue);
        const changeCommitmentBN = new BN(changeCommitment.commitment);
        newCommitmentBytes = changeCommitmentBN.toArray('be', 32);
      } else {
        newCommitmentBytes = new Array(32).fill(0);
      }

      // Calculate fee (25 bps = 0.25%)
      const fee = Math.floor(amount * 25 / 10000);
      const amountAfterFee = amount - fee;

      // Derive PDAs
      const [merkleTreePDA] = getMerkleTreePDA();
      const [poolConfigPDA] = getPoolConfigPDA();
      const [poolVaultPDA] = getPoolVaultPDA();
      const [nullifierPDA] = getNullifierPDA(new Uint8Array(nullifierHashBytes));

      // Pool token account is an ATA owned by poolVault (same as deposit)
      const poolTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        poolVaultPDA,
        true // allowOwnerOffCurve - allow PDA as owner
      );

      // Get recipient's token account
      const recipientTokenAccount = await getAssociatedTokenAddress(usdcMint, recipient);

      // Check if recipient's token account exists
      const recipientAccountInfo = await this.connection.getAccountInfo(recipientTokenAccount);
      const recipientTokenAccountExists = recipientAccountInfo !== null;
      if (recipientTokenAccountExists) {
        console.log('[ZkPoolClient] Recipient token account exists');
      } else {
        console.log('[ZkPoolClient] Recipient token account does not exist, will create');
      }

      // Fetch fee_recipient from PoolConfig
      const poolConfigAccount = await this.connection.getAccountInfo(poolConfigPDA);
      if (!poolConfigAccount) {
        throw new Error('PoolConfig account not found');
      }

      const feeRecipientOffset = 8 + 32 + 32 + 2;
      const feeRecipientBytes = poolConfigAccount.data.slice(feeRecipientOffset, feeRecipientOffset + 32);
      const feeRecipient = new PublicKey(feeRecipientBytes);

      // Get fee recipient's token account
      const feeRecipientTokenAccount = await getAssociatedTokenAddress(usdcMint, feeRecipient);

      // Check if fee recipient's token account exists
      const feeRecipientAccountInfo = await this.connection.getAccountInfo(feeRecipientTokenAccount);
      const feeRecipientTokenAccountExists = feeRecipientAccountInfo !== null;
      if (feeRecipientTokenAccountExists) {
        console.log('[ZkPoolClient] Fee recipient token account exists');
      } else {
        console.log('[ZkPoolClient] Fee recipient token account does not exist, will create');
      }

      // Build WithdrawInputs
      const withdrawInputs = {
        nullifierHash: nullifierHashBytes,
        stateRoot: stateRootBytes,
        newCommitment: newCommitmentBytes,
      };

      // Build withdrawal instruction (not transaction yet)
      const withdrawIx = await this.program.methods
        .withdrawSpl(
          withdrawInputs,
          recipient,
          new BN(amountAfterFee),
          new BN(fee)
        )
        .accounts({
          relayer: this.executorKeypair.publicKey,
          poolConfig: poolConfigPDA,
          merkleTree: merkleTreePDA,
          poolVault: poolVaultPDA,
          tokenMint: usdcMint,
          poolTokenAccount: poolTokenAccount,
          recipientTokenAccount,
          feeRecipientTokenAccount,
          nullifierAccount: nullifierPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Build transaction with instructions in correct order
      const tx = new Transaction();

      // 1. Compute budget
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));

      // 2. Create recipient token account if it doesn't exist (BEFORE withdrawal)
      if (!recipientTokenAccountExists) {
        console.log('[ZkPoolClient] Adding instruction to create recipient token account');
        const createRecipientTokenAccountIx = createAssociatedTokenAccountInstruction(
          this.executorKeypair.publicKey, // payer (executor pays for account creation)
          recipientTokenAccount, // ata
          recipient, // owner (recipient owns their token account)
          usdcMint // mint
        );
        tx.add(createRecipientTokenAccountIx);
      }

      // 3. Create fee recipient token account if it doesn't exist (BEFORE withdrawal)
      if (!feeRecipientTokenAccountExists) {
        console.log('[ZkPoolClient] Adding instruction to create fee recipient token account');
        const createFeeRecipientTokenAccountIx = createAssociatedTokenAccountInstruction(
          this.executorKeypair.publicKey, // payer (executor pays for account creation)
          feeRecipientTokenAccount, // ata
          feeRecipient, // owner (fee recipient owns their token account)
          usdcMint // mint
        );
        tx.add(createFeeRecipientTokenAccountIx);
      }

      // 4. Add withdrawal instruction (AFTER creating accounts)
      tx.add(withdrawIx);

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.executorKeypair.publicKey;
      tx.sign(this.executorKeypair);

      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });

      console.log(`[ZkPoolClient] USDC withdraw tx submitted: ${signature}`);

      await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log(`[ZkPoolClient] USDC withdraw confirmed: ${signature}`);

      await relayer.indexCommitments();

      return {
        success: true,
        signature,
        nullifierHash,
      };
    } catch (error) {
      console.error('[ZkPoolClient] Withdraw USDC error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'USDC withdrawal failed',
      };
    }
  }

  /**
   * Get pool vault balance.
   */
  async getPoolBalance(): Promise<number> {
    const [poolVaultPDA] = getPoolVaultPDA();
    const balance = await this.connection.getBalance(poolVaultPDA);
    return balance;
  }
}

// Singleton instance
let zkPoolClientInstance: ZkPoolClient | null = null;

export async function getZkPoolClient(): Promise<ZkPoolClient> {
  if (!zkPoolClientInstance) {
    const relayer = await getRelayerCore();
    const connection = relayer.getConnection();
    const executorKeypair = relayer.getExecutorKeypair();

    zkPoolClientInstance = new ZkPoolClient(connection, executorKeypair);
  }
  return zkPoolClientInstance;
}
