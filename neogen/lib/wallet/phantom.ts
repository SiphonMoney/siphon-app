export type PhantomSolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    solana?: PhantomSolanaProvider;
    phantom?: { solana?: PhantomSolanaProvider };
  }
}

/** Phantom exposes `window.phantom.solana`; some builds use `window.solana`. */
export function getPhantomSolana(): PhantomSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const p = window.phantom?.solana ?? window.solana;
  if (p && typeof p.connect === "function") return p;
  return null;
}
