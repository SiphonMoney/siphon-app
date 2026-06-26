import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { createJob } from '@/lib/noir-zk/job-store';

export const maxDuration = 10; // Fast endpoint - just creates the job

/**
 * POST /api/noir-zk/withdraw-async
 *
 * Creates a withdrawal job and returns immediately with a job ID.
 * The actual processing happens via /api/noir-zk/process-job endpoint.
 *
 * Request body:
 * - tokenType: 'SOL' | 'USDC' | 'USDT'
 * - amount: number (lamports for SOL, base units for tokens)
 * - recipientAddress: string
 * - ownerAddress: string (vault owner)
 * - mintAddress?: string (for SPL tokens)
 * - utxos?: array (UTXO data for withdrawal)
 *
 * Response:
 * - success: true
 * - jobId: string
 * - message: string
 */
export async function POST(request: NextRequest) {
  console.log('[Withdraw Async] POST called');

  try {
    const body = await request.json();
    const { tokenType, amount, recipientAddress, ownerAddress, mintAddress, utxos } = body;

    console.log('[Withdraw Async] Request:', { tokenType, amount, recipientAddress, ownerAddress, utxoCount: utxos?.length });

    // Validate required fields
    if (!tokenType || amount === undefined || !recipientAddress || !ownerAddress) {
      console.error('[Withdraw Async] Missing required fields');
      return NextResponse.json(
        { success: false, error: 'Missing tokenType, amount, recipientAddress, or ownerAddress' },
        { status: 400 }
      );
    }

    // Validate addresses
    try {
      new PublicKey(recipientAddress);
      new PublicKey(ownerAddress);
      if (mintAddress) new PublicKey(mintAddress);
    } catch {
      console.error('[Withdraw Async] Invalid address');
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Validate UTXOs for private withdrawal
    if (!utxos || !Array.isArray(utxos) || utxos.length === 0) {
      console.error('[Withdraw Async] No UTXOs provided');
      return NextResponse.json(
        { success: false, error: 'No UTXOs provided for withdrawal' },
        { status: 400 }
      );
    }

    // Create the job
    const job = createJob({
      tokenType,
      amount,
      recipientAddress,
      ownerAddress,
      mintAddress,
      utxos,
    });

    console.log('[Withdraw Async] Job created:', job.id);

    // Return immediately with job ID
    // Frontend should poll /api/noir-zk/job-status/[jobId] for progress
    // Then call /api/noir-zk/process-job to actually process
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Withdrawal job created. Poll /api/noir-zk/job-status/{jobId} for progress, then call /api/noir-zk/process-job to process.',
    });
  } catch (error) {
    console.error('[Withdraw Async] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create withdrawal job' },
      { status: 500 }
    );
  }
}