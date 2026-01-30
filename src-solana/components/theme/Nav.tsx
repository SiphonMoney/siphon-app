"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ConnectButton from "@/components/extensions/ConnectButton";
import { WalletInfo } from "@/lib/walletManager";

interface NavProps {
  onWalletConnected?: (wallet: WalletInfo) => void;
}

export default function Nav({ onWalletConnected }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === "/";
  const isDocsPage = pathname === "/docs";
  const isDappPage = pathname?.startsWith("/dapp");
  const isDarkPool = pathname === "/dapp/darkpool";
  const isSwaps = pathname === "/dapp/swaps";
  const isPro = pathname === "/dapp" || pathname === "/dapp/pro";
  const isStrategies = isPro; // Strategies is active when on /dapp or /dapp/pro
  
  const [proViewMode, setProViewMode] = useState<'blueprint' | 'run' | 'discover'>('discover');

  const handleProViewModeChange = (mode: 'blueprint' | 'run' | 'discover') => {
    setProViewMode(mode);
    // Navigate to dapp page if not already there
    if (!isPro) {
      router.push('/dapp');
    }
    // Trigger view mode change event for Nexus component
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pro-view-mode-change', { detail: mode }));
    }
  };

  return (
    <nav>
      <div className="nav-container">
        {/* Left: Logo */}
        <div className="logo">
        <Link href="/" className="logo-link">
          <div className="logo-container">
            <svg width="24" height="20" viewBox="0 0 97.34 80" className="logo-svg">
              <path d="M70.66,35.93a11.66,11.66,0,0,1,1,.83c1.84,1.89,3.69,3.78,5.5,5.7,2.24,2.35,2.14,1.66-.06,3.9-4.47,4.53-9,9-13.49,13.49-1,1-1,1.09-.16,1.95q7.47,7.5,15,15c.85.85,1,.85,1.83,0q7.5-7.47,15-15c.84-.85.83-1,0-1.84-1.58-1.61-3.2-3.2-4.8-4.8l-9.72-9.73c-1.05-1-1-1.07,0-2.14.07-.08.15-.15.23-.23L92.22,32c1.5-1.47,3-2.94,4.49-4.43.86-.87.84-.9,0-1.81-.14-.16-.3-.3-.46-.46L81.59,10.63Q76.67,5.71,71.75.8c-1.07-1.07-1.09-1.07-2.17,0L64.82,5.66,37.45,33.19q-5.19,5.22-10.38,10.43c-.88.88-.9.87-1.77,0S23.83,42,23.08,41.26c-1.46-1.5-2.95-3-4.41-4.5-1.05-1.1-1-1.11,0-2.16l.23-.23Q25.94,27.28,33,20.19c1.08-1.08,1.09-1.08,0-2.16q-4.27-4.31-8.56-8.59c-2.06-2.06-4.11-4.13-6.18-6.17-.94-.93-1-.91-1.95,0-.2.18-.39.37-.58.56q-6.52,6.53-13,13c-.46.46-.92.91-1.36,1.38-.74.81-.73.88,0,1.73.18.2.37.38.56.57l8.81,8.81c1.83,1.83,3.64,3.67,5.49,5.49.54.52.62.95,0,1.46-.33.28-.62.61-.92.91L.85,51.75a3.65,3.65,0,0,0-.76.82,1.43,1.43,0,0,0,0,1c.1.28.42.48.64.71q12,12.45,24.05,24.89c1.1,1.14,1.11,1.14,2.28,0l29.48-29.3,13.2-13.1C70,36.47,70.3,36.24,70.66,35.93Z" fill="currentColor"/>
            </svg>
            <p>Siphon Protocol</p>
          </div>
        </Link>
      </div>

      {/* Center: Menu Buttons (only for dapp pages) */}
      {isDappPage && (
        <div className="nav-center">
          {/* Dark button */}
          <Link 
            href="/dapp/darkpool"
            className={`nav-single-btn ${isDarkPool ? 'active' : ''}`}
          >
            <div className="nav-single-btn-content">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              Darkpools
            </div>
          </Link>
          {/* Swap button */}
          <div 
            className={`nav-single-btn nav-single-btn-disabled ${isSwaps ? 'active' : ''}`}
          >
            <div className="nav-single-btn-content">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
              </svg>
              Swap
            </div>
            <span className="nav-soon-tag">soon</span>
          </div>
          {/* Strategies button - expands to show Discover/Build/Run */}
          <div className={`nav-strategies-container ${isStrategies ? 'expanded' : ''}`}>
            <Link 
              href="/dapp"
              className={`nav-single-btn ${isStrategies ? 'active' : ''}`}
            >
              <div className="nav-single-btn-content">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Strategies
              </div>
            </Link>
            {/* Expanded Discover/Build/Run buttons - only visible when Strategies is active */}
            {isStrategies && (
              <div className="nav-strategies-expanded">
                <button
                  className={`nav-mode-btn ${proViewMode === 'discover' ? 'active' : ''}`}
                  onClick={() => handleProViewModeChange('discover')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Discover
                </button>
                <button
                  className={`nav-mode-btn ${proViewMode === 'blueprint' ? 'active' : ''}`}
                  onClick={() => handleProViewModeChange('blueprint')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  Build
                </button>
                <button
                  className={`nav-mode-btn ${proViewMode === 'run' ? 'active' : ''}`}
                  onClick={() => handleProViewModeChange('run')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run
                </button>
              </div>
            )}
          </div>
          {/* Vertical divider */}
          <div className="nav-divider"></div>
          {/* Docs button */}
          <Link 
            href="/docs" 
            className={`nav-mode-btn ${isDocsPage ? 'active' : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            docs
          </Link>
        </div>
      )}

      {/* Right: Menu Buttons for Home/Docs, Wallet for Dapp */}
      {(isHomePage || isDocsPage) && (
        <div className="nav-right">
          <div className="nav-mode-selector">
            <Link 
              href="/docs" 
              className={`nav-mode-btn ${isDocsPage ? 'active' : ''}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              docs
            </Link>
            <Link 
              href="/dapp" 
              className={`nav-mode-btn ${pathname?.startsWith('/dapp') ? 'active' : ''}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              dapp
            </Link>
          </div>
        </div>
      )}

      {/* Right: Wallet Connector for Dapp pages */}
      {isDappPage && (
        <div className="nav-wallet">
          <ConnectButton 
            className="top-connect-button"
            onConnected={onWalletConnected}
          />
        </div>
      )}
      </div>
    </nav>
  );
}


