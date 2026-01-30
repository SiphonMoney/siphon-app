'use client';

import { FC, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SolanaProvider, SolanaNetwork } from './SolanaProvider';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

interface ProvidersProps {
  children: ReactNode;
}

// Get network from environment
const getNetwork = (): SolanaNetwork => {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  if (network === 'mainnet-beta' || network === 'devnet' || network === 'testnet') {
    return network;
  }
  return 'devnet'; // Default to devnet for development
};

export const Providers: FC<ProvidersProps> = ({ children }) => {
  const network = getNetwork();
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider network={network} customRpcUrl={rpcUrl}>
        {children}
      </SolanaProvider>
    </QueryClientProvider>
  );
};

export default Providers;
