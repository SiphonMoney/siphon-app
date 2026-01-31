// matchingEngine.ts - Integration utilities for the matching engine
// Based on new_inmp.md specification

import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
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
} from '../lib/constants';
import { MATCHING_ENGINE_IDL_PATH } from '@/config/env';
import {
  getMXEPublicKeyWithRetry,
} from '../lib/arciumHelpers';
import { 
  awaitEvent, 
  awaitOrderCheckResult, 
  extractBalanceNonce,
  UserLedgerDepositedEvent,
  UserLedgerWithdrawVerifiedSuccessEvent
} from '../lib/eventListeners';
import { randomBytes } from 'crypto';
import {
  awaitComputationFinalization,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getComputationAccAddress,
  deserializeLE,
  x25519,
  getArciumProgramId,
  RescueCipher,
  getClusterAccAddress,
} from "@arcium-hq/client";
import { MatchingEngine } from "../../public/types/matching_engine";
import MatchingEngineIDL from "../../public/idl/matching_engine.json";




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

interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

function assertProviderWallet(wallet: WalletAdapter): asserts wallet is {
  publicKey: PublicKey;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
} {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signTransaction || !wallet.signAllTransactions) {
    throw new Error('Wallet missing transaction signing support');
  }
}

function resolveIdlPath(idlPath?: string): string {
  const trimmed = (idlPath || '').trim();
  if (!trimmed) return '/idl/matching_engine.json';
  if (trimmed.includes('/public/idl/')) {
    return trimmed.replace('/public/idl/', '/idl/');
  }
  if (trimmed.startsWith('public/idl/')) {
    return `/${trimmed.slice('public/idl/'.length)}`.replace(/^\/?/, '/idl/');
  }
  if (trimmed.startsWith('idl/')) {
    return `/${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  return `/idl/${trimmed}`;
}

function containsGenerics(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some(containsGenerics);
  }
  if ('generics' in value || 'generic' in value) {
    return true;
  }
  return Object.values(value).some(containsGenerics);
}

function sanitizeIdlNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeIdlNode(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  if ('generic' in value) {
    return 'u8';
  }

  if ('defined' in value) {
    const defined = (value as { defined?: unknown }).defined;
    if (defined && typeof defined === 'object' && 'name' in defined) {
      return {
        ...value,
        defined: (defined as { name: string }).name,
      };
    }
  }

  if ('array' in value) {
    const arrayValue = (value as { array?: unknown }).array;
    if (Array.isArray(arrayValue) && arrayValue.length === 2) {
      const elementType = sanitizeIdlNode(arrayValue[0]);
      let length = arrayValue[1];
      if (typeof length !== 'number') {
        length = 1;
      }
      const next = { ...value, array: [elementType, length] };
      if ('generics' in next) {
        delete (next as { generics?: unknown }).generics;
      }
      return next;
    }
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'generics') {
      continue;
    }
    result[key] = sanitizeIdlNode(entry);
  }
  return result;
}

function sanitizeIdlIfNeeded(idl: Idl): Idl {
  if (!containsGenerics(idl)) {
    return idl;
  }
  const cloned = JSON.parse(JSON.stringify(idl)) as Idl;
  return sanitizeIdlNode(cloned) as Idl;
}

async function loadIdl(): Promise<Idl> {
  const path = resolveIdlPath(MATCHING_ENGINE_IDL_PATH);
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch IDL: HTTP ${response.status} (${path})`);
  }
  const idl = (await response.json()) as Idl;
  return sanitizeIdlIfNeeded(idl);
}

// ===== Main Matching Engine Client =====

