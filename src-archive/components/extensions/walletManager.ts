/**
 * walletManager.ts - Solana Wallet Manager
 *
 * Manages Solana wallet connections for Siphon Protocol.
 * Supports: Phantom, Solflare
 *
 * Note: MetaMask/ETH support has been removed. Use Solana wallet adapter.
 */

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

  async connectPhantom(): Promise<WalletConnectionResult> {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        return { success: false, error: 'Phantom wallet can only be connected in a browser environment' };
      }

      // Wait a bit for window.solana to be available (in case extension is loading)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if Phantom wallet is available
      const windowWithSolana = window as Window & {
        solana?: {
          isPhantom?: boolean;
          _phantom?: unknown;
          isConnected?: boolean;
          publicKey?: { toString: () => string };
          connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
          disconnect: () => Promise<void>;
          on: (event: string, handler: () => void) => void;
        }
      };

      const solana = windowWithSolana.solana;

      if (!solana) {
        return { success: false, error: 'Phantom wallet not detected. Please install Phantom wallet extension from https://phantom.app' };
      }

      // Double-check it's actually Phantom
      const isPhantom = solana.isPhantom === true || solana._phantom !== undefined;

      if (!isPhantom) {
        return { success: false, error: 'Phantom wallet not detected. Another Solana wallet extension may be interfering.' };
      }

      // Check if already connected
      if (solana.isConnected && solana.publicKey) {
        const address = solana.publicKey.toString();
        const wallet: WalletInfo = {
          id: 'phantom',
          name: 'Phantom',
          address,
          chain: 'Solana',
          connected: true
        };
        this.connectedWallets.set('phantom', wallet);
        return { success: true, wallet };
      }

      // Connect to Phantom wallet
      let response: { publicKey: { toString: () => string } };
      try {
        if (!solana.connect || typeof solana.connect !== 'function') {
          return { success: false, error: 'Phantom wallet connect method not available. Please refresh the page and try again.' };
        }

        response = await solana.connect({ onlyIfTrusted: false });
      } catch (connectError: unknown) {
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        console.error('Phantom connect() error:', errorMessage);

        if (errorMessage.includes('User rejected') ||
            errorMessage.includes('User cancel') ||
            errorMessage.includes('User cancelled') ||
            errorMessage.includes('User declined')) {
          return { success: false, error: 'Connection rejected. Please try again and approve the connection in Phantom.' };
        }

        throw new Error(`Phantom connection failed: ${errorMessage}`);
      }

      if (!response || !response.publicKey) {
        return { success: false, error: 'Failed to get public key from Phantom wallet' };
      }

      const address = response.publicKey.toString();

      const wallet: WalletInfo = {
        id: 'phantom',
        name: 'Phantom',
        address,
        chain: 'Solana',
        connected: true
      };

      this.connectedWallets.set('phantom', wallet);
      return { success: true, wallet };
    } catch (error: unknown) {
      console.error('Phantom connection error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('User rejected') ||
          errorMessage.includes('User cancel') ||
          errorMessage.includes('User cancelled')) {
        return { success: false, error: 'Connection was cancelled. Please try again and approve the connection in Phantom wallet.' };
      }

      return { success: false, error: `Phantom wallet connection failed. ${errorMessage}` };
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

  async connectWallet(walletId: string): Promise<WalletConnectionResult> {
    switch (walletId) {
      case 'phantom':
      case 'solana': // Legacy alias
        return this.connectPhantom();
      case 'solflare':
        return this.connectSolflare();
      default:
        return { success: false, error: `Unsupported wallet: ${walletId}. Use Phantom or Solflare for Solana.` };
    }
  }

  disconnectWallet(walletId: string): void {
    if (walletId === 'solflare' && this.solflareWallet) {
      this.solflareWallet.disconnect();
    } else if (walletId === 'phantom' || walletId === 'solana') {
      const solana = (window as Window & { solana?: { disconnect: () => Promise<void> } })?.solana;
      if (solana && solana.disconnect) {
        solana.disconnect().catch((error) => {
          console.error('Error disconnecting Phantom wallet:', error);
        });
      }
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
