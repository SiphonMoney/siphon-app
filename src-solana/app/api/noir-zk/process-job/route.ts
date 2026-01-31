import { NextRequest, NextResponse } from 'next/server';
import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
} from '@solana/web3.js';
import { NEXT_PUBLIC_SOLANA_RPC_URL } from '@/lib/config';
import {
  getAssociatedTokenAddress,
  createCloseAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { AnchorProvider, Program, Wallet, Idl } from '@coral-xyz/anchor';
import { initializeBackendClient, getBackendClient } from '@/lib/noir-zk/client';
import bs58 from 'bs58';
import idlJson from '@/lib/siphon/idl.json';
import { SIPHON_PROGRAM_ID, NATIVE_SOL_MINT, CONFIG_SEED, VAULT_SEED, WITHDRAWAL_SEED } from '@/lib/siphon/constants';
import { getJob, updateJob, WithdrawalJob } from '@/lib/noir-zk/job-store';

export const maxDuration = 60;

function getExecutorKeypair(): Keypair {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY not configured');
  }

  try {
    if (privateKey.startsWith('[')) {
      const parsed = JSON.parse(privateKey);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
    return Keypair.fromSecretKey(bs58.decode(privateKey));
  } catch (e) {
    throw new Error(`Failed to parse EXECUTOR_PRIVATE_KEY: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

let isInitialized = false;

async function ensureNoirZkInitialized() {
  if (isInitialized) {
    return getBackendClient();
  }

  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  const rpcUrl = NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  if (!privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY not configured');
  }

  const client = await initializeBackendClient({ rpcUrl, privateKey });
  isInitialized = true;
  return client;
}

/**
 * POST /api/noir-zk/process-job
 *
 * Processes a withdrawal job step by step. Call this repeatedly until job.status === 'completed'.
 *
 * Request body:
 * - jobId: string
 *
 * This endpoint processes one step at a time to stay within timeout limits.
 * Frontend should:
 * 1. Create job via /withdraw-async
 * 2. Call /process-job repeatedly
 * 3. Poll /job-status/[jobId] between calls to check progress
 */
export async function POST(request: NextRequest) {
  console.log('[Process Job] POST called');

  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Missing jobId' },
        { status: 400 }
      );
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // If job is already completed or failed, return current state
    if (job.status === 'completed') {
      return NextResponse.json({
        success: true,
        status: 'completed',
        signature: job.signature,
        depositSignature: job.depositSignature,
      });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        success: false,
        status: 'failed',
        error: job.error,
      });
    }

    // Mark as processing
    updateJob(jobId, { status: 'processing' });

    const rpcUrl = NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const executor = getExecutorKeypair();

    // Process based on current step
    const currentProgress = job.progress;

    try {
      // Step 1: Unwrap wSOL (0-20%)
      if (currentProgress < 20 && job.tokenType === 'SOL') {
        console.log('[Process Job] Step 1: Unwrapping wSOL...');
        updateJob(jobId, { step: 'Unwrapping wSOL', progress: 5 });

        const executorWsolAta = await getAssociatedTokenAddress(NATIVE_SOL_MINT, executor.publicKey);

        try {
          const ataInfo = await getAccount(connection, executorWsolAta);
          console.log('[Process Job] wSOL ATA balance:', ataInfo.amount.toString());

          const unwrapTx = new Transaction().add(
            createCloseAccountInstruction(
              executorWsolAta,
              executor.publicKey,
              executor.publicKey
            )
          );
          unwrapTx.feePayer = executor.publicKey;
          unwrapTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          unwrapTx.sign(executor);
          const unwrapSig = await connection.sendRawTransaction(unwrapTx.serialize());
          await connection.confirmTransaction(unwrapSig, 'confirmed');
          console.log('[Process Job] wSOL unwrapped:', unwrapSig);
        } catch (e) {
          console.warn('[Process Job] wSOL unwrap skipped (may not exist):', e);
        }

        updateJob(jobId, { step: 'wSOL unwrapped', progress: 20 });
        return NextResponse.json({
          success: true,
          status: 'processing',
          step: 'wSOL unwrapped',
          progress: 20,
          message: 'Continue calling /process-job',
        });
      }

      // Step 2: Initialize ZK client and deposit (20-50%)
      if (currentProgress < 50) {
        console.log('[Process Job] Step 2: Initializing ZK client and depositing...');
        updateJob(jobId, { step: 'Initializing ZK client', progress: 25 });

        const noirZkClient = await ensureNoirZkInitialized();
        updateJob(jobId, { step: 'Depositing to ZK pool', progress: 30 });

        let depositResult;
        if (job.tokenType === 'SOL') {
          depositResult = await noirZkClient.depositSOL({ lamports: job.amount });
        } else {
          updateJob(jobId, { status: 'failed', error: `Token type ${job.tokenType} not supported` });
          return NextResponse.json({
            success: false,
            status: 'failed',
            error: `Token type ${job.tokenType} not supported`,
          });
        }

        if (!depositResult.success) {
          updateJob(jobId, { status: 'failed', error: depositResult.error });
          return NextResponse.json({
            success: false,
            status: 'failed',
            error: depositResult.error,
          });
        }

        updateJob(jobId, {
          step: 'ZK deposit complete',
          progress: 50,
          depositSignature: depositResult.signature,
        });

        return NextResponse.json({
          success: true,
          status: 'processing',
          step: 'ZK deposit complete',
          progress: 50,
          depositSignature: depositResult.signature,
          message: 'Continue calling /process-job',
        });
      }

      // Step 3: Withdraw from ZK pool (50-85%)
      if (currentProgress < 85) {
        console.log('[Process Job] Step 3: Withdrawing from ZK pool...');
        updateJob(jobId, { step: 'Generating ZK proof and withdrawing', progress: 55 });

        const noirZkClient = await ensureNoirZkInitialized();

        let withdrawResult;
        if (job.tokenType === 'SOL') {
          withdrawResult = await noirZkClient.withdrawSOL({
            lamports: job.amount,
            recipientAddress: job.recipientAddress,
            utxos: job.utxos as Parameters<typeof noirZkClient.withdrawSOL>[0]['utxos'],
          });
        } else {
          updateJob(jobId, { status: 'failed', error: `Token type ${job.tokenType} not supported` });
          return NextResponse.json({
            success: false,
            status: 'failed',
            error: `Token type ${job.tokenType} not supported`,
          });
        }

        if (!withdrawResult.success) {
          updateJob(jobId, { status: 'failed', error: withdrawResult.error });
          return NextResponse.json({
            success: false,
            status: 'failed',
            error: withdrawResult.error,
          });
        }

        updateJob(jobId, {
          step: 'ZK withdrawal complete',
          progress: 85,
          signature: withdrawResult.signature,
        });

        return NextResponse.json({
          success: true,
          status: 'processing',
          step: 'ZK withdrawal complete',
          progress: 85,
          signature: withdrawResult.signature,
          message: 'Continue calling /process-job',
        });
      }

      // Step 4: Complete on-chain (85-100%)
      if (currentProgress < 100) {
        console.log('[Process Job] Step 4: Completing on-chain...');
        updateJob(jobId, { step: 'Completing on-chain', progress: 90 });

        try {
          const ownerPubkey = new PublicKey(job.ownerAddress);
          const assetMint = NATIVE_SOL_MINT;

          const [configPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(CONFIG_SEED)],
            SIPHON_PROGRAM_ID
          );
          const [vaultPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), ownerPubkey.toBuffer(), assetMint.toBuffer()],
            SIPHON_PROGRAM_ID
          );
          const [withdrawalPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(WITHDRAWAL_SEED), vaultPDA.toBuffer()],
            SIPHON_PROGRAM_ID
          );

          const wallet = {
            publicKey: executor.publicKey,
            signTransaction: async (tx: Transaction) => {
              tx.partialSign(executor);
              return tx;
            },
            signAllTransactions: async (txs: Transaction[]) => {
              txs.forEach(tx => tx.partialSign(executor));
              return txs;
            },
          } as Wallet;

          const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const idl = idlJson as any;
          if (!idl.address) {
            idl.address = SIPHON_PROGRAM_ID.toBase58();
          }
          const program = new Program(idl as Idl, SIPHON_PROGRAM_ID, provider);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (program.methods as any)
            .completePrivateWithdrawal()
            .accounts({
              executor: executor.publicKey,
              config: configPDA,
              vault: vaultPDA,
              pendingWithdrawal: withdrawalPDA,
              refundRecipient: ownerPubkey,
            })
            .signers([executor])
            .rpc();

          console.log('[Process Job] On-chain completion done');
        } catch (e) {
          console.warn('[Process Job] completePrivateWithdrawal failed (funds already sent):', e);
        }

        const updatedJob = updateJob(jobId, {
          status: 'completed',
          step: 'Complete',
          progress: 100,
        }) as WithdrawalJob;

        return NextResponse.json({
          success: true,
          status: 'completed',
          step: 'Complete',
          progress: 100,
          signature: updatedJob.signature,
          depositSignature: updatedJob.depositSignature,
        });
      }
    } catch (error) {
      console.error('[Process Job] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateJob(jobId, { status: 'failed', error: errorMessage });
      return NextResponse.json({
        success: false,
        status: 'failed',
        error: errorMessage,
      });
    }

    return NextResponse.json({
      success: true,
      status: job.status,
      step: job.step,
      progress: job.progress,
    });
  } catch (error) {
    console.error('[Process Job] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process job' },
      { status: 500 }
    );
  }
}