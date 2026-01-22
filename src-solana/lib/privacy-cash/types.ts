import { PublicKey } from '@solana/web3.js';

export interface DepositParams {
  lamports: number;
}

export interface WithdrawParams {
  lamports: number;
  recipientAddress: string;
}

export interface DepositSPLParams {
  amount: number;
  mintAddress: PublicKey;
}

export interface WithdrawSPLParams {
  amount: number;
  mintAddress: PublicKey;
  recipientAddress: string;
}

export interface PrivateBalance {
  lamports: number;
}

export interface PrivateBalanceSPL {
  amount: number;
  mintAddress: PublicKey;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// siphon specific
export interface SiphonVault {
  owner: PublicKey;
  assetMint: PublicKey;
  amount: number; // Direct vault balance (lamports)
  privacyPoolAmount: number; // Amount in Privacy Cash
  strategies: number[];
  status: VaultStatus;
  createdAt: number;
}

export enum VaultStatus {
  Active = 'Active',
  PendingPrivateWithdrawal = 'PendingPrivateWithdrawal',
  Frozen = 'Frozen',
}

export interface Strategy {
  id: number;
  vaultOwner: string;
  assetMint: string;
  conditionType: ConditionType;
  encryptedBounds: string;
  status: StrategyStatus;
  createdAt: number;
}

export enum ConditionType {
  PriceAbove = 'PriceAbove',
  PriceBelow = 'PriceBelow',
  PriceRange = 'PriceRange',
}

export enum StrategyStatus {
  Active = 'Active',
  Executed = 'Executed',
  Cancelled = 'Cancelled',
}

// token mints on mainnet
export const TOKEN_MINTS = {
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
};

// Devnet token mints
export const DEVNET_TOKEN_MINTS = {
  USDC: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
};
