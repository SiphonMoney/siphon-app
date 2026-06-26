import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, createSyncNativeInstruction, createCloseAccountInstruction, getAccount, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { SiphonClient } from './siphon/client';
import { SUPPORTED_TOKENS, SIPHON_PROGRAM_ID } from './siphon/constants';
import { isDepositAllowed, isWithdrawalAllowed } from './range/client';

let siphonClient: SiphonClient | null = null;
// Initialize siphon client
export function initializeSiphonClient(provider: AnchorProvider): SiphonClient | null {
  try {
    siphonClient = new SiphonClient(provider);
    return siphonClient;
  } catch (error) {
    console.error('[Siphon] Failed to create client:', error);
    return null;
  }
}

// Get current client
export function getSiphonClient(): SiphonClient | null {
  return siphonClient;
}

// Token map for Solana (similar to ETH TOKEN_MAP)
export const SOLANA_TOKEN_MAP: Record<string, {
  symbol: string;
  mint: PublicKey;
  decimals: number;
}> = {
  SOL: SUPPORTED_TOKENS.SOL,
  USDC: SUPPORTED_TOKENS.USDC,
};

// Deposit to Siphon vault
async function wrapSol(
  provider: AnchorProvider,
  amount: BN
): Promise<string> {
  console.log('--- NEW WRAP SOL ---');
  const owner = provider.wallet.publicKey;
  const wSolMint = SUPPORTED_TOKENS.SOL.mint;

  // This is from SiphonClient.getOrCreateTokenAccount
  const ata = await getAssociatedTokenAddress(wSolMint, owner);
  const tx = new Transaction();

  try {
    await getAccount(provider.connection, ata);
  } catch {
    // Account doesn't exist, add instruction to create it to the main transaction
    console.log('wSOL token account does not exist, creating it...');
    const ix = createAssociatedTokenAccountInstruction(
      owner,
      ata,
      owner,
      wSolMint
    );
    tx.add(ix);
  }

  tx.add(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: ata,
      lamports: amount.toNumber(),
    }),
    createSyncNativeInstruction(ata)
  );

  return await provider.sendAndConfirm(tx);
}