export class MatchingEngineClient {
  private program: Program;
  private provider: AnchorProvider;
  private userPrivateKey: Uint8Array;
  private userPublicKey: Uint8Array;
  private cipher: RescueCipher | null = null;
  private clusterOffset: number = 456;
  private clusterAccount : PublicKey;
  private mempoolAccount : PublicKey;
  private executingPoolAccount : PublicKey;
  private mxeAccount : PublicKey;
  private wallet?: WalletAdapter;
  // private compDefAccAddressOfInitUserLedger : PublicKey;
  // private compDefAccAddressOfUpdateLedgerDeposit : PublicKey;
  // private compDefAccAddressOfUpdateLedgerWithdrawVerify : PublicKey;
  // private compDefAccAddressOfExecuteSettlement : PublicKey;
  // private compDefAccAddressOfSubmitOrderCheck : PublicKey;
  // private compDefAccAddressOfMatchOrders : PublicKey;
  // private compDefAccAddressOfTriggerMatching : PublicKey;
  // private compDefAccAddressOfExecuteSettlement : PublicKey;


  constructor(
    program: Program,
    provider: AnchorProvider,
    userPrivateKey: Uint8Array,
    userPublicKey: Uint8Array,
    wallet?: WalletAdapter
  ) {



//     clusterAccount DzaQCyfybroycrNqE5Gk7LhSbWD2qfCics6qptBFbr95
// mempoolAccount Ex7BD8o8PK1y2eXDd38Jgujj93uHygrZeWXDeGAHmHtN
// executingPoolAccount 4mcrgNZzJwwKrE3wXMHfepT8htSBmGqBzDYPJijWooog
// comp def acc address of init_user_ledger PublicKey [PublicKey(9Ps2uKkckSScLGbWZ3ssZRE8aNs46sNyzHqyfLdP72y4)] {
//   _bn: <BN: 7cb8d870e1d2ae371f296bc064b34cbcfd27e9875432396a3cc9da83ead46667>
// }
// comp def acc address of update_ledger_deposit PublicKey [PublicKey(AA3MXRjgVbJyhNV7cxx1sYyXmESGxkXjxqNRRscMRuH3)] {
//   _bn: <BN: 880a1236efb746f912614b2caf8647a813970d1858f11436a8de854ff5898352>
// }
// comp def acc address of update_ledger_withdraw_verify PublicKey [PublicKey(4xDPisooqQEyYLhmMq2YMimRFLNpJvA4GEMKkjgBX1qG)] {
//   _bn: <BN: 3ab804456c71cbf611b69222f4edcb1cd891ca884effaf6753effbd5cf5a499f>
// }
// comp def acc address of execute_settlement PublicKey [PublicKey(2Wq5JSbPwhmzRQtNewodmZ2cK9HU2bRCvHELobDvevFQ)] {
//   _bn: <BN: 167fe35442777c08d64b8189592894fdd02f8c44c0763945315f7c6451934fcf>
// }
// comp def acc address of submit_order_check PublicKey [PublicKey(3dGihdq9R8RuqHnMFnmDGC4154ewMd4GKusruQV9N1pS)] {
//   _bn: <BN: 27020e759d2186b8c46a56416658a2cd4a0c09bb393f7b4218827247f40a7cc7>
// }
// comp def acc address of match_orders PublicKey [PublicKey(7APvfRWtsw9732CnN35shvt5DYck83dPDkH72WBx9ShH)] {
//   _bn: <BN: 5b8e453d0d653380537a6d62611af4e013b9737950e47faea72076b68e801b54>
// }
// comp def acc address of trigger_matching PublicKey [PublicKey(Fw63UnmhnCi7vuLacpt9yTa43gncUiPbgffSDDnYpbhz)] {
//   _bn: <BN: dddeaeb8cb75bb2d996c8211a6b41cd56a5ef49be7dc5654a8106f2837f2c579>
// }
// comp def acc address of execute_settlement PublicKey [PublicKey(2Wq5JSbPwhmzRQtNewodmZ2cK9HU2bRCvHELobDvevFQ)] {
//   _bn: <BN: 167fe35442777c08d64b8189592894fdd02f8c44c0763945315f7c6451934fcf>
// }
// comp def acc address of execute_settlement PublicKey [PublicKey(2Wq5JSbPwhmzRQtNewodmZ2cK9HU2bRCvHELobDvevFQ)] {
//   _bn: <BN: 167fe35442777c08d64b8189592894fdd02f8c44c0763945315f7c6451934fcf>
// }
// mxe acc address PublicKey [PublicKey(4c63M2Q9ZXdszjfyqjhYf6JynYd6KjX2NaieSteYN9tZ)] {
//   _bn: <BN: 3590169d1ee15d2a74024d741a7b8ff666839c70e0b88aa74bddc9613df47f66>
// }
// computation acc address with random offset PublicKey [PublicKey(GoeajPH8MoyLUDMzsibA1VyM4Sra8sjJMhFww6KwDJS2)] {
//   _bn: <BN: ead283c4ec7b6fc62bd645af2919bc8e97953558fd03a22834345b1b80cc4dcf>
// }
    this.program = program;
    this.provider = provider;
    this.userPrivateKey = userPrivateKey;
    this.userPublicKey = userPublicKey;
    this.wallet = wallet;
    this.clusterAccount = new PublicKey("DzaQCyfybroycrNqE5Gk7LhSbWD2qfCics6qptBFbr95");
    this.mempoolAccount = new PublicKey("Ex7BD8o8PK1y2eXDd38Jgujj93uHygrZeWXDeGAHmHtN");
    this.executingPoolAccount = new PublicKey("4mcrgNZzJwwKrE3wXMHfepT8htSBmGqBzDYPJijWooog");
    this.mxeAccount = new PublicKey("4c63M2Q9ZXdszjfyqjhYf6JynYd6KjX2NaieSteYN9tZ");
    // this.compDefAccAddressOfInitUserLedger = new PublicKey("9Ps2uKkckSScLGbWZ3ssZRE8aNs46sNyzHqyfLdP72y4");
    // this.compDefAccAddressOfUpdateLedgerDeposit = new PublicKey("AA3MXRjgVbJyhNV7cxx1sYyXmESGxkXjxqNRRscMRuH3");
    // this.compDefAccAddressOfUpdateLedgerWithdrawVerify = new PublicKey("4xDPisooqQEyYLhmMq2YMimRFLNpJvA4GEMKkjgBX1qG");
    // this.compDefAccAddressOfExecuteSettlement = new PublicKey("2Wq5JSbPwhmzRQtNewodmZ2cK9HU2bRCvHELobDvevFQ");
    // this.compDefAccAddressOfSubmitOrderCheck = new PublicKey("3dGihdq9R8RuqHnMFnmDGC4154ewMd4GKusruQV9N1pS");
    // this.compDefAccAddressOfMatchOrders = new PublicKey("7APvfRWtsw9732CnN35shvt5DYck83dPDkH72WBx9ShH");
    // this.compDefAccAddressOfTriggerMatching = new PublicKey("Fw63UnmhnCi7vuLacpt9yTa43gncUiPbgffSDDnYpbhz");
    // this.compDefAccAddressOfExecuteSettlement = new PublicKey("2Wq5JSbPwhmzRQtNewodmZ2cK9HU2bRCvHELobDvevFQ");

  }

