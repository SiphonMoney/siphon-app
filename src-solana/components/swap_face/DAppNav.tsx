"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "./extensions/ConnectButton";
import { WalletInfo } from "../../lib/walletManager";
import "./SwapInterface.css";

interface DAppNavProps {
  onWalletConnected?: (wallet: WalletInfo) => void;
}

export default function DAppNav({ onWalletConnected }: DAppNavProps) {
  const pathname = usePathname();
  const isDarkPool = pathname === "/dapp/darkpool";
  const isPro = pathname === "/dapp/pro";
  const isSwaps = pathname === "/dapp/swaps";

  return (
    <>
      {/* Wallet Connector */}
      <div className="top-right-wallet-connector">
        <ConnectButton 
          className="top-connect-button"
          onConnected={onWalletConnected}
        />
      </div>
    </>
  );
}

