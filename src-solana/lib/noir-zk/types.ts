import { PublicKey } from '@solana/web3.js';

// --- ZK Proof Types ---

export interface NoirProof {
  proof: Uint8Array;
  publicInputs: {
    withdrawnValue: bigint;
    stateRoot: bigint;
    newCommitment: bigint;
    nullifierHash: bigint;
  };
}

export interface CommitmentData {
  commitment: bigint;
  nullifier: bigint;
  secret: bigint;
  value: bigint;
  leafIndex: number;
}

export interface MerkleProof {
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
}

// --- Deposit/Withdraw Params ---

export interface DepositParams {
  lamports: number;
}

export interface WithdrawParams {
  lamports: number;
  recipientAddress: string;
  utxos?: Array<{
    commitment: string;
    nullifier: string;
    secret: string;
    value: string;
    leafIndex: number;
  }>;
}

export interface DepositSPLParams {
  amount: number;
  mintAddress: PublicKey;
}

export interface WithdrawSPLParams {
  amount: number;
  mintAddress: PublicKey;
  recipientAddress: string;
  utxos?: Array<{
    commitment: string;
    nullifier: string;
    secret: string;
    value: string;
    leafIndex: number;
  }>;
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
  proof?: string; // hex-encoded proof for on-chain verification
}

// --- Siphon Vault Types ---

export interface SiphonVault {
  owner: PublicKey;
  assetMint: PublicKey;
  amount: number;
  privacyPoolAmount: number;
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

// Token mints on mainnet
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
