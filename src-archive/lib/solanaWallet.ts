import { PublicKey, Transaction } from "@solana/web3.js";

export type WalletAdapter = {
  publicKey: PublicKey;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

type BrowserSolana = {
  publicKey?: { toString: () => string };
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  connect?: () => Promise<void>;
};

export function getBrowserWalletAdapter(
  fallbackSignMessage?: (message: Uint8Array) => Promise<Uint8Array>,
): WalletAdapter {
  if (typeof window === "undefined") {
    throw new Error("Wallet not available");
  }

  const solana = (window as Window & { solana?: BrowserSolana }).solana;
  if (!solana?.publicKey) {
    throw new Error("Solana wallet not connected");
  }

  const rawSignMessage =
    (solana.signMessage as unknown as (
      input: Uint8Array | { message: Uint8Array; display?: string },
    ) => Promise<unknown>) ??
    (fallbackSignMessage as unknown as (
      input: Uint8Array | { message: Uint8Array; display?: string },
    ) => Promise<unknown>);
  const signMessage =
    rawSignMessage &&
    (async (message: Uint8Array): Promise<Uint8Array> => {
      const attempt = async (
        input: Uint8Array | { message: Uint8Array; display?: string },
      ) => {
        const result = await rawSignMessage(input);
        if (result instanceof Uint8Array) {
          return result;
        }
        if (result && typeof result === "object" && "signature" in result) {
          return (result as { signature: Uint8Array }).signature;
        }
        throw new Error("Invalid signMessage response from wallet");
      };

      try {
        const display = new TextDecoder().decode(message);
        return await attempt({ message, display });
      } catch (error) {
        try {
          return await attempt({ message });
        } catch (nestedError) {
          try {
            return await attempt(message);
          } catch {
            throw error instanceof Error ? error : nestedError;
          }
        }
      }
    });
  return {
    publicKey: new PublicKey(solana.publicKey.toString()),
    signTransaction: solana.signTransaction,
    signAllTransactions: solana.signAllTransactions,
    signMessage,
  };
}

export function toU64Amount(value: string, decimals: number): bigint {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid amount");
  }
  return BigInt(Math.round(numeric * 10 ** decimals));
}
