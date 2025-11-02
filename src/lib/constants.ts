// constants.ts - Environment and configuration constants
import { PublicKey } from '@solana/web3.js';

// Environment variables
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || '8ndLKjoaUcjDTrL6Bsw3xkyafTV87ZC5XPUgf6AFJP6N');
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || 'devnet';

// Token mints
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT_DEVNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Constants
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const USDC_DECIMALS = 6;

// MXE Account PDA derivation
export function getMXEAccAddress(programId: PublicKey): PublicKey {
  const [mxeAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('mxe_account')],
    programId
  );
  return mxeAccountPDA;
}

// User Ledger PDA derivation
export function getUserLedgerAddress(userPubkey: PublicKey, programId: PublicKey): PublicKey {
  const [ledgerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_ledger'), userPubkey.toBuffer()],
    programId
  );
  return ledgerPDA;
}

// Order Account PDA derivation
export function getOrderAccountAddress(orderId: bigint, userPubkey: PublicKey, programId: PublicKey): PublicKey {
  const orderIdBuffer = Buffer.alloc(8);
  orderIdBuffer.writeBigUInt64LE(orderId);
  
  const [orderPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('order'),
      orderIdBuffer,
      userPubkey.toBuffer(),
    ],
    programId
  );
  return orderPDA;
}

