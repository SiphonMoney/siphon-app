import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { initializeBackendClient, getBackendClient } from '@/lib/noir-zk/client';
import { NEXT_PUBLIC_SOLANA_RPC_URL } from '@/lib/config';

export const maxDuration = 60;

let isInitialized = false;

async function ensureInitialized() {
  console.log('[Noir ZK API] ensureInitialized called, isInitialized:', isInitialized);

  if (isInitialized) {
    console.log('[Noir ZK API] Returning existing client');
    return getBackendClient();
  }

  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  const rpcUrl = NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  console.log('[Noir ZK API] EXECUTOR_PRIVATE_KEY exists:', !!privateKey);
  console.log('[Noir ZK API] EXECUTOR_PRIVATE_KEY length:', privateKey?.length);
  console.log('[Noir ZK API] RPC URL:', rpcUrl);

  if (!privateKey) {
    console.error('[Noir ZK API] EXECUTOR_PRIVATE_KEY not configured');
    throw new Error('EXECUTOR_PRIVATE_KEY not configured');
  }

  console.log('[Noir ZK API] Initializing backend client...');
  const client = await initializeBackendClient({ rpcUrl, privateKey });
  isInitialized = true;
  console.log('[Noir ZK API] Withdraw client initialized (embedded relayer)');
  return client;
}

export async function POST(request: NextRequest) {
  console.log('[Noir ZK API] POST /api/noir-zk/withdraw called');

  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Noir ZK API] Failed to parse request body:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { tokenType, amount, recipientAddress, mintAddress, utxos } = body;

    console.log('[Noir ZK API] Request body:', { tokenType, amount, recipientAddress, mintAddress, utxoCount: utxos?.length });

    if (!tokenType || amount === undefined || !recipientAddress) {
      console.error('[Noir ZK API] Missing required fields');
      return NextResponse.json(
        { success: false, error: 'Missing tokenType, amount, or recipientAddress' },
        { status: 400 }
      );
    }

    if (!utxos || !Array.isArray(utxos) || utxos.length === 0) {
      console.error('[Noir ZK API] No UTXOs provided');
      return NextResponse.json(
        { success: false, error: 'No UTXOs provided for withdrawal' },
        { status: 400 }
      );
    }

    try {
      new PublicKey(recipientAddress);
    } catch {
      console.error('[Noir ZK API] Invalid recipient address:', recipientAddress);
      return NextResponse.json(
        { success: false, error: 'Invalid recipient address' },
        { status: 400 }
      );
    }

    console.log('[Noir ZK API] About to initialize client...');
    let client;
    try {
      client = await ensureInitialized();
      console.log('[Noir ZK API] Client initialized successfully');
    } catch (initError) {
      console.error('[Noir ZK API] Client initialization failed:', initError);
      return NextResponse.json(
        { success: false, error: `Initialization failed: ${initError instanceof Error ? initError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    if (tokenType === 'SOL') {
      console.log(`[Noir ZK API] Withdrawing ${amount} lamports SOL to ${recipientAddress} using ${utxos.length} UTXO(s)`);
      const result = await client.withdrawSOL({
        lamports: amount,
        recipientAddress,
        utxos
      });
      return NextResponse.json(result);
    } else if (tokenType === 'USDC' || tokenType === 'USDT') {
      // For SPL tokens, use the mint address from the request
      if (!mintAddress) {
        return NextResponse.json(
          { success: false, error: 'Missing mintAddress for SPL token withdrawal' },
          { status: 400 }
        );
      }

      console.log(`[Noir ZK API] Withdrawing ${amount} ${tokenType} (${mintAddress}) to ${recipientAddress}`);
      const result = await client.withdrawSPL({
        amount,
        mintAddress: new PublicKey(mintAddress),
        recipientAddress,
        utxos
      });
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported token type: ${tokenType}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Noir ZK API] Withdraw error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Withdraw failed' },
      { status: 500 }
    );
  }
}
