// matchingEngine.ts - Integration utilities for the matching engine
// Based on new_inmp.md specification

import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  PROGRAM_ID,
  SOLANA_RPC,
  SCALE_FACTOR,
  getUserLedgerAddress,
  getOrderAccountAddress,
  getOrderbookAddress,
  getVaultAddress,
  getVaultAuthorityAddress,
} from './constants';
import {
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getClusterAccAddress,
  getArciumProgramId,
  awaitComputationFinalization,
  deserializeLE,
  getMXEPublicKeyWithRetry,
} from './arciumHelpers';
import { x25519, RescueCipher } from './encryption';
import { awaitEvent, awaitOrderCheckResult, extractBalanceNonce } from './eventListeners';
import { randomBytes } from 'crypto';

// Types for matching engine integration
export interface OrderParams {
  amount: number; // Amount in base token (e.g., SOL) - NOT scaled
  price: number;  // Price in quote token (e.g., USDC) - NOT scaled
  orderType: 0 | 1; // 0 = buy, 1 = sell
  orderId: number;
}

export interface EncryptedBalance {
  baseTotal: bigint;
  baseAvailable: bigint;
  quoteTotal: bigint;
  quoteAvailable: bigint;
}

export interface SubmitOrderResult {
  success: boolean;
  txSignature?: string;
  orderId?: number;
  reason?: string;
}

export interface DepositResult {
  success: boolean;
  txSignature?: string;
  updatedBalance?: EncryptedBalance;
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  txSignature?: string;
  updatedBalance?: EncryptedBalance;
  error?: string;
}

// ===== Main Matching Engine Client =====

export class MatchingEngineClient {
  private program: Program;
  private provider: AnchorProvider;
  private userPrivateKey: Uint8Array;
  private userPublicKey: Uint8Array;
  private cipher: RescueCipher | null = null;
  private clusterOffset: number = 0; // Should be configured

  constructor(
    program: Program,
    provider: AnchorProvider,
    userPrivateKey: Uint8Array,
    userPublicKey: Uint8Array
  ) {
    this.program = program;
    this.provider = provider;
    this.userPrivateKey = userPrivateKey;
    this.userPublicKey = userPublicKey;
  }

  /**
   * Initialize encryption cipher with MXE public key
   */
  async initializeCipher(): Promise<void> {
    const mxePublicKey = await getMXEPublicKeyWithRetry(this.provider, PROGRAM_ID);
    const sharedSecret = x25519.getSharedSecret(this.userPrivateKey, mxePublicKey);
    this.cipher = new RescueCipher(sharedSecret);
  }

  /**
   * Initialize user ledger
   * Flow 1 from new_inmp.md lines 101-174
   */
  async initializeUserLedger(user: Keypair): Promise<string> {
    if (!this.cipher) await this.initializeCipher();

    const userLedgerNonce = randomBytes(16);
    const computationOffset = new BN(randomBytes(8));
    const clusterAccount = getClusterAccAddress(this.clusterOffset);

    const tx = await this.program.methods
      .initializeUserLedger(
        Array.from(this.userPublicKey),
        new BN(deserializeLE(userLedgerNonce).toString()),
        computationOffset
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(PROGRAM_ID, computationOffset),
        user: user.publicKey,
        clusterAccount,
        mxeAccount: getMXEAccAddress(PROGRAM_ID),
        mempoolAccount: getMempoolAccAddress(PROGRAM_ID),
        executingPool: getExecutingPoolAccAddress(PROGRAM_ID),
        compDefAccount: getCompDefAccAddress(
          PROGRAM_ID,
          Buffer.from(getCompDefAccOffset('init_user_ledger')).readUInt32LE()
        ),
        systemProgram: SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
        userLedger: getUserLedgerAddress(user.publicKey, PROGRAM_ID),
      })
      .signers([user])
      .rpc({ commitment: 'confirmed' });

    await awaitComputationFinalization(this.provider, computationOffset, PROGRAM_ID, 'confirmed');

