/**
 * walletManager.ts - Solana Wallet Manager
 *
 * Manages Solana wallet connections for Siphon Protocol.
 * This is the lib version - use components/extensions/walletManager.ts for UI components.
 *
 * Note: MetaMask/ETH support has been removed.
 */

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

  async connectWallet(walletId: string): Promise<WalletConnectionResult> {
    switch (walletId) {
      case 'solana':
      case 'phantom':
        return this.connectSolana();
      default:
        return { success: false, error: `Unsupported wallet: ${walletId}. Use Solana wallet adapter for Phantom/Solflare.` };
    }
  }

  disconnectWallet(walletId: string): void {
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
