/**
 * DEPRECATED: Ethereum type declarations
 *
 * This project has migrated to Solana. ETH type declarations are no longer needed.
 * Keeping this file empty to prevent import errors from legacy code.
 */

declare global {
  interface Window {
    // Solana wallet (Phantom)
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: { toString: () => string };
      connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
    };
  }
}

export {};