  static async create(
    connection: Connection,
    walletAdapter: WalletAdapter
  ): Promise<MatchingEngineClient> {
    assertProviderWallet(walletAdapter);
    const provider = new AnchorProvider(connection, walletAdapter as AnchorProvider['wallet'], {
      commitment: 'confirmed',
    });
    const program = new Program<MatchingEngine>(
      MatchingEngineIDL as Idl,
      PROGRAM_ID,
      provider
    );
    return new MatchingEngineClient(
      program,
      provider,
      new Uint8Array(32),
      new Uint8Array(32),
      walletAdapter
    );
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

    const tx = await (this.program as any).methods
      .initializeUserLedger(
        Array.from(this.userPublicKey),
        new BN(deserializeLE(userLedgerNonce).toString()),
        computationOffset
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          this.clusterOffset,
          computationOffset
        ),
        user: user.publicKey,
        clusterAccount: this.clusterAccount,
        mxeAccount: this.mxeAccount,
        mempoolAccount: this.mempoolAccount,
        executingPool: this.executingPoolAccount,
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

  async ensureUserLedger(userEncPubkey?: Uint8Array): Promise<string> {
    if (!this.wallet?.publicKey) {
      throw new Error('Wallet not connected');
    }
    if (!userEncPubkey || userEncPubkey.length === 0) {
      throw new Error('Missing user encryption public key');
    }

    const userLedgerNonce = randomBytes(16);
    const computationOffset = new BN(randomBytes(8));

    const tx = await (this.program as any).methods
      .initializeUserLedger(
        Array.from(userEncPubkey),
        new BN(deserializeLE(userLedgerNonce).toString()),
        computationOffset
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          this.clusterOffset,
          computationOffset
        ),
        user: this.wallet.publicKey,
        clusterAccount: this.clusterAccount,
        mxeAccount: this.mxeAccount,
        mempoolAccount: this.mempoolAccount,
        executingPool: this.executingPoolAccount,
        compDefAccount: getCompDefAccAddress(
          PROGRAM_ID,
          Buffer.from(getCompDefAccOffset('init_user_ledger')).readUInt32LE()
        ),
        systemProgram: SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
        userLedger: getUserLedgerAddress(this.wallet.publicKey, PROGRAM_ID),
      })
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

