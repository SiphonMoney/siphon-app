import { walletManager } from "@/components/extensions/walletManager";

/** Resolve the connected EVM wallet address (walletManager + localStorage fallback). */
export function resolveWalletAddress(): string | null {
  const fromManager =
    walletManager.getPrimaryWallet()?.address ??
    walletManager.getConnectedWallets().find((w) => w.id === "metamask")?.address;
  if (fromManager) return fromManager;

  try {
    const stored = localStorage.getItem("siphon-connected-wallet");
    if (stored) {
      const parsed = JSON.parse(stored) as { address?: string };
      if (parsed.address) return parsed.address;
    }
  } catch {
    /* ignore */
  }
  return null;
}
