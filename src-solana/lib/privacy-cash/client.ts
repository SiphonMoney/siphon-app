// for backend -> initialize with private key
// for frontend -> initialize with wallet adapter

import { PublicKey, Connection } from '@solana/web3.js';
import { PrivacyCash } from 'privacycash';
import {
  DepositParams,
  WithdrawParams,
  DepositSPLParams,
  WithdrawSPLParams,
  PrivateBalance,
  PrivateBalanceSPL,
  TransactionResult,
  TOKEN_MINTS,
} from './types';

export interface PrivacyCashConfig {
  rpcUrl: string;
  privateKey?: string; // For backend-> private key as string
}

export class PrivacyCashClient {
  private config: PrivacyCashConfig;
  private connection: Connection;
  private client: PrivacyCash | null = null;

  constructor(config: PrivacyCashConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, 'confirmed');
  }

  // Init privacy cash client
  async initialize(): Promise<void> {
    if (!this.config.privateKey) {
      throw new Error('Private key required to initialize privacy cash client');
    }
    this.client = new PrivacyCash({
      RPC_url: this.config.rpcUrl,
      owner: this.config.privateKey,
    });
    console.log('Privacy cash client initialized');
  }

  private ensureClient(): PrivacyCash {
    if (!this.client) {
      throw new Error('Privacy cash client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  // Deposit SOL into privacy cash pool
  async depositSOL(params: DepositParams): Promise<TransactionResult> {
    try {
      const client = this.ensureClient();
      const result = await client.deposit({ lamports: params.lamports });
      console.log(`Deposited ${params.lamports / 1e9} SOL to privacy cash`);
      console.log('Result:', result);
      return {
        success: true,
        signature: result?.toString() || 'completed',
      };
    } catch (error) {
      console.error('Deposit SOL failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Withdraw SOL from privacy cash pool
  async withdrawSOL(params: WithdrawParams): Promise<TransactionResult> {
    try {
      const client = this.ensureClient();
      const result = await client.withdraw({
        lamports: params.lamports,
        recipientAddress: params.recipientAddress,
      });

      console.log(`Withdrew ${params.lamports / 1e9} SOL to ${params.recipientAddress}`);
      console.log('Result:', result);
      return {
        success: true,
        signature: result?.toString() || 'completed',
      };
    } catch (error) {
      console.error('Withdraw SOL failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Get private SOL balance
  async getPrivateBalanceSOL(): Promise<PrivateBalance> {
    try {
      const client = this.ensureClient();
      const balance = await client.getPrivateBalance();
      return { lamports: balance.lamports };
    } catch (error) {
      console.error('Failed to get private balance:', error);
      return { lamports: 0 };
    }
  }

  // Deposit SPL tokens - USDC, USDT into privacy cash pool
  async depositSPL(params: DepositSPLParams): Promise<TransactionResult> {
    try {
      const client = this.ensureClient();
      const result = await client.depositSPL({
        amount: params.amount,
        mintAddress: params.mintAddress,
      });
      console.log(`Deposited ${params.amount} tokens to privacy cash`);
      console.log('Result:', result);
      return {
        success: true,
        signature: result?.toString() || 'completed',
      };
    } catch (error) {
      console.error('Deposit SPL failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Withdraw SPL tokens from privacy cash pool
  async withdrawSPL(params: WithdrawSPLParams): Promise<TransactionResult> {
    try {
      const client = this.ensureClient();
      const result = await client.withdrawSPL({
        amount: params.amount,
        mintAddress: params.mintAddress,
        recipientAddress: params.recipientAddress,
      });

      console.log(`Withdrew ${params.amount} tokens to ${params.recipientAddress}`);
      console.log('Result:', result);
      return {
        success: true,
        signature: result?.toString() || 'completed',
      };
    } catch (error) {
      console.error('Withdraw SPL failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Get private SPL token balance
  async getPrivateBalanceSPL(mintAddress: PublicKey): Promise<PrivateBalanceSPL> {
    try {
      const client = this.ensureClient();
      const balance = await client.getPrivateBalanceSpl(mintAddress);
      return { amount: balance.amount, mintAddress };
    } catch (error) {
      console.error('Failed to get private SPL balance:', error);
      return { amount: 0, mintAddress };
    }
  }

  // --- Helpers ---

  // Deposit USDC
  async depositUSDC(amount: number): Promise<TransactionResult> {
    return this.depositSPL({
      amount,
      mintAddress: TOKEN_MINTS.USDC,
    });
  }

  // Withdraw USDC
  async withdrawUSDC(amount: number, recipientAddress: string): Promise<TransactionResult> {
    return this.withdrawSPL({
      amount,
      mintAddress: TOKEN_MINTS.USDC,
      recipientAddress,
    });
  }

  async getPrivateUSDCBalance(): Promise<number> {
    const balance = await this.getPrivateBalanceSPL(TOKEN_MINTS.USDC);
    return balance.amount;
  }

  async depositUSDT(amount: number): Promise<TransactionResult> {
    return this.depositSPL({
      amount,
      mintAddress: TOKEN_MINTS.USDT,
    });
  }

  async withdrawUSDT(amount: number, recipientAddress: string): Promise<TransactionResult> {
    return this.withdrawSPL({
      amount,
      mintAddress: TOKEN_MINTS.USDT,
      recipientAddress,
    });
  }

  async getPrivateUSDTBalance(): Promise<number> {
    const balance = await this.getPrivateBalanceSPL(TOKEN_MINTS.USDT);
    return balance.amount;
  }
}

// --- Singleton for backend ---

let backendClient: PrivacyCashClient | null = null;

export function getBackendClient(config?: PrivacyCashConfig): PrivacyCashClient {
  if (!backendClient && config) {
    backendClient = new PrivacyCashClient(config);
  }
  if (!backendClient) {
    throw new Error('Privacy cash client not initialized. Provide config on first call.');
  }
  return backendClient;
}

export async function initializeBackendClient(config: PrivacyCashConfig): Promise<PrivacyCashClient> {
  backendClient = new PrivacyCashClient(config);
  await backendClient.initialize();
  return backendClient;
}
