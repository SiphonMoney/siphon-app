import { NextRequest, NextResponse } from 'next/server';
import { initializeBackendClient, getBackendClient } from '@/lib/noir-zk/client';

let isInitialized = false;

async function ensureInitialized() {
  if (isInitialized) {
    return getBackendClient();
  }

  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  if (!privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY not configured');
  }

  // No relayerUrl needed - logic is now embedded in the client
  const client = await initializeBackendClient({ rpcUrl, privateKey });
  isInitialized = true;
  console.log('[Noir ZK API] Balance client initialized (embedded relayer)');
  return client;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenType = searchParams.get('tokenType') || 'SOL';

    const client = await ensureInitialized();

    if (tokenType === 'SOL') {
      console.log('[Noir ZK API] Getting SOL balance');
      const balance = await client.getPrivateBalanceSOL();
      return NextResponse.json({
        success: true,
        tokenType: 'SOL',
        lamports: balance.lamports,
        amount: balance.lamports / 1e9,
      });
    } else if (tokenType === 'USDC') {
      console.log('[Noir ZK API] Getting USDC balance');
      const balance = await client.getPrivateUSDCBalance();
      return NextResponse.json({
        success: true,
        tokenType: 'USDC',
        amount: balance,
      });
    } else if (tokenType === 'USDT') {
      console.log('[Noir ZK API] Getting USDT balance');
      const balance = await client.getPrivateUSDTBalance();
      return NextResponse.json({
        success: true,
        tokenType: 'USDT',
        amount: balance,
      });
    } else if (tokenType === 'all') {
      console.log('[Noir ZK API] Getting all balances');
      const [solBalance, usdcBalance, usdtBalance] = await Promise.all([
        client.getPrivateBalanceSOL(),
        client.getPrivateUSDCBalance(),
        client.getPrivateUSDTBalance(),
      ]);
      return NextResponse.json({
        success: true,
        balances: {
          SOL: { lamports: solBalance.lamports, amount: solBalance.lamports / 1e9 },
          USDC: { amount: usdcBalance },
          USDT: { amount: usdtBalance },
        }
      });
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported token type: ${tokenType}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Noir ZK API] Balance error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get balance' },
      { status: 500 }
    );
  }
}
