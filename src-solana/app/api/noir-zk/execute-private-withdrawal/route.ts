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

function getExecutorKeypair(): Keypair {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[Execute Private Withdrawal] EXECUTOR_PRIVATE_KEY is not set in environment');
    throw new Error('EXECUTOR_PRIVATE_KEY not configured.');
  }

  console.log('[Execute Private Withdrawal] EXECUTOR_PRIVATE_KEY found, length:', privateKey.length);

  try {
    if (privateKey.startsWith('[')) {
      const parsed = JSON.parse(privateKey);
      console.log('[Execute Private Withdrawal] Parsed as JSON array, length:', parsed.length);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
    const decoded = bs58.decode(privateKey);
    console.log('[Execute Private Withdrawal] Decoded from base58, byte length:', decoded.length);
    return Keypair.fromSecretKey(decoded);
  } catch (e) {
    console.error('[Execute Private Withdrawal] Failed to parse private key:', e);
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
  const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_API_URL || 'http://localhost:4000';

  if (!privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY not configured');
  }

  const client = await initializeBackendClient({ rpcUrl, privateKey, relayerUrl });
  isInitialized = true;
  return client;
}

/**
 * POST /api/noir-zk/execute-private-withdrawal
 *
 * Called AFTER the frontend has already called initiatePrivateWithdrawal on-chain,
 * which moves wSOL from vault PDA -> executor's wSOL token account.
 *
 * This route then:
 * 1. Unwraps executor's wSOL to native SOL
 * 2. Deposits SOL to ZK pool (generates commitment, Noir proof)
 * 3. Withdraws from ZK pool to recipient (generates withdrawal proof, Groth16 verified)
 * 4. Calls completePrivateWithdrawal on-chain
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenType, amount, recipientAddress, ownerAddress } = body;

    if (!tokenType || amount === undefined || !recipientAddress || !ownerAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing tokenType, amount, recipientAddress, or ownerAddress' },
        { status: 400 }
      );
    }

    let ownerPubkey: PublicKey;
    try {
      new PublicKey(recipientAddress); // Validate recipient address format
      ownerPubkey = new PublicKey(ownerAddress);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid address' },
        { status: 400 }
      );
    }

    const rpcUrl = NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const executor = getExecutorKeypair();

    console.log('[Execute Private Withdrawal] Starting (Noir ZK)...');
    console.log('[Execute Private Withdrawal] Token:', tokenType, 'Amount:', amount, 'Recipient:', recipientAddress);
    console.log('[Execute Private Withdrawal] Executor:', executor.publicKey.toBase58());

    // Step 1: Unwrap wSOL to native SOL
    if (tokenType === 'SOL') {
      console.log('[Execute Private Withdrawal] Step 1: Unwrapping wSOL...');
      const executorWsolAta = await getAssociatedTokenAddress(NATIVE_SOL_MINT, executor.publicKey);

      try {
        const ataInfo = await getAccount(connection, executorWsolAta);
        console.log('[Execute Private Withdrawal] wSOL ATA balance:', ataInfo.amount.toString());

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
        console.log('[Execute Private Withdrawal] wSOL unwrapped, sig:', unwrapSig);
      } catch (e) {
        console.warn('[Execute Private Withdrawal] wSOL unwrap skipped:', e);
      }
    }

    // Step 2: Deposit to Noir ZK pool (commitment generated, inserted into Merkle tree)
    console.log('[Execute Private Withdrawal] Step 2: Depositing to ZK pool...');
    const noirZkClient = await ensureNoirZkInitialized();

    let depositResult;
    if (tokenType === 'SOL') {
      depositResult = await noirZkClient.depositSOL({ lamports: amount });
    } else {
      return NextResponse.json(
        { success: false, error: `Token type ${tokenType} not yet supported for private withdrawal` },
        { status: 400 }
      );
    }

    if (!depositResult.success) {
      console.error('[Execute Private Withdrawal] ZK pool deposit failed:', depositResult.error);
      return NextResponse.json(
        { success: false, error: `ZK pool deposit failed: ${depositResult.error}` },
        { status: 500 }
      );
    }
    console.log('[Execute Private Withdrawal] ZK pool deposit succeeded:', depositResult.signature);

    // Wait for deposit to be indexed by relayer
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Withdraw from ZK pool to recipient (Noir proof generated, Groth16 verified)
    console.log('[Execute Private Withdrawal] Step 3: Withdrawing to recipient via ZK proof...');
    let withdrawResult;
    if (tokenType === 'SOL') {
      withdrawResult = await noirZkClient.withdrawSOL({
        lamports: amount,
        recipientAddress,
      });
    } else {
      return NextResponse.json(
        { success: false, error: `Token type ${tokenType} not yet supported` },
        { status: 400 }
      );
    }

    if (!withdrawResult.success) {
      console.error('[Execute Private Withdrawal] ZK pool withdrawal failed:', withdrawResult.error);
      return NextResponse.json(
        { success: false, error: `ZK pool withdrawal failed: ${withdrawResult.error}` },
        { status: 500 }
      );
    }
    console.log('[Execute Private Withdrawal] ZK withdrawal succeeded:', withdrawResult.signature);

    // Step 4: Call completePrivateWithdrawal on-chain
    console.log('[Execute Private Withdrawal] Step 4: Completing on-chain...');
    try {
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
      // @ts-expect-error - Anchor Program constructor signature varies by version
      const program = new Program(idl as Idl, provider);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completeSig = await (program.methods as any)
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

      console.log('[Execute Private Withdrawal] On-chain completion sig:', completeSig);
    } catch (e) {
      console.error('[Execute Private Withdrawal] completePrivateWithdrawal on-chain failed:', e);
      console.warn('[Execute Private Withdrawal] Funds were sent to recipient but vault state may need manual update');
    }

    console.log('[Execute Private Withdrawal] === Complete (Noir ZK) ===');
    return NextResponse.json({
      success: true,
      signature: withdrawResult.signature,
      depositSignature: depositResult.signature,
      proof: withdrawResult.proof,
    });
  } catch (error) {
    console.error('[Execute Private Withdrawal] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Execute private withdrawal failed' },
      { status: 500 }
    );
  }
}
