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

      const ethereum = eth as {
        request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
        chainId?: string;
      };

      // Switch to Sepolia network (chain ID: 11155111)
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }], // 11155111 in hex
        });
      } catch (switchError: unknown) {
        // If the chain doesn't exist, add it
        if (switchError && typeof switchError === 'object' && 'code' in switchError && switchError.code === 4902) {
          try {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: {
                  name: 'Ether',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: ['https://sepolia.infura.io/v3/'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              }],
            });
          } catch (addError) {
            return { success: false, error: 'Failed to add Sepolia network. Please add it manually in MetaMask.' };
          }
        } else {
          // User rejected the switch or other error
          const errorMessage = switchError instanceof Error ? switchError.message : 'Failed to switch network';
          return { success: false, error: errorMessage };
        }
      }

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
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

  async connectPhantom(): Promise<WalletConnectionResult> {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        return { success: false, error: 'Phantom wallet can only be connected in a browser environment' };
      }

      // Wait a bit for window.solana to be available (in case extension is loading)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if Phantom wallet is available - specifically check for Phantom
      const windowWithSolana = window as Window & { 
        solana?: { 
          isPhantom?: boolean;
          _phantom?: unknown; // Phantom-specific marker
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

      // Double-check it's actually Phantom (check both isPhantom and _phantom marker)
      const isPhantom = solana.isPhantom === true || solana._phantom !== undefined;
      
      if (!isPhantom) {
        return { success: false, error: 'Phantom wallet not detected. Another Solana wallet extension may be interfering. Please ensure Phantom is installed.' };
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

      // Connect to Phantom wallet with explicit error handling
      let response: { publicKey: { toString: () => string } };
      try {
        // Ensure we're calling Phantom's connect, not another wallet's
        if (!solana.connect || typeof solana.connect !== 'function') {
          return { success: false, error: 'Phantom wallet connect method not available. Please refresh the page and try again.' };
        }
        
        response = await solana.connect({ onlyIfTrusted: false });
      } catch (connectError: unknown) {
        // User may have rejected the connection
        const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
        console.error('Phantom connect() error:', errorMessage);
        
        // Check for common error patterns
        if (errorMessage.includes('User rejected') || 
            errorMessage.includes('User cancel') ||
            errorMessage.includes('User cancelled') ||
            errorMessage.includes('User declined')) {
          return { success: false, error: 'Connection rejected. Please try again and approve the connection in Phantom.' };
        }
        
        // If error mentions MetaMask, it's a conflict issue
        if (errorMessage.toLowerCase().includes('metamask')) {
          return { success: false, error: 'Wallet conflict detected. Please ensure only Phantom wallet is handling Solana connections, or try disabling MetaMask temporarily.' };
        }
        
        // Re-throw to be caught by outer catch
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
      
      // Filter out MetaMask-related errors if they appear
      if (errorMessage.toLowerCase().includes('metamask')) {
        return { success: false, error: 'Unable to connect Phantom. MetaMask may be interfering. Try refreshing the page or disabling MetaMask temporarily.' };
      }
      
      // Provide more helpful error messages
      if (errorMessage.includes('User rejected') || 
          errorMessage.includes('User cancel') ||
          errorMessage.includes('User cancelled')) {
        return { success: false, error: 'Connection was cancelled. Please try again and approve the connection in Phantom wallet.' };
      }
      
      // Generic error with Phantom branding
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
      case 'phantom':
        return this.connectPhantom();
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
    } else if (walletId === 'phantom') {
      // Disconnect Phantom wallet
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
