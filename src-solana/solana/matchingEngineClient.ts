import { AnchorProvider, BN, Program, Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import {
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getExecutingPoolAccAddress,
  getClusterAccAddress,
  getArciumProgramId,
  getMempoolAccAddress,
  getMXEAccAddress,
  awaitComputationFinalization,
} from "@/lib/arciumHelpers";
import {
  MATCHING_ENGINE_PROGRAM_ID,
  ARCIUM_CLUSTER_OFFSET,
  MATCHING_ENGINE_IDL_PATH,
} from "@/config/env";
import { loadIdl } from "@/solana/idl";
import {
  globalStatePda,
  orderAccountPda,
  orderTicketPda,
  userLedgerPda,
  vaultAuthorityPda,
  vaultPda,
} from "@/solana/pdas";
import {
  cipherForUser,
  computeOrderCommitment,
  encryptOrder,
  getMxePublicKeyWithRetry,
  u64ToBn,
} from "@/crypto/arcium";
import { getOrCreateUserX25519 } from "@/crypto/X25519Store";

type TokenType = "base" | "quote";
type Side = "buy" | "sell";
type UnknownProgram = Program<Idl>;
type RpcOptions = { commitment?: string };
type AccountsPartialRpc = {
  accountsPartial: (accounts: Record<string, PublicKey>) => {
    rpc: (options?: RpcOptions) => Promise<string>;
  };
};
type MatchingMethods = {
  initializeUserLedger: (...args: unknown[]) => AccountsPartialRpc;
  depositToLedger: (...args: unknown[]) => AccountsPartialRpc;
  withdrawFromLedgerVerify: (...args: unknown[]) => AccountsPartialRpc;
  submitOrderCheck: (...args: unknown[]) => AccountsPartialRpc;
};

interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomU64(): bigint {
  const buffer = Buffer.alloc(8);
  buffer.set(randomBytes(8));
  return buffer.readBigUInt64LE(0);
}

function u128FromBytes(bytes: Uint8Array): BN {
  const buffer = Buffer.from(bytes);
  const hex = buffer.toString("hex");
  return new BN(hex, 16);
}

const SIGN_PDA_SEED = "ArciumSignerAccount";
const POOL_ACCOUNT = new PublicKey(
  "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC",
);
const CLOCK_ACCOUNT = new PublicKey(
  "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot",
);

function signPdaAccount(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(SIGN_PDA_SEED)],
    programId,
  );
  return pda;
}

function toU128LE(value: BN): Uint8Array {
  const buffer = Buffer.alloc(16);
  buffer.set(value.toArrayLike(Buffer, "le", 16));
  return new Uint8Array(buffer);
}

async function getProgram(
  connection: Connection,
  wallet: WalletAdapter,
  programId = MATCHING_ENGINE_PROGRAM_ID,
): Promise<UnknownProgram> {
  const provider = new AnchorProvider(
    connection,
    wallet as AnchorProvider["wallet"],
    { commitment: "confirmed" },
  );
  const idl = await loadIdl(
    provider,
    programId,
    MATCHING_ENGINE_IDL_PATH || undefined,
  );
  return new Program(idl, programId, provider) as UnknownProgram;
}

export class MatchingEngineClient {
  private connection: Connection;
  private wallet: WalletAdapter;
  private provider: AnchorProvider;
  private program: UnknownProgram;
  private programId: PublicKey;

  private constructor(
    connection: Connection,
    wallet: WalletAdapter,
    provider: AnchorProvider,
    program: UnknownProgram,
    programId: PublicKey,
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = provider;
    this.program = program;
    this.programId = programId;
  }

  static async create(
    connection: Connection,
    wallet: WalletAdapter,
    programId = MATCHING_ENGINE_PROGRAM_ID,
  ): Promise<MatchingEngineClient> {
    if (!wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const provider = new AnchorProvider(
      connection,
      wallet as AnchorProvider["wallet"],
      { commitment: "confirmed" },
    );
    const idl = await loadIdl(
      provider,
      programId,
      MATCHING_ENGINE_IDL_PATH || undefined,
    );
    const program = new Program(idl, programId, provider) as UnknownProgram;
    return new MatchingEngineClient(
      connection,
      wallet,
      provider,
      program,
      programId,
    );
  }

  getProgram(): UnknownProgram {
    return this.program;
  }

  async fetchGlobalState(): Promise<Record<string, unknown>> {
    const account = this.program.account as Record<
      string,
      { fetch: (pda: PublicKey) => Promise<unknown> }
    >;
    const globalState = await account.globalState.fetch(
      globalStatePda(this.programId),
    );
    return globalState as Record<string, unknown>;
  }

  deriveUserLedger(userPubkey: PublicKey): PublicKey {
    return userLedgerPda(this.programId, userPubkey);
  }

  async ensureUserLedger(userEncPubkey?: Uint8Array): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const ledger = this.deriveUserLedger(this.wallet.publicKey);
    const existing = await this.connection.getAccountInfo(ledger);
    if (existing) {
      return "already-initialized";
    }

    const resolvedEncPubkey =
      userEncPubkey ??
      (
        await getOrCreateUserX25519(
          this.wallet.publicKey.toBase58(),
          this.wallet.signMessage,
        )
      ).publicKey;

    const userLedgerNonce = randomBytes(16);
    const computationOffset = u64ToBn(randomU64());
    const clusterAccount = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);

