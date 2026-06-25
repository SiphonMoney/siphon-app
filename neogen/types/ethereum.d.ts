import type { EIP1193Provider } from "viem";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    phantom?: { ethereum?: EIP1193Provider; solana?: unknown };
  }
}

export {};
