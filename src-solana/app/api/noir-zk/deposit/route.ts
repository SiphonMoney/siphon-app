import { NextRequest, NextResponse } from 'next/server';
import { initializeBackendClient, getBackendClient } from '@/lib/noir-zk/client';
import { NEXT_PUBLIC_SOLANA_RPC_URL } from '@/lib/config';

let isInitialized = false;

async function ensureInitialized() {
  if (isInitialized) {
    return getBackendClient();
  }

  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  const rpcUrl = NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  if (!privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY not configured');
  }

  // No relayerUrl needed - logic is now embedded in the client
  const client = await initializeBackendClient({ rpcUrl, privateKey });
  isInitialized = true;
  console.log('[Noir ZK API] Client initialized (embedded relayer)');
  return client;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenType, amount } = body;

    if (!tokenType || amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing tokenType or amount' },
        { status: 400 }
      );
    }

    const client = await ensureInitialized();

    if (tokenType === 'SOL') {
      console.log(`[Noir ZK API] Depositing ${amount} lamports SOL`);
      const result = await client.depositSOL({ lamports: amount });
      return NextResponse.json(result);
    } else if (tokenType === 'USDC') {
      console.log(`[Noir ZK API] Depositing ${amount} USDC`);
      const result = await client.depositUSDC(amount);
      return NextResponse.json(result);
    } else if (tokenType === 'USDT') {
      console.log(`[Noir ZK API] Depositing ${amount} USDT`);
      const result = await client.depositUSDT(amount);
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported token type: ${tokenType}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Noir ZK API] Deposit error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Deposit failed' },
      { status: 500 }
    );
  }
}
