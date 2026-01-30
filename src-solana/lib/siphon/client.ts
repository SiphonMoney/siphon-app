import { Program, AnchorProvider, BN, setProvider, Idl } from '@coral-xyz/anchor';
import {
  PublicKey,
  SystemProgram,
  Connection,
  TransactionSignature,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import {
  SIPHON_PROGRAM_ID,
  CONFIG_SEED,
  VAULT_SEED,
  VAULT_TOKEN_SEED,
  WITHDRAWAL_SEED,
} from './constants';

// Import IDL as JSON (Anchor 0.29 format)
import idlJson from './idl.json';

export interface VaultInfo {
  owner: PublicKey;
  assetMint: PublicKey;
  amount: BN;
  privacyPoolAmount: BN;
  strategies: BN[];
  status: { active: Record<string, never> } | { pendingPrivateWithdrawal: Record<string, never> } | { frozen: Record<string, never> };
  createdAt: BN;
  bump: number;
}

export interface ConfigInfo {
  admin: PublicKey;
  executor: PublicKey;
  feeBps: number;
  treasury: PublicKey;
  paused: boolean;
  bump: number;
}

export class SiphonClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;
  provider: AnchorProvider;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    // Set the provider globally for signing transactions
    setProvider(provider);

    // Use the JSON IDL and pass programId explicitly
    // This works with both Anchor 0.29 and 0.30 style IDLs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idl = idlJson as any;

    // Add the address field for Anchor 0.30+ compatibility
    if (!idl.address) {
      idl.address = SIPHON_PROGRAM_ID.toBase58();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program(idl as Idl, SIPHON_PROGRAM_ID, provider);
  }

  // Get config PDA
  getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(CONFIG_SEED)],
      SIPHON_PROGRAM_ID
    );
  }

  // Get vault PDA
  getVaultPDA(owner: PublicKey, assetMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(VAULT_SEED), owner.toBuffer(), assetMint.toBuffer()],
      SIPHON_PROGRAM_ID
    );
  }

  // Get vault token account PDA
  getVaultTokenPDA(vault: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(VAULT_TOKEN_SEED), vault.toBuffer()],
      SIPHON_PROGRAM_ID
    );
  }

  // Get pending withdrawal PDA
  getWithdrawalPDA(vault: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(WITHDRAWAL_SEED), vault.toBuffer()],
      SIPHON_PROGRAM_ID
    );
  }

  // Fetch config account
  async getConfig(): Promise<ConfigInfo | null> {
    try {
      const [configPDA] = this.getConfigPDA();
      // Account name from IDL: "SiphonConfig" -> camelCase: "siphonConfig"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await (this.program.account as any).siphonConfig.fetch(configPDA);
      return config as ConfigInfo;
    } catch {
      return null;
    }
  }

  // Fetch vault account
  async getVault(owner: PublicKey, assetMint: PublicKey): Promise<VaultInfo | null> {
    try {
      const [vaultPDA] = this.getVaultPDA(owner, assetMint);
      // Account name from IDL: "SiphonVault" -> camelCase: "siphonVault"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vault = await (this.program.account as any).siphonVault.fetch(vaultPDA);
      return vault as VaultInfo;
    } catch {
      return null;
    }
  }

  // Check if vault exists
  async vaultExists(owner: PublicKey, assetMint: PublicKey): Promise<boolean> {
    const vault = await this.getVault(owner, assetMint);
    return vault !== null;
  }

  // Create vault
  async createVault(assetMint: PublicKey): Promise<TransactionSignature> {
    const owner = this.provider.wallet.publicKey;
    const [configPDA] = this.getConfigPDA();
    const [vaultPDA] = this.getVaultPDA(owner, assetMint);
    const [vaultTokenPDA] = this.getVaultTokenPDA(vaultPDA);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.program.methods as any)
      .createVault()
      .accounts({
        owner,
        config: configPDA,
        assetMint,
        vault: vaultPDA,
        vaultTokenAccount: vaultTokenPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  // Deposit tokens
  async deposit(assetMint: PublicKey, amount: BN): Promise<TransactionSignature> {
    const owner = this.provider.wallet.publicKey;
    const [configPDA] = this.getConfigPDA();
    const [vaultPDA] = this.getVaultPDA(owner, assetMint);
    const [vaultTokenPDA] = this.getVaultTokenPDA(vaultPDA);

    // Get user's token account
    const userTokenAccount = await this.getOrCreateTokenAccount(
      this.provider.connection,
      assetMint,
      owner
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.program.methods as any)
      .deposit(amount)
      .accounts({
        owner,
        config: configPDA,
        vault: vaultPDA,
        assetMint,
        userTokenAccount,
        vaultTokenAccount: vaultTokenPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  // Withdraw tokens (direct, non-private)
  async withdrawDirect(assetMint: PublicKey, amount: BN): Promise<TransactionSignature> {
    const owner = this.provider.wallet.publicKey;
    const [configPDA] = this.getConfigPDA();
    const [vaultPDA] = this.getVaultPDA(owner, assetMint);
    const [vaultTokenPDA] = this.getVaultTokenPDA(vaultPDA);

    // Get user's token account
    const userTokenAccount = await this.getOrCreateTokenAccount(
      this.provider.connection,
      assetMint,
      owner
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.program.methods as any)
      .withdrawDirect(amount)
      .accounts({
        owner,
        config: configPDA,
        vault: vaultPDA,
        assetMint,
        userTokenAccount,
        vaultTokenAccount: vaultTokenPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  // Create or get user token account
  async getOrCreateTokenAccount(
    connection: Connection,
    mint: PublicKey,
    owner: PublicKey
  ): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(mint, owner);

    try {
      await getAccount(connection, ata);
      return ata;
    } catch {
      // Account doesn't exist, create it
      const ix = createAssociatedTokenAccountInstruction(
        this.provider.wallet.publicKey,
        ata,
        owner,
        mint
      );

      const tx = await this.provider.sendAndConfirm(
        new (await import('@solana/web3.js')).Transaction().add(ix)
      );
      console.log('Created token account:', tx);
      return ata;
    }
  }

  // Initiate private withdrawal (vault PDA -> executor token account)
  async initiatePrivateWithdrawal(
    assetMint: PublicKey,
    amount: BN,
    recipient: PublicKey
  ): Promise<TransactionSignature> {
    const owner = this.provider.wallet.publicKey;
    const [configPDA] = this.getConfigPDA();
    const [vaultPDA] = this.getVaultPDA(owner, assetMint);
    const [vaultTokenPDA] = this.getVaultTokenPDA(vaultPDA);
    const [withdrawalPDA] = this.getWithdrawalPDA(vaultPDA);

    // Get executor pubkey from config
    const config = await this.getConfig();
    if (!config) {
      throw new Error('Siphon config not found');
    }

    // Get executor's token account (ATA for the asset mint)
    const executorTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      config.executor
    );

    // Ensure executor's ATA exists (create if needed, user pays rent)
    const preInstructions = [];
    try {
      await getAccount(this.provider.connection, executorTokenAccount);
    } catch {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          owner, // payer
          executorTokenAccount,
          config.executor, // owner of the ATA
          assetMint
        )
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.program.methods as any)
      .initiatePrivateWithdrawal(amount, recipient)
      .accounts({
        owner,
        config: configPDA,
        vault: vaultPDA,
        assetMint,
        pendingWithdrawal: withdrawalPDA,
        vaultTokenAccount: vaultTokenPDA,
        executorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .rpc();

    return tx;
  }

  // Create strategy
  async createStrategy(
    assetMint: PublicKey,
    strategyId: BN
  ): Promise<TransactionSignature> {
    const owner = this.provider.wallet.publicKey;
    const [configPDA] = this.getConfigPDA();
    const [vaultPDA] = this.getVaultPDA(owner, assetMint);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.program.methods as any)
      .createStrategy(strategyId)
      .accounts({
        owner,
        config: configPDA,
        vault: vaultPDA,
      })
      .rpc();

    return tx;
  }

  // Remove strategy
  async removeStrategy(
    assetMint: PublicKey,
    strategyId: BN
  ): Promise<TransactionSignature> {
    const owner = this.provider.wallet.publicKey;
    const [configPDA] = this.getConfigPDA();
    const [vaultPDA] = this.getVaultPDA(owner, assetMint);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.program.methods as any)
      .removeStrategy(strategyId)
      .accounts({
        owner,
        config: configPDA,
        vault: vaultPDA,
      })
      .rpc();

    return tx;
  }
}