    return tx;
  }

  /**
   * Deposit tokens to ledger
   * Flow 2 from new_inmp.md lines 190-271
   */
  async depositToLedger(
    user: Keypair,
    amount: number,
    mint: PublicKey,
    isBaseToken: boolean
  ): Promise<DepositResult> {
    if (!this.cipher) await this.initializeCipher();

    try {
      const depositAmount = new BN(amount * SCALE_FACTOR);
      const computationOffset = new BN(randomBytes(8));
      const clusterAccount = getClusterAccAddress(this.clusterOffset);

      const userLedgerPDA = getUserLedgerAddress(user.publicKey, PROGRAM_ID);
      const vaultPDA = getVaultAddress(mint, PROGRAM_ID);
      const vaultAuthorityPDA = getVaultAuthorityAddress(PROGRAM_ID);
      const userTokenAccount = await getAssociatedTokenAddress(mint, user.publicKey);

      const eventPromise = awaitEvent(this.program, 'userLedgerDepositedEvent');

      const tx = await this.program.methods
        .depositToLedger(
          Array.from(this.userPublicKey),
          depositAmount,
          isBaseToken,
          computationOffset
        )
        .accounts({
          computationAccount: getComputationAccAddress(PROGRAM_ID, computationOffset),
          user: user.publicKey,
          clusterAccount,
          mxeAccount: getMXEAccAddress(PROGRAM_ID),
          mempoolAccount: getMempoolAccAddress(PROGRAM_ID),
          executingPool: getExecutingPoolAccAddress(PROGRAM_ID),
          compDefAccount: getCompDefAccAddress(
            PROGRAM_ID,
            Buffer.from(getCompDefAccOffset('update_ledger_deposit')).readUInt32LE()
          ),
          systemProgram: SystemProgram.programId,
          arciumProgram: getArciumProgramId(),
          userLedger: userLedgerPDA,
          mint,
          vault: vaultPDA,
          userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          vaultAuthority: vaultAuthorityPDA,
        })
        .signers([user])
        .rpc({ commitment: 'confirmed' });

      await awaitComputationFinalization(this.provider, computationOffset, PROGRAM_ID, 'confirmed');

      const event = await eventPromise;
      const balanceNonce = extractBalanceNonce(event);
      const balances = this.cipher!.decrypt([...event.encryptedBalances], balanceNonce);

      return {
        success: true,
        txSignature: tx,
        updatedBalance: {
          baseTotal: balances[0],
          baseAvailable: balances[1],
          quoteTotal: balances[2],
          quoteAvailable: balances[3],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Submit order (two-step process)
   * Flow 3 from new_inmp.md lines 284-488
   */
  async submitOrder(
    user: Keypair,
    orderParams: OrderParams,
    baseMint: PublicKey
  ): Promise<SubmitOrderResult> {
    if (!this.cipher) await this.initializeCipher();

    try {
      // Scale amounts
      const amount = orderParams.amount * SCALE_FACTOR;
      const price = orderParams.price * SCALE_FACTOR;
      const orderNonce = randomBytes(16);

      // Encrypt order data once
      const ciphertext = this.cipher!.encrypt(
        [BigInt(amount), BigInt(price)],
        orderNonce
      );

      // STEP 1: submit_order_check
      const checkOffset = new BN(randomBytes(8));
      const orderAccountPDA = getOrderAccountAddress(new BN(orderParams.orderId), PROGRAM_ID);
      const baseVaultPDA = getVaultAddress(baseMint, PROGRAM_ID);
      const userLedgerPDA = getUserLedgerAddress(user.publicKey, PROGRAM_ID);
      const clusterAccount = getClusterAccAddress(this.clusterOffset);

      await this.program.methods
        .submitOrderCheck(
          Array.from(ciphertext[0]),
          Array.from(ciphertext[1]),
          Array.from(this.userPublicKey),
          orderParams.orderType,
          checkOffset,
          new BN(orderParams.orderId),
          new BN(deserializeLE(orderNonce).toString())
        )
        .accountsPartial({
          computationAccount: getComputationAccAddress(PROGRAM_ID, checkOffset),
          user: user.publicKey,
          clusterAccount,
          mxeAccount: getMXEAccAddress(PROGRAM_ID),
          mempoolAccount: getMempoolAccAddress(PROGRAM_ID),
          executingPool: getExecutingPoolAccAddress(PROGRAM_ID),
          compDefAccount: getCompDefAccAddress(
            PROGRAM_ID,
            Buffer.from(getCompDefAccOffset('submit_order_check')).readUInt32LE()
          ),
          systemProgram: SystemProgram.programId,
          arciumProgram: getArciumProgramId(),
          baseMint,
          vault: baseVaultPDA,
          orderAccount: orderAccountPDA,
          userLedger: userLedgerPDA,
        })
        .signers([user])
        .rpc({ commitment: 'confirmed' });

      await awaitComputationFinalization(this.provider, checkOffset, PROGRAM_ID, 'confirmed');

      // Check result
      const { success } = await awaitOrderCheckResult(this.program);

      if (!success) {
        return {
          success: false,
          reason: 'Insufficient balance',
        };
      }

      // STEP 2: submit_order (only if check succeeded)
      const submitOffset = new BN(randomBytes(8));
      const orderbookPDA = getOrderbookAddress(PROGRAM_ID);

      const submitTx = await this.program.methods
        .submitOrder(
          Array.from(ciphertext[0]), // Same encrypted data
          Array.from(ciphertext[1]), // Same encrypted data
          Array.from(this.userPublicKey),
          orderParams.orderType,
          submitOffset,
          new BN(orderParams.orderId),
          new BN(deserializeLE(orderNonce).toString())
        )
        .accountsPartial({
          computationAccount: getComputationAccAddress(PROGRAM_ID, submitOffset),
          user: user.publicKey,
          clusterAccount,
          mxeAccount: getMXEAccAddress(PROGRAM_ID),
          mempoolAccount: getMempoolAccAddress(PROGRAM_ID),
          executingPool: getExecutingPoolAccAddress(PROGRAM_ID),
          compDefAccount: getCompDefAccAddress(
            PROGRAM_ID,
            Buffer.from(getCompDefAccOffset('submit_order')).readUInt32LE()
          ),
          systemProgram: SystemProgram.programId,
          arciumProgram: getArciumProgramId(),
          baseMint,
          vault: baseVaultPDA,
          orderbookState: orderbookPDA,
        })
        .signers([user])
        .rpc({ commitment: 'confirmed' });

      await awaitComputationFinalization(this.provider, submitOffset, PROGRAM_ID, 'confirmed');

      return {
        success: true,
        txSignature: submitTx,
        orderId: orderParams.orderId,
      };
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Withdraw from ledger (verification step)
   * Flow 4 from new_inmp.md lines 492-579
   */
  async withdrawFromLedgerVerify(
    user: Keypair,
    amount: number,
    mint: PublicKey,
    isBaseToken: boolean
  ): Promise<WithdrawResult> {
    if (!this.cipher) await this.initializeCipher();

    try {
      const withdrawAmount = new BN(amount * SCALE_FACTOR);
      const computationOffset = new BN(randomBytes(8));
      const clusterAccount = getClusterAccAddress(this.clusterOffset);

      const userLedgerPDA = getUserLedgerAddress(user.publicKey, PROGRAM_ID);
      const vaultPDA = getVaultAddress(mint, PROGRAM_ID);
      const vaultAuthorityPDA = getVaultAuthorityAddress(PROGRAM_ID);

      const resultPromise = awaitEvent(this.program, 'userLedgerWithdrawVerifiedSuccessEvent');

      const tx = await this.program.methods
        .withdrawFromLedgerVerify(
          Array.from(this.userPublicKey),
          withdrawAmount,
          isBaseToken,
          computationOffset
        )
        .accountsPartial({
          computationAccount: getComputationAccAddress(PROGRAM_ID, computationOffset),
          user: user.publicKey,
          clusterAccount,
          mxeAccount: getMXEAccAddress(PROGRAM_ID),
          mempoolAccount: getMempoolAccAddress(PROGRAM_ID),
          executingPool: getExecutingPoolAccAddress(PROGRAM_ID),
          compDefAccount: getCompDefAccAddress(
            PROGRAM_ID,
            Buffer.from(getCompDefAccOffset('update_ledger_withdraw_verify')).readUInt32LE()
          ),
          systemProgram: SystemProgram.programId,
          arciumProgram: getArciumProgramId(),
          vault: vaultPDA,
          userLedger: userLedgerPDA,
          mint,
          vaultAuthority: vaultAuthorityPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc({ commitment: 'confirmed' });

      await awaitComputationFinalization(this.provider, computationOffset, PROGRAM_ID, 'confirmed');

      const event = await resultPromise;
      const balanceNonce = extractBalanceNonce(event);
      const balances = this.cipher!.decrypt([...event.encryptedBalances], balanceNonce);

      return {
        success: true,
        txSignature: tx,
        updatedBalance: {
          baseTotal: balances[0],
          baseAvailable: balances[1],
          quoteTotal: balances[2],
          quoteAvailable: balances[3],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// ===== Factory Functions =====

/**
 * Create a new matching engine client
 */
export async function createMatchingEngineClient(
  userKeypair: Keypair,
  userPrivateKey: Uint8Array,
  userPublicKey: Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  programIdl: any
): Promise<MatchingEngineClient> {
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const wallet = { publicKey: userKeypair.publicKey, signTransaction: async (tx: Transaction) => tx, signAllTransactions: async (txs: Transaction[]) => txs };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  const program = new Program(programIdl, PROGRAM_ID, provider);

  return new MatchingEngineClient(program, provider, userPrivateKey, userPublicKey);
}