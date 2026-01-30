'use client';

import { FC, ReactNode, useMemo, useEffect } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useAnchorWallet,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { initializeSiphonClient } from '../lib/solanaHandler';
import { initializeRangeClient } from '../lib/range';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Network configuration
export type SolanaNetwork = 'mainnet-beta' | 'devnet' | 'testnet';

interface SolanaProviderProps {
  children: ReactNode;
  network?: SolanaNetwork;
  customRpcUrl?: string;
}

// Initialize Range compliance client on module load
const initializeComplianceClient = () => {
  const rangeApiKey = process.env.NEXT_PUBLIC_RANGE_API_KEY;
  const rangeApiUrl = process.env.NEXT_PUBLIC_RANGE_API_URL || 'https://api.range.org/v1';

  if (rangeApiKey) {
    initializeRangeClient({
      apiKey: rangeApiKey,
      baseUrl: rangeApiUrl,
      riskThreshold: 70, // Block addresses with risk score > 70
    });
    console.log('[Range] Compliance client initialized');
  } else {
    console.warn('[Range] API key not configured - compliance checks will be skipped');
  }
};

// Run once on module load
if (typeof window !== 'undefined') {
  initializeComplianceClient();
}

export const SolanaProvider: FC<SolanaProviderProps> = ({
  children,
  network = 'devnet',
  customRpcUrl,
}) => {
  // Get RPC endpoint - prefer Helius over default public endpoints
  const endpoint = useMemo(() => {
    // Priority 1: Custom RPC URL passed as prop
    if (customRpcUrl) return customRpcUrl;

    // Priority 2: Helius RPC from environment variable
    const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (heliusApiKey) {
      const heliusNetwork = network === 'mainnet-beta' ? 'mainnet' : network;
      return `https://${heliusNetwork}.helius-rpc.com/?api-key=${heliusApiKey}`;
    }

    // Priority 3: Generic RPC URL from environment
    const envRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (envRpc) return envRpc;

    // Priority 4: Fall back to default cluster URL (rate limited)
    console.warn('[Solana] Using default RPC endpoint - consider configuring Helius for better performance');
    const defaultEndpoint = clusterApiUrl(network);
    console.log('[Solana] Current network:', network);
    console.log('[Solana] Current endpoint:', defaultEndpoint);
    return defaultEndpoint;
  }, [network, customRpcUrl]);

  // Initialize wallet adapters
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      // new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SiphonClientInitializer>{children}</SiphonClientInitializer>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

// Component to initialize Siphon client when wallet connects
const SiphonClientInitializer: FC<{ children: ReactNode }> = ({ children }) => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  useEffect(() => {
    if (wallet && wallet.publicKey) {
      try {
        const provider = new AnchorProvider(connection, wallet, {
          commitment: 'confirmed',
        });
        initializeSiphonClient(provider);
        console.log('[Siphon] Client initialized for wallet:', wallet.publicKey.toBase58());
      } catch (error) {
        console.error('[Siphon] Failed to initialize client:', error);
      }
    }
  }, [connection, wallet]);

  return <>{children}</>;
};

export default SolanaProvider;
