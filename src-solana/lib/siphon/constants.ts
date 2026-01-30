import { PublicKey } from '@solana/web3.js';

// Program ID from deployment
export const SIPHON_PROGRAM_ID = new PublicKey('BpL3LVZdfz3LKvJXntAmFxAt7d8CHsWf65NCcsWB5em1');

// PDA Seeds
export const CONFIG_SEED = 'config';
export const VAULT_SEED = 'vault';
export const VAULT_TOKEN_SEED = 'vault_token';
export const WITHDRAWAL_SEED = 'withdrawal';

// Devnet token mints
export const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Token decimals
export const USDC_DECIMALS = 6;
export const SOL_DECIMALS = 9;

// Supported tokens
export const SUPPORTED_TOKENS = {
  SOL: {
    symbol: 'SOL',
    mint: NATIVE_SOL_MINT,
    decimals: SOL_DECIMALS,
  },
  USDC: {
    symbol: 'USDC',
    mint: DEVNET_USDC_MINT,
    decimals: USDC_DECIMALS,
  },
};
