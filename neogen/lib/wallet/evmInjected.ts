import type { EIP1193Provider } from "viem";

type WindowWithPhantomEth = Window & {
  phantom?: { ethereum?: EIP1193Provider };
};

/** Prefer Phantom’s EVM provider when present so Base / Base Sepolia match the Phantom UI. */
export function getInjectedEthereum(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const phantomEth = (window as WindowWithPhantomEth).phantom?.ethereum;
  if (phantomEth && typeof phantomEth.request === "function") {
    return phantomEth;
  }
  const eth = window.ethereum;
  if (eth && typeof eth.request === "function") {
    return eth;
  }
  return null;
}
