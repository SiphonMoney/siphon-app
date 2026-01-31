/**
 * Client-side ZK Pool Deposit - User signs with their wallet
 * Generates commitment/nullifier client-side for privacy.
 * User's wallet signs and pays for the transaction.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  TransactionSignature,
} from '@solana/web3.js';

/**
 * Polling-based transaction confirmation to avoid WebSocket issues in browsers.
 * The standard confirmTransaction uses WebSocket which has bufferUtil issues.
 */
async function confirmTransactionPolling(
  connection: Connection,
  signature: TransactionSignature,
  blockhash: string,
  lastValidBlockHeight: number,
  commitment: 'confirmed' | 'finalized' = 'confirmed'
): Promise<void> {
  const startTime = Date.now();
  const timeout = 60000; // 60 seconds

  while (Date.now() - startTime < timeout) {
    // Check if blockhash is still valid
    const blockHeight = await connection.getBlockHeight(commitment);
    if (blockHeight > lastValidBlockHeight) {
      throw new Error('Transaction expired: blockhash no longer valid');
    }

    // Check signature status
    const status = await connection.getSignatureStatus(signature);

    if (status.value !== null) {
      if (status.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }

      const confirmationStatus = status.value.confirmationStatus;
      if (commitment === 'confirmed' && (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized')) {
        return;
      }
      if (commitment === 'finalized' && confirmationStatus === 'finalized') {
        return;
      }
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Transaction confirmation timeout');
}
import { BN } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import {
  ZK_POOL_PROGRAM_ID,
  getMerkleTreePDA,
  getPoolConfigPDA,
  getPoolVaultPDA,
  getCommitmentRecordPDA,
} from './relayer-core';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';

// Import Poseidon hasher
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidonWasm: any = null;

async function ensurePoseidon() {
  if (!poseidonWasm) {
    const { WasmFactory } = await import('@lightprotocol/hasher.rs');
    poseidonWasm = await WasmFactory.getInstance();
    console.log('[Client Deposit] Poseidon hasher initialized');
  }
  return poseidonWasm;
}

// Generate commitment client-side (same logic as relayer-core but runs in browser)
async function generateCommitment(value: bigint): Promise<{
  commitment: string;
  nullifier: string;
  secret: string;
  precommitment: string;
}> {
  const wasm = await ensurePoseidon();

  // Generate random nullifier and secret (31 bytes to stay under BN254 field)
  const nullifierBytes = crypto.getRandomValues(new Uint8Array(31));
  const secretBytes = crypto.getRandomValues(new Uint8Array(31));

  const nullifier = new BN(nullifierBytes).toString();
  const secret = new BN(secretBytes).toString();

  // precommitment = Poseidon(nullifier, secret)
  const precommitment = wasm.poseidonHashString([nullifier, secret]);

  // commitment = Poseidon(value, precommitment)
  const commitment = wasm.poseidonHashString([value.toString(), precommitment]);

  return { commitment, nullifier, secret, precommitment };
}

// Encrypt output for storage
function encryptOutput(data: {
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

export interface ClientDepositResult {
  success: boolean;
  signature?: string;
  commitment?: string;
  nullifier?: string;
  secret?: string;
  encryptedOutput?: string;
  leafIndex?: number;
  error?: string;
}

/**
 * Deposit SOL to ZK pool - CLIENT-SIDE with user wallet signature
 */
export async function depositSOLClientSide(
  connection: Connection,
  wallet: WalletContextState,
  lamports: number
): Promise<ClientDepositResult> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    console.log(`[Client Deposit] Depositing ${lamports / LAMPORTS_PER_SOL} SOL`);

    // Generate commitment/nullifier client-side
    const { commitment, nullifier, secret } = await generateCommitment(BigInt(lamports));

    // Convert commitment to bytes
    const commitmentBN = new BN(commitment);
    const commitmentBytes = commitmentBN.toArray('be', 32);

    // Get PDAs
    const [poolConfig] = getPoolConfigPDA();
    const [merkleTree] = getMerkleTreePDA();
    const [poolVault] = getPoolVaultPDA();

    // Fetch next leaf index from on-chain state
    const merkleTreeAccount = await connection.getAccountInfo(merkleTree);
    if (!merkleTreeAccount) {
      return { success: false, error: 'Merkle tree not initialized' };
    }

    // Parse next_index from account data (offset 40, u64 LE)
    const nextIndex = new BN(merkleTreeAccount.data.slice(40, 48), 'le').toNumber();
    const [commitmentRecord] = getCommitmentRecordPDA(nextIndex);

    // Encrypt output
    const encryptedOutputBytes = encryptOutput({
      value: BigInt(lamports),
      nullifier,
      secret,
      leafIndex: nextIndex,
    });
    const encryptedOutput = Buffer.from(encryptedOutputBytes).toString('hex');

    // Build deposit_sol instruction
    // Instruction layout (Borsh): discriminator + commitment + vec<encrypted_output> + amount + leaf_index
    const discriminator = Buffer.from([
      0x6c, 0x51, 0x4e, 0x75, 0x7d, 0x9b, 0x38, 0xc8, // sha256("global:deposit_sol")[0..8]
    ]);

    // Allocate buffer: 8 (disc) + 32 (commitment) + 4 (vec len) + encrypted_output + 8 (amount) + 8 (leaf_index)
    const instructionData = Buffer.alloc(8 + 32 + 4 + encryptedOutputBytes.length + 8 + 8);
    let offset = 0;

    // Discriminator
    discriminator.copy(instructionData, offset);
    offset += 8;

    // Commitment [u8; 32]
    Buffer.from(commitmentBytes).copy(instructionData, offset);
    offset += 32;

    // Encrypted output Vec<u8> (length + data)
    instructionData.writeUInt32LE(encryptedOutputBytes.length, offset);
    offset += 4;
    Buffer.from(encryptedOutputBytes).copy(instructionData, offset);
    offset += encryptedOutputBytes.length;

    // Amount (u64 LE)
    instructionData.writeBigUInt64LE(BigInt(lamports), offset);
    offset += 8;

    // Leaf index (u64 LE)
    instructionData.writeBigUInt64LE(BigInt(nextIndex), offset);

    const depositIx = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // Depositor (user wallet!)
        { pubkey: poolConfig, isSigner: false, isWritable: false },
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        { pubkey: poolVault, isSigner: false, isWritable: true },
        { pubkey: commitmentRecord, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: ZK_POOL_PROGRAM_ID,
      data: instructionData,
    });

    // Build transaction
    const tx = new Transaction();

    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
    );

    tx.add(depositIx);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    // User signs with their wallet (Phantom popup!)
    console.log('[Client Deposit] Requesting wallet signature...');
    const signedTx = await wallet.signTransaction(tx);

    // Submit transaction
    console.log('[Client Deposit] Submitting transaction...');
    let signature: string;

    try {
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (sendError: unknown) {
      // Check if error is "already processed" - might indicate success
      const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
      if (errorMessage.includes('already been processed')) {
        console.log('[Client Deposit] Transaction may have already succeeded, checking on-chain state...');

        // Check if commitment was recorded on-chain
        const [checkCommitmentRecord] = getCommitmentRecordPDA(nextIndex);
        const recordInfo = await connection.getAccountInfo(checkCommitmentRecord);

        if (recordInfo) {
          // Transaction succeeded! Extract signature from error or generate a placeholder
          console.log('[Client Deposit] Confirmed - commitment record exists on-chain');
          return {
            success: true,
            signature: 'unknown', // We don't have the actual signature
            commitment,
            nullifier,
            secret,
            encryptedOutput,
            leafIndex: nextIndex,
          };
        }
      }

      // Re-throw if not a duplicate or if commitment wasn't recorded
      throw sendError;
    }

    // Wait for confirmation using polling (avoids WebSocket bufferUtil issues)
    await confirmTransactionPolling(connection, signature, blockhash, lastValidBlockHeight, 'confirmed');

    console.log(`[Client Deposit] Success! Signature: ${signature}`);

    return {
      success: true,
      signature,
      commitment,
      nullifier,
      secret,
      encryptedOutput,
      leafIndex: nextIndex,
    };
  } catch (error) {
    console.error('[Client Deposit] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deposit failed',
    };
  }
}

/**
 * Deposit SPL tokens (USDC) to ZK pool - CLIENT-SIDE with user wallet signature
 */
export async function depositSPLClientSide(
  connection: Connection,
  wallet: WalletContextState,
  mintAddress: PublicKey,
  amount: number, // In smallest units (e.g., 1000000 for 1 USDC)
  decimals: number
): Promise<ClientDepositResult> {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    console.log(`[Client Deposit SPL] Depositing ${amount / Math.pow(10, decimals)} tokens (${mintAddress.toBase58()})`);

    // Generate commitment/nullifier client-side
    const { commitment, nullifier, secret } = await generateCommitment(BigInt(amount));

    // Convert commitment to bytes
    const commitmentBN = new BN(commitment);
    const commitmentBytes = commitmentBN.toArray('be', 32);

    // Get PDAs
    const [poolConfig] = getPoolConfigPDA();
    const [merkleTree] = getMerkleTreePDA();
    const [poolVault] = getPoolVaultPDA();

    // Pool token account is an ATA owned by poolVault
    const poolTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      poolVault,
      true // allowOwnerOffCurve - allow PDA as owner
    );

    // Get user's token account
    const depositorTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      wallet.publicKey
    );

    // Check if pool token account exists, create if not
    let poolTokenAccountExists = false;
    try {
      await getAccount(connection, poolTokenAccount);
      poolTokenAccountExists = true;
      console.log('[Client Deposit SPL] Pool token account exists');
    } catch {
      console.log('[Client Deposit SPL] Pool token account does not exist, will create');
      poolTokenAccountExists = false;
    }

    // Fetch next leaf index from on-chain state
    const merkleTreeAccount = await connection.getAccountInfo(merkleTree);
    if (!merkleTreeAccount) {
      return { success: false, error: 'Merkle tree not initialized' };
    }

    // Parse next_index from account data (offset 40, u64 LE)
    const nextIndex = new BN(merkleTreeAccount.data.slice(40, 48), 'le').toNumber();
    const [commitmentRecord] = getCommitmentRecordPDA(nextIndex);

    // Encrypt output
    const encryptedOutputBytes = encryptOutput({
      value: BigInt(amount),
      nullifier,
      secret,
      leafIndex: nextIndex,
    });
    const encryptedOutput = Buffer.from(encryptedOutputBytes).toString('hex');

    // Build deposit_spl instruction
    // Instruction layout (Borsh): discriminator + commitment + vec<encrypted_output> + amount + leaf_index
    const discriminator = Buffer.from([
      0xe0, 0x00, 0xc6, 0xaf, 0xc6, 0x2f, 0x69, 0xcc, // sha256("global:deposit_spl")[0..8]
    ]);

    // Allocate buffer: 8 (disc) + 32 (commitment) + 4 (vec len) + encrypted_output + 8 (amount) + 8 (leaf_index)
    const instructionData = Buffer.alloc(8 + 32 + 4 + encryptedOutputBytes.length + 8 + 8);
    let offset = 0;

    // Discriminator
    discriminator.copy(instructionData, offset);
    offset += 8;

    // Commitment [u8; 32]
    Buffer.from(commitmentBytes).copy(instructionData, offset);
    offset += 32;

    // Encrypted output Vec<u8> (length + data)
    instructionData.writeUInt32LE(encryptedOutputBytes.length, offset);
    offset += 4;
    Buffer.from(encryptedOutputBytes).copy(instructionData, offset);
    offset += encryptedOutputBytes.length;

    // Amount (u64 LE)
    instructionData.writeBigUInt64LE(BigInt(amount), offset);
    offset += 8;

    // Leaf index (u64 LE)
    instructionData.writeBigUInt64LE(BigInt(nextIndex), offset);

    const depositIx = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // depositor
        { pubkey: poolConfig, isSigner: false, isWritable: false }, // poolConfig
        { pubkey: merkleTree, isSigner: false, isWritable: true }, // merkleTree
        { pubkey: mintAddress, isSigner: false, isWritable: false }, // tokenMint
        { pubkey: depositorTokenAccount, isSigner: false, isWritable: true }, // depositorTokenAccount
        { pubkey: poolTokenAccount, isSigner: false, isWritable: true }, // poolTokenAccount
        { pubkey: poolVault, isSigner: false, isWritable: false }, // poolVault
        { pubkey: commitmentRecord, isSigner: false, isWritable: true }, // commitmentRecord
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associatedTokenProgram
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
      ],
      programId: ZK_POOL_PROGRAM_ID,
      data: instructionData,
    });

    // Build transaction
    const tx = new Transaction();

    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
    );

    // Create pool token account if it doesn't exist
    if (!poolTokenAccountExists) {
      console.log('[Client Deposit SPL] Adding instruction to create pool token account');
      const createPoolTokenAccountIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey, // payer
        poolTokenAccount, // ata
        poolVault, // owner (pool vault is the owner)
        mintAddress // mint
      );
      tx.add(createPoolTokenAccountIx);
    }

    tx.add(depositIx);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    // User signs with their wallet (Phantom popup!)
    console.log('[Client Deposit SPL] Requesting wallet signature...');
    const signedTx = await wallet.signTransaction(tx);

    // Submit transaction
    console.log('[Client Deposit SPL] Submitting transaction...');
    let signature: string;

    try {
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (sendError: unknown) {
      // Check if error is "already processed" - might indicate success
      const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
      if (errorMessage.includes('already been processed')) {
        console.log('[Client Deposit SPL] Transaction may have already succeeded, checking on-chain state...');

        // Check if commitment was recorded on-chain
        const [checkCommitmentRecord] = getCommitmentRecordPDA(nextIndex);
        const recordInfo = await connection.getAccountInfo(checkCommitmentRecord);

        if (recordInfo) {
          console.log('[Client Deposit SPL] Confirmed - commitment record exists on-chain');
          return {
            success: true,
            signature: 'unknown',
            commitment,
            nullifier,
            secret,
            encryptedOutput,
            leafIndex: nextIndex,
          };
        }
      }

      throw sendError;
    }

    // Wait for confirmation using polling (avoids WebSocket bufferUtil issues)
    await confirmTransactionPolling(connection, signature, blockhash, lastValidBlockHeight, 'confirmed');

    console.log(`[Client Deposit SPL] Success! Signature: ${signature}`);

    return {
      success: true,
      signature,
      commitment,
      nullifier,
      secret,
      encryptedOutput,
      leafIndex: nextIndex,
    };
  } catch (error) {
    console.error('[Client Deposit SPL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deposit failed',
    };
  }
}