      const eventPromise = awaitEvent<UserLedgerDepositedEvent>(this.program, 'userLedgerDepositedEvent');

      const tx = await (this.program as any).methods
        .depositToLedger(
          Array.from(this.userPublicKey),
          depositAmount,
          isBaseToken,
          computationOffset
        )
        .accounts({
          computationAccount: getComputationAccAddress(this.clusterOffset, computationOffset),
          user: user.publicKey,
          clusterAccount: this.clusterAccount,
          mxeAccount: this.mxeAccount,
          mempoolAccount: this.mempoolAccount,
          executingPool: this.executingPoolAccount,
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

      await (this.program as any).methods
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
          computationAccount: getComputationAccAddress(this.clusterOffset, checkOffset),
          user: user.publicKey,
          clusterAccount: this.clusterAccount,
          mxeAccount: this.mxeAccount,
          mempoolAccount: this.mempoolAccount,
          executingPool: this.executingPoolAccount,
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

      const submitTx = await (this.program as any).methods
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
          computationAccount: getComputationAccAddress(this.clusterOffset, submitOffset),
          user: user.publicKey,
          clusterAccount: this.clusterAccount,
          mxeAccount: this.mxeAccount,
          mempoolAccount: this.mempoolAccount,
          executingPool: this.executingPoolAccount,
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

      const resultPromise = awaitEvent<UserLedgerWithdrawVerifiedSuccessEvent>(this.program, 'userLedgerWithdrawVerifiedSuccessEvent');

      const tx = await (this.program as any).methods
        .withdrawFromLedgerVerify(
          Array.from(this.userPublicKey),
          withdrawAmount,
          isBaseToken,
          computationOffset
        )
        .accountsPartial({
          computationAccount: getComputationAccAddress(this.clusterOffset, computationOffset),
          user: user.publicKey,
          clusterAccount: this.clusterAccount,
          mxeAccount: this.mxeAccount,
          mempoolAccount: this.mempoolAccount,
          executingPool: this.executingPoolAccount,
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
// export async function createMatchingEngineClient(
//   userKeypair: Keypair,
//   userPrivateKey: Uint8Array,
//   userPublicKey: Uint8Array,
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   programIdl: any
// ): Promise<MatchingEngineClient> {
//   const connection = new Connection(SOLANA_RPC, 'confirmed');
//   const wallet = { publicKey: userKeypair.publicKey, signTransaction: async (tx: Transaction) => tx, signAllTransactions: async (txs: Transaction[]) => txs };
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   const provider = new AnchorProvider(connection, walletAdapter as AnchorProvider['wallet'], {
//     commitment: 'confirmed',
//   });
//   // const idl = await loadIdl();
//   const program = new Program<MatchingEngine>(
//     MatchingEngineIDL as Idl,
//     PROGRAM_ID,
//     provider
//   );

//   return new MatchingEngineClient(program, provider, userPrivateKey, userPublicKey);
// }