export async function depositSolana(
  tokenSymbol: string,
  amount: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  console.log('depositSolana() called', { tokenSymbol, amount });

  if (!siphonClient) {
    console.error('Siphon client not initialized');
    return { success: false, error: 'Wallet not connected' };
  }

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    console.error(`Token not supported: ${tokenSymbol}`);
    return { success: false, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    const owner = siphonClient.provider.wallet.publicKey;

    // Range compliance check on deposit (screen sender address)
    const complianceCheck = await isDepositAllowed(owner.toBase58());
    if (!complianceCheck.allowed) {
      console.error('Deposit blocked by compliance:', complianceCheck.reason);
      return { success: false, error: `Compliance check failed: ${complianceCheck.reason}` };
    }
    console.log('Compliance check passed for deposit');

    // Check if vault exists, create if not
    const vaultExists = await siphonClient.vaultExists(owner, token.mint);
    if (!vaultExists) {
      console.log('Vault does not exist, creating...');
      await siphonClient.createVault(token.mint);
      console.log('Vault created successfully');
    }

    // Convert amount to smallest unit
    const amountBN = new BN(parseFloat(amount) * Math.pow(10, token.decimals));

    if (token.symbol === 'SOL') {
      try {
        console.log('Wrapping SOL...');
        await wrapSol(siphonClient.provider, amountBN);
        console.log('SOL wrapped successfully.');
      } catch(e) {
        console.error("Failed to wrap SOL", e);
        return { success: false, error: 'Failed to wrap SOL.' };
      }
    }

    console.log(`Depositing ${amount} ${token.symbol} (${amountBN.toString()} smallest units)`);
    const signature = await siphonClient.deposit(token.mint, amountBN);

    console.log('Deposit successful:', signature);
    return { success: true, signature };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Deposit failed';
    console.error('Deposit error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function unwrapSol(
  provider: AnchorProvider,
) {
  const owner = provider.wallet.publicKey;
  const wSolMint = SUPPORTED_TOKENS.SOL.mint;
  const ata = await getAssociatedTokenAddress(wSolMint, owner);

  try {
    const tx = new Transaction().add(
      createCloseAccountInstruction(ata, owner, owner)
    );
    await provider.sendAndConfirm(tx);
    console.log("wSOL unwrapped and account closed.");
  } catch (e) {
    // It's possible the account is already closed, or doesn't exist.
    // We can ignore this error.
    console.warn("Could not unwrap wSOL, account might not exist.", e);
  }
}

// Withdraw from Siphon vault (direct, non-private)
export async function withdrawSolana(
  tokenSymbol: string,
  amount: string,
  recipient?: string // recipient is optional for direct withdraw (goes to owner)
): Promise<{ success: boolean; signature?: string; error?: string }> {
  console.log('withdrawSolana() called', { tokenSymbol, amount, recipient });

  if (!siphonClient) {
    console.error('Siphon client not initialized');
    return { success: false, error: 'Wallet not connected' };
  }

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    console.error(`Token not supported: ${tokenSymbol}`);
    return { success: false, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    // Determine recipient address (defaults to owner if not specified)
    const owner = siphonClient.provider.wallet.publicKey;
    const recipientAddress = recipient || owner.toBase58();

    // Range compliance check on withdrawal (screen recipient address)
    const complianceCheck = await isWithdrawalAllowed(recipientAddress);
    if (!complianceCheck.allowed) {
      console.error('Withdrawal blocked by compliance:', complianceCheck.reason);
      return { success: false, error: `Compliance check failed: ${complianceCheck.reason}` };
    }
    console.log('Compliance check passed for withdrawal');

    // Convert amount to smallest unit
    const amountBN = new BN(parseFloat(amount) * Math.pow(10, token.decimals));

    console.log(`Withdrawing ${amount} ${token.symbol} (${amountBN.toString()} smallest units)`);
    const signature = await siphonClient.withdrawDirect(token.mint, amountBN);

    if (token.symbol === 'SOL') {
      await unwrapSol(siphonClient.provider);
    }

    console.log('Withdraw successful:', signature);
    return { success: true, signature };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Withdraw failed';
    console.error('Withdraw error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Get vault balance
export async function getVaultBalance(
  tokenSymbol: string
): Promise<{ balance: number; error?: string }> {
  if (!siphonClient) {
    return { balance: 0, error: 'Client not initialized' };
  }

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    return { balance: 0, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    const owner = siphonClient.provider.wallet.publicKey;
    const vault = await siphonClient.getVault(owner, token.mint);

    if (!vault) {
      return { balance: 0 };
    }

    const balance = vault.amount.toNumber() / Math.pow(10, token.decimals);
    return { balance };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to get balance';
    return { balance: 0, error: errorMsg };
  }
}

// Get all vault balances
export async function getAllVaultBalances(): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};

  for (const [symbol] of Object.entries(SOLANA_TOKEN_MAP)) {
    const result = await getVaultBalance(symbol);
    balances[symbol] = result.balance;
  }

  return balances;
}

// Check if protocol is initialized
export async function isProtocolInitialized(): Promise<boolean> {
  if (!siphonClient) return false;

  try {
    const config = await siphonClient.getConfig();
    return config !== null;
  } catch {
    return false;
  }
}

// Private withdrawal - transfers from vault PDA to executor, then Noir ZK pool deposit+withdraw
// Uses async job processing to avoid Vercel timeout issues
export async function withdrawPrivate(
  tokenSymbol: string,
  amount: string,
  recipientAddress: string,
  onProgress?: (step: string, progress: number) => void
): Promise<{ success: boolean; signature?: string; error?: string }> {
  console.log('[Privacy Withdraw] === Starting Private Withdrawal (Async) ===');
  console.log('[Privacy Withdraw] Token:', tokenSymbol, 'Amount:', amount, 'Recipient:', recipientAddress);

  if (!siphonClient) {
    return { success: false, error: 'Wallet not connected' };
  }

  const token = SOLANA_TOKEN_MAP[tokenSymbol.toUpperCase()];
  if (!token) {
    return { success: false, error: `Token not supported: ${tokenSymbol}` };
  }

  try {
    const owner = siphonClient.provider.wallet.publicKey;
    const amountBN = new BN(parseFloat(amount) * Math.pow(10, token.decimals));
    const recipientPubkey = new PublicKey(recipientAddress);

    // Step 1: Call initiatePrivateWithdrawal on-chain (user signs)
    // This transfers wSOL from vault PDA -> executor's token account
    console.log('[Privacy Withdraw] Step 1: Initiating on-chain private withdrawal...');
    onProgress?.('Initiating on-chain withdrawal', 5);

    const initSig = await siphonClient.initiatePrivateWithdrawal(
      token.mint,
      amountBN,
      recipientPubkey
    );
    console.log('[Privacy Withdraw] On-chain initiation succeeded, sig:', initSig);
    onProgress?.('On-chain initiation complete', 10);

    // Step 2: Create async job for backend processing
    console.log('[Privacy Withdraw] Step 2: Creating async withdrawal job...');
    const lamports = parseFloat(amount) * 1e9;

    // Get UTXOs from localStorage for the withdrawal
    const utxos = getStoredUtxos(tokenSymbol.toUpperCase());
    if (!utxos || utxos.length === 0) {
      console.warn('[Privacy Withdraw] No UTXOs found in localStorage, backend will use its own');
    }

    const createJobRes = await fetch('/api/noir-zk/withdraw-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenType: tokenSymbol.toUpperCase(),
        amount: tokenSymbol.toUpperCase() === 'SOL' ? lamports : parseFloat(amount),
        recipientAddress,
        ownerAddress: owner.toBase58(),
        utxos: utxos || [],
      }),
    });

    const jobResponse = await createJobRes.json();
    if (!jobResponse.success) {
      return { success: false, error: jobResponse.error || 'Failed to create withdrawal job' };
    }

    const jobId = jobResponse.jobId;
    console.log('[Privacy Withdraw] Job created:', jobId);
    onProgress?.('Withdrawal job created', 15);

    // Step 3: Process job in chunks by repeatedly calling process-job
    let attempts = 0;
    const maxAttempts = 30; // Maximum 30 calls (should be plenty)

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Privacy Withdraw] Processing job (attempt ${attempts})...`);

      const processRes = await fetch('/api/noir-zk/process-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      const processResult = await processRes.json();
      console.log('[Privacy Withdraw] Process result:', processResult);

      if (processResult.status === 'completed') {
        console.log('[Privacy Withdraw] === Private Withdrawal COMPLETE ===');
        onProgress?.('Complete', 100);
        return {
          success: true,
          signature: processResult.signature,
        };
      }

      if (processResult.status === 'failed') {
        console.error('[Privacy Withdraw] Job failed:', processResult.error);
        return { success: false, error: processResult.error };
      }

      // Update progress
      if (processResult.step && processResult.progress) {
        onProgress?.(processResult.step, processResult.progress);
      }

      // Wait before next call to avoid hammering the server
      await new Promise(r => setTimeout(r, 1000));
    }

    return { success: false, error: 'Withdrawal timed out after maximum attempts' };
  } catch (error) {
    console.error('[Privacy Withdraw] Exception caught:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Withdraw failed' };
  }
}

// Helper to get UTXOs from localStorage (for frontend)
function getStoredUtxos(tokenType: string): unknown[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('siphon_utxos');
    if (!stored) return [];
    const utxos = JSON.parse(stored);
    return utxos.filter((u: { tokenType: string; spent: boolean }) =>
      u.tokenType === tokenType && !u.spent
    );
  } catch {
    return [];
  }
}

// Deposit to ZK privacy pool via API route
export async function depositToPrivacyPool(
  tokenSymbol: string,
  amount: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  console.log('[depositToPrivacyPool] === Starting deposit to ZK pool ===');
  console.log('[depositToPrivacyPool] Token:', tokenSymbol, 'Amount:', amount);
  try {
    const lamports = parseFloat(amount) * 1e9; // Convert SOL to lamports
    const payload = {
      tokenType: tokenSymbol.toUpperCase(),
      amount: tokenSymbol.toUpperCase() === 'SOL' ? lamports : parseFloat(amount)
    };
    console.log('[depositToPrivacyPool] Sending payload:', JSON.stringify(payload));

    const res = await fetch('/api/noir-zk/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[depositToPrivacyPool] Response status:', res.status);
    const result = await res.json();
    console.log('[depositToPrivacyPool] Response body:', JSON.stringify(result));

    return result;
  } catch (error) {
    console.error('[depositToPrivacyPool] Exception:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Deposit failed' };
  }
}

// Get private balance via API route
export async function getPrivateBalance(
  tokenSymbol: string
): Promise<{ balance: number; error?: string }> {
  try {
    const res = await fetch(`/api/noir-zk/balance?tokenType=${tokenSymbol.toUpperCase()}`);
    const data = await res.json();
    if (data.success) {
      return { balance: data.amount || data.lamports / 1e9 };
    }
    return { balance: 0, error: data.error };
  } catch (error) {
    return { balance: 0, error: error instanceof Error ? error.message : 'Failed to get balance' };
  }
}

// Get all private balances via API route
export async function getAllPrivateBalances(): Promise<Record<string, number>> {
  try {
    const res = await fetch('/api/noir-zk/balance?tokenType=all');
    const data = await res.json();
    if (data.success && data.balances) {
      return {
        SOL: data.balances.SOL?.amount || 0,
        USDC: data.balances.USDC?.amount || 0,
      };
    }
    return { SOL: 0, USDC: 0 };
  } catch {
    return { SOL: 0, USDC: 0 };
  }
}

// Export program ID for reference
export { SIPHON_PROGRAM_ID };
