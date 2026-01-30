'use client';

import { FC, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SolanaProvider, SolanaNetwork } from './SolanaProvider';
import { NEXT_PUBLIC_SOLANA_NETWORK, NEXT_PUBLIC_SOLANA_RPC_URL } from '../lib/config';

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
  return NEXT_PUBLIC_SOLANA_NETWORK;
};

export const Providers: FC<ProvidersProps> = ({ children }) => {
  const network = getNetwork();
  const rpcUrl = NEXT_PUBLIC_SOLANA_RPC_URL;

  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider network={network} customRpcUrl={rpcUrl}>
        {children}
      </SolanaProvider>
    </QueryClientProvider>
  );
};

export default Providers;
