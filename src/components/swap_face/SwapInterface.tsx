"use client";

import { useState, useEffect } from "react";
import "./SwapInterface.css";
import UnifiedBalanceDisplay from "./UnifiedBalanceDisplay";
import SimpleSwap from "./SimpleSwap";
import ProSwap from "./ProSwap";
import BookOrder from "./BookOrder";
import { isInitialized } from "../../lib/nexus";
import { WalletInfo } from "../../lib/walletManager";

export default function SwapInterface() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProMode, setIsProMode] = useState(false);
  const [isBookOrderMode, setIsBookOrderMode] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Mock SDK state (all core references removed)
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [unifiedBalances, setUnifiedBalances] = useState<Array<{
    symbol: string;
    balance: string;
    balanceInFiat?: number;
    breakdown?: Array<{
      balance: string;
      balanceInFiat?: number;
      chain: {
        id: number;
        logo: string;
        name: string;
      };
      contractAddress?: `0x${string}`;
      decimals?: number;
      isNative?: boolean;
    }>;
    decimals?: number;
    icon?: string;
  }> | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);

  const handleModeSwitch = (mode: 'simple' | 'pro' | 'book') => {
    if (mode === 'pro') {
      setIsProMode(true);
      setIsBookOrderMode(false);
      setIsFullScreen(true);
    } else if (mode === 'book') {
      setIsProMode(false);
      setIsBookOrderMode(true);
      setIsFullScreen(true);
      } else {
      setIsProMode(false);
      setIsBookOrderMode(false);
      setIsFullScreen(false);
    }
  };

  const handleExitFullScreen = () => {
    setIsFullScreen(false);
    setIsProMode(false);
    setIsBookOrderMode(false);
  };

  useEffect(() => {
    // Delay to ensure styles are loaded
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 100);

    // Check if Mock SDK is already initialized
    setSdkInitialized(isInitialized());

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`siphon-container ${isFullScreen ? 'fullscreen' : ''}`}>
      {/* Full-screen overlay */}
      {isFullScreen && (
        <div className="fullscreen-overlay">
          <button className="exit-fullscreen" onClick={handleExitFullScreen}>
            X
          </button>
        </div>
      )}

      {/* Left Sidebar for Unified Balances - Only show when wallet is connected and not in full-screen */}
      {connectedWallet && !isFullScreen && (
        <div className="sidebar-left">
          <UnifiedBalanceDisplay balances={unifiedBalances} isSimpleMode={!isProMode && !isBookOrderMode} />
        </div>
      )}

      <div className={`siphon-window ${isLoaded ? 'loaded' : ''} ${isProMode ? 'pro-mode' : isBookOrderMode ? 'book-mode' : 'simple-mode'} ${isFullScreen ? 'fullscreen-mode' : ''}`}>

        <div className="mode-toggle">
          <button 
            className={`toggle-button ${!isProMode && !isBookOrderMode ? 'active' : ''}`}
            onClick={() => handleModeSwitch('simple')}
          >
            Simple
          </button>
          <button 
            className={`toggle-button ${isProMode ? 'active' : ''}`}
            onClick={() => handleModeSwitch('pro')}
          >
            Pro
          </button>
          <button 
            className={`toggle-button ${isBookOrderMode ? 'active' : ''}`}
            onClick={() => handleModeSwitch('book')}
          >
            Book Order
          </button>
        </div>

        {!isProMode && !isBookOrderMode ? (
          <SimpleSwap
            isLoaded={isLoaded}
            sdkInitialized={sdkInitialized}
            setSdkInitialized={setSdkInitialized}
            unifiedBalances={unifiedBalances}
            setUnifiedBalances={setUnifiedBalances}
            walletConnected={walletConnected}
            setWalletConnected={setWalletConnected}
            connectedWallet={connectedWallet}
            setConnectedWallet={setConnectedWallet}
          />
        ) : isBookOrderMode ? (
          <BookOrder isLoaded={isLoaded} />
        ) : (
          <ProSwap isLoaded={isLoaded} sdkInitialized={sdkInitialized} />
        )}
      </div>
    </div>
  );
}