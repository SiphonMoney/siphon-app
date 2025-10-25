import Solflare from '@solflare-wallet/sdk';

export interface WalletInfo {
  id: string;
  name: string;
  address: string;
  chain: string;
  connected: boolean;
}

export interface WalletConnectionResult {
  success: boolean;
  wallet?: WalletInfo;
  error?: string;
}

class WalletManager {
  private connectedWallets: Map<string, WalletInfo> = new Map();
  private solflareWallet: Solflare | null = null;

  async connectMetaMask(): Promise<WalletConnectionResult> {
    try {
      const eth = (window as Window & { ethereum?: unknown })?.ethereum;
      if (!eth) {
        return { success: false, error: 'MetaMask not detected. Please install MetaMask.' };
      }

      const accounts = await (eth as { request: (params: { method: string }) => Promise<string[]> }).request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        return { success: false, error: 'No accounts found' };
      }

      const address = accounts[0];
      const wallet: WalletInfo = {
        id: 'metamask',
        name: 'MetaMask',
        address,
        chain: 'EVM',
        connected: true
      };

      this.connectedWallets.set('metamask', wallet);
      return { success: true, wallet };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect MetaMask' };
    }
  }

  async connectSolana(): Promise<WalletConnectionResult> {
    try {
      // Check if Phantom wallet is available
      const phantom = (window as Window & { solana?: { isPhantom?: boolean } })?.solana?.isPhantom;
      if (!phantom) {
        return { success: false, error: 'Phantom wallet not detected. Please install Phantom.' };
      }

        const response = await (window as unknown as { solana: { connect: () => Promise<{ publicKey: { toString: () => string } }> } }).solana.connect();
      const address = response.publicKey.toString();

      const wallet: WalletInfo = {
        id: 'solana',
        name: 'Solana',
        address,
        chain: 'Solana',
        connected: true
      };

      this.connectedWallets.set('solana', wallet);
      return { success: true, wallet };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect Solana wallet' };
    }
  }

  async connectSolflare(): Promise<WalletConnectionResult> {
    try {
      // Initialize Solflare wallet if not already done
      if (!this.solflareWallet) {
        this.solflareWallet = new Solflare();
      }

      console.log('Solflare wallet instance:', this.solflareWallet);

      // Connect to Solflare wallet
      await this.solflareWallet.connect();
      
      console.log('Solflare connected successfully');
      console.log('Public key:', this.solflareWallet.publicKey);

      if (!this.solflareWallet.publicKey) {
        return { success: false, error: 'Failed to get public key from Solflare wallet' };
      }

      const address = this.solflareWallet.publicKey.toString();

      const wallet: WalletInfo = {
        id: 'solflare',
        name: 'Solflare',
        address,
        chain: 'Solana',
        connected: true
      };

      this.connectedWallets.set('solflare', wallet);
      return { success: true, wallet };
    } catch (error: unknown) {
      console.error('Solflare connection error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect Solflare wallet' };
    }
  }

  async connectBitcoin(): Promise<WalletConnectionResult> {
    try {
      // Check if a Bitcoin wallet is available (e.g., Xverse, Unisat, etc.)
      const bitcoinWallet = (window as Window & { unisat?: unknown })?.unisat;
      if (!bitcoinWallet) {
        return { success: false, error: 'Bitcoin wallet not detected. Please install a Bitcoin wallet like Unisat or Xverse.' };
      }

      const accounts = await (bitcoinWallet as { requestAccounts: () => Promise<string[]> }).requestAccounts();
      if (accounts.length === 0) {
        return { success: false, error: 'No Bitcoin accounts found' };
      }

      const address = accounts[0];
      const wallet: WalletInfo = {
        id: 'bitcoin',
        name: 'Bitcoin',
        address,
        chain: 'Bitcoin',
        connected: true
      };

      this.connectedWallets.set('bitcoin', wallet);
      return { success: true, wallet };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect Bitcoin wallet' };
    }
  }

  async connectMonero(): Promise<WalletConnectionResult> {
    try {
      // Monero wallet connection would typically require a different approach
      // For now, we'll simulate a connection
      const address = 'Monero address would be generated here';
      
      const wallet: WalletInfo = {
        id: 'xmr',
        name: 'Monero',
        address,
        chain: 'Monero',
        connected: true
      };

      this.connectedWallets.set('xmr', wallet);
      return { success: true, wallet };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect Monero wallet' };
    }
  }

  async connectWallet(walletId: string): Promise<WalletConnectionResult> {
    switch (walletId) {
      case 'metamask':
        return this.connectMetaMask();
      case 'solana':
        return this.connectSolana();
      case 'solflare':
        return this.connectSolflare();
      case 'bitcoin':
        return this.connectBitcoin();
      case 'xmr':
        return this.connectMonero();
      default:
        return { success: false, error: 'Unknown wallet type' };
    }
  }

  disconnectWallet(walletId: string): void {
    if (walletId === 'solflare' && this.solflareWallet) {
      this.solflareWallet.disconnect();
    }
    this.connectedWallets.delete(walletId);
  }

  getConnectedWallets(): WalletInfo[] {
    return Array.from(this.connectedWallets.values());
  }

  getWallet(walletId: string): WalletInfo | undefined {
    return this.connectedWallets.get(walletId);
  }

  isWalletConnected(walletId: string): boolean {
    return this.connectedWallets.has(walletId);
  }

  getPrimaryWallet(): WalletInfo | undefined {
    // Return the first connected wallet as primary
    return this.getConnectedWallets()[0];
  }
}

export const walletManager = new WalletManager();
