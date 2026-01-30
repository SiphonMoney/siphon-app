import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
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
  console.log('[Noir ZK API] Withdraw client initialized (embedded relayer)');
  return client;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenType, amount, recipientAddress, mintAddress, utxos } = body;

    if (!tokenType || amount === undefined || !recipientAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing tokenType, amount, or recipientAddress' },
        { status: 400 }
      );
    }

    if (!utxos || !Array.isArray(utxos) || utxos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No UTXOs provided for withdrawal' },
        { status: 400 }
      );
    }

    try {
      new PublicKey(recipientAddress);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid recipient address' },
        { status: 400 }
      );
    }

    const client = await ensureInitialized();

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