    const methods = this.program.methods as unknown as MatchingMethods;
    const tx = await methods
      .initializeUserLedger(
        Array.from(resolvedEncPubkey),
        u128FromBytes(userLedgerNonce),
        computationOffset,
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          ARCIUM_CLUSTER_OFFSET,
          computationOffset,
        ),
        user: this.wallet.publicKey,
        clusterAccount,
        mxeAccount: getMXEAccAddress(this.programId),
        mempoolAccount: getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          this.programId,
          Buffer.from(getCompDefAccOffset("init_user_ledger")).readUInt32LE(),
        ),
        systemProgram: SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
        userLedger: ledger,
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      this.provider,
      computationOffset,
      this.programId,
      "confirmed",
    );
    return tx;
  }

  async deposit(params: {
    token: TokenType;
    amountU64: bigint;
  }): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const globalState = await this.fetchGlobalState();
    const baseMint = new PublicKey(globalState.baseMint as string);
    const quoteMint = new PublicKey(globalState.quoteMint as string);
    const mint = params.token === "base" ? baseMint : quoteMint;
    const isBase = params.token === "base";

    const { publicKey: userEncPubkey } = await getOrCreateUserX25519(
      this.wallet.publicKey.toBase58(),
      this.wallet.signMessage,
    );

    const computationOffset = u64ToBn(randomU64());
    const clusterAccount = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);
    const ledger = this.deriveUserLedger(this.wallet.publicKey);
    const vault = vaultPda(this.programId, mint);
    const vaultAuthority = vaultAuthorityPda(this.programId);
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      this.wallet.publicKey,
    );

    const methods = this.program.methods as unknown as MatchingMethods;
    const tx = await methods
      .depositToLedger(
        Array.from(userEncPubkey),
        new BN(params.amountU64.toString()),
        isBase,
        computationOffset,
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          ARCIUM_CLUSTER_OFFSET,
          computationOffset,
        ),
        user: this.wallet.publicKey,
        clusterAccount,
        mxeAccount: getMXEAccAddress(this.programId),
        mempoolAccount: getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          this.programId,
          Buffer.from(
            getCompDefAccOffset("update_ledger_deposit"),
          ).readUInt32LE(),
        ),
        systemProgram: SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
        userLedger: ledger,
        mint,
        vault,
        userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        vaultAuthority,
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      this.provider,
      computationOffset,
      this.programId,
      "confirmed",
    );
    return tx;
  }

  async withdrawVerify(params: {
    token: TokenType;
    amountU64: bigint;
  }): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const globalState = await this.fetchGlobalState();
    const baseMint = new PublicKey(globalState.baseMint as string);
    const quoteMint = new PublicKey(globalState.quoteMint as string);
    const mint = params.token === "base" ? baseMint : quoteMint;
    const isBase = params.token === "base";

    const { publicKey: userEncPubkey } = await getOrCreateUserX25519(
      this.wallet.publicKey.toBase58(),
      this.wallet.signMessage,
    );

    const computationOffset = u64ToBn(randomU64());
    const clusterAccount = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);
    const ledger = this.deriveUserLedger(this.wallet.publicKey);
    const vault = vaultPda(this.programId, mint);
    const vaultAuthority = vaultAuthorityPda(this.programId);

    const methods = this.program.methods as unknown as MatchingMethods;
    const tx = await methods
      .withdrawFromLedgerVerify(
        Array.from(userEncPubkey),
        new BN(params.amountU64.toString()),
        isBase,
        computationOffset,
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          ARCIUM_CLUSTER_OFFSET,
          computationOffset,
        ),
        user: this.wallet.publicKey,
        clusterAccount,
        mxeAccount: getMXEAccAddress(this.programId),
        mempoolAccount: getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          this.programId,
          Buffer.from(
            getCompDefAccOffset("update_ledger_withdraw_verify"),
          ).readUInt32LE(),
        ),
        systemProgram: SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
        userLedger: ledger,
        mint,
        vault,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      this.provider,
      computationOffset,
      this.programId,
      "confirmed",
    );
    return tx;
  }

  async submitOrderTicket(params: {
    side: Side;
    amountU64: bigint;
    priceU64: bigint;
  }): Promise<{
    orderIdU64: bigint;
    salt32Hex: string;
    commitmentHex: string;
  }> {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const { privateKey: userPriv, publicKey: userEncPubkey } =
      await getOrCreateUserX25519(
        this.wallet.publicKey.toBase58(),
        this.wallet.signMessage,
      );

    const mxePubkey = await getMxePublicKeyWithRetry(
      this.provider,
      this.programId,
    );
    const cipher = cipherForUser(userPriv, mxePubkey);

    let orderIdU64 = randomU64();
    for (let i = 0; i < 5; i += 1) {
      const ticketPda = orderTicketPda(this.programId, orderIdU64);
      const exists = await this.connection.getAccountInfo(ticketPda);
      if (!exists) break;
      orderIdU64 = randomU64();
    }

    const salt32 = randomBytes(32);
    const nonce16 = randomBytes(16);
    const computationOffset = u64ToBn(randomU64());
    const clusterAccount = getClusterAccAddress(ARCIUM_CLUSTER_OFFSET);

    const { amountCt32, priceCt32 } = encryptOrder(
      cipher,
      params.amountU64,
      params.priceU64,
      nonce16,
    );
    const sideU8 = params.side === "buy" ? 0 : 1;
    const commitment = await computeOrderCommitment(
      params.amountU64,
      params.priceU64,
      sideU8,
      salt32,
    );

    const globalState = await this.fetchGlobalState();
    const baseMint = new PublicKey(globalState.baseMint as string);
    const vault = vaultPda(this.programId, baseMint);

    const methods = this.program.methods as unknown as MatchingMethods;
    await methods
      .submitOrderCheck(
        Array.from(amountCt32),
        Array.from(priceCt32),
        Array.from(userEncPubkey),
        sideU8,
        Array.from(commitment),
        computationOffset,
        new BN(orderIdU64.toString()),
        u128FromBytes(nonce16),
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          ARCIUM_CLUSTER_OFFSET,
          computationOffset,
        ),
        user: this.wallet.publicKey,
        signPdaAccount: signPdaAccount(this.programId),
        clusterAccount,
        mxeAccount: getMXEAccAddress(this.programId),
        mempoolAccount: getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          this.programId,
          Buffer.from(getCompDefAccOffset("submit_order_check")).readUInt32LE(),
        ),
        systemProgram: SystemProgram.programId,
        arciumProgram: getArciumProgramId(),
        poolAccount: POOL_ACCOUNT,
        clockAccount: CLOCK_ACCOUNT,
        baseMint,
        vault,
        orderAccount: orderAccountPda(this.programId, orderIdU64),
        orderTicket: orderTicketPda(this.programId, orderIdU64),
        userLedger: this.deriveUserLedger(this.wallet.publicKey),
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      this.provider,
      computationOffset,
      this.programId,
      "confirmed",
    );

    return {
      orderIdU64,
      salt32Hex: Buffer.from(salt32).toString("hex"),
      commitmentHex: Buffer.from(commitment).toString("hex"),
    };
  }

  async fetchBalancesDecrypted(): Promise<bigint[]> {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    const { privateKey: userPriv } = await getOrCreateUserX25519(
      this.wallet.publicKey.toBase58(),
      this.wallet.signMessage,
    );

    const mxePubkey = await getMxePublicKeyWithRetry(
      this.provider,
      this.programId,
    );
    const cipher = cipherForUser(userPriv, mxePubkey);

    const account = this.program.account as Record<
      string,
      { fetch: (pda: PublicKey) => Promise<unknown> }
    >;
    const ledger = (await account.userPrivateLedger.fetch(
      this.deriveUserLedger(this.wallet.publicKey),
    )) as Record<string, unknown>;
    const encryptedBalances = (ledger.encryptedBalances ??
      ledger.encrypted_balances) as Uint8Array[] | number[][];
    const balanceNonce = (ledger.balanceNonce ??
      ledger.balance_nonce ??
      ledger.nonce) as BN;

    if (!encryptedBalances || !balanceNonce) {
      throw new Error("Ledger data missing encrypted balances or nonce");
    }

    const nonceBytes = toU128LE(balanceNonce);
    const balances = cipher.decrypt(encryptedBalances, nonceBytes);
    return balances;
  }
}

export { getProgram };
