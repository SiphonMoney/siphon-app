"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/theme/Nav";
import DAppNav from "@/components/swap_face/DAppNav";
import DarkPoolInterface from "@/components/darkpool/DarkPoolInterface";
import { WalletInfo, walletManager } from "@/lib/walletManager";
import styles from "../../hero.module.css";

const marqueeKeyframes = `
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes fadeInUp {
    0% { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
`;

export default function DarkPoolPage() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const handleWalletConnected = (wallet: WalletInfo) => {
    console.log('Wallet connected:', wallet);
    setWalletConnected(true);
    setConnectedWallet(wallet);
    localStorage.setItem('siphon-connected-wallet', JSON.stringify(wallet));
  };

  const handleDisconnect = () => {
    if (connectedWallet) {
      walletManager.disconnectWallet(connectedWallet.id);
    }
    setWalletConnected(false);
    setConnectedWallet(null);
    localStorage.removeItem('siphon-connected-wallet');
  };

  const handleDemoClick = () => {
    setIsDemoMode(true);
  };

  useEffect(() => {
    // Check for actual wallet connection, not just localStorage
    const checkWalletConnection = async () => {
      try {
        // Check if wallet is actually connected in the browser
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const solana = (window as any).solana;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const solflare = (window as any).solflare;
          
          // Check Phantom or Solflare
          const provider = solflare?.isSolflare ? solflare : solana;
          
          if (provider && provider.isConnected && provider.publicKey) {
            // Wallet is actually connected
            const persistedWallet = localStorage.getItem('siphon-connected-wallet');
            if (persistedWallet) {
              try {
                const wallet = JSON.parse(persistedWallet);
                // Verify the address matches
                if (wallet.address === provider.publicKey.toString()) {
                  console.log('Restored wallet connection:', wallet);
                  setConnectedWallet(wallet);
                  setWalletConnected(true);
                } else {
                  // Address mismatch, clear storage
                  console.log('Wallet address mismatch, clearing storage');
                  localStorage.removeItem('siphon-connected-wallet');
                }
              } catch (error) {
                console.error('Failed to parse persisted wallet:', error);
                localStorage.removeItem('siphon-connected-wallet');
              }
            }
          } else {
            // No active wallet connection, clear any stale data
            console.log('No active wallet connection detected');
            localStorage.removeItem('siphon-connected-wallet');
            setConnectedWallet(null);
            setWalletConnected(false);
          }
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
        localStorage.removeItem('siphon-connected-wallet');
      } finally {
        setIsCheckingWallet(false);
      }
    };

    checkWalletConnection();
  }, []);

  // Show loading while checking wallet connection
  const walletAddress = (walletConnected && connectedWallet) ? connectedWallet.address : null;

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#000',
      position: 'relative'
    }}>
      <Nav />
      <DAppNav onWalletConnected={handleWalletConnected} />
      
      {/* Hero text, logo and subtitle - behind everything */}
      <div className={styles.heroContainer} style={{ zIndex: 1 }}>
        {/* SVG Logo */}
        <svg 
          className={styles.logo}
          viewBox="0 0 97.34 80" 
        >
          <path 
            d="M70.66,35.93a11.66,11.66,0,0,1,1,.83c1.84,1.89,3.69,3.78,5.5,5.7,2.24,2.35,2.14,1.66-.06,3.9-4.47,4.53-9,9-13.49,13.49-1,1-1,1.09-.16,1.95q7.47,7.5,15,15c.85.85,1,.85,1.83,0q7.5-7.47,15-15c.84-.85.83-1,0-1.84-1.58-1.61-3.2-3.2-4.8-4.8l-9.72-9.73c-1.05-1-1-1.07,0-2.14.07-.08.15-.15.23-.23L92.22,32c1.5-1.47,3-2.94,4.49-4.43.86-.87.84-.9,0-1.81-.14-.16-.3-.3-.46-.46L81.59,10.63Q76.67,5.71,71.75.8c-1.07-1.07-1.09-1.07-2.17,0L64.82,5.66,37.45,33.19q-5.19,5.22-10.38,10.43c-.88.88-.9.87-1.77,0S23.83,42,23.08,41.26c-1.46-1.5-2.95-3-4.41-4.5-1.05-1.1-1-1.11,0-2.16l.23-.23Q25.94,27.28,33,20.19c1.08-1.08,1.09-1.08,0-2.16q-4.27-4.31-8.56-8.59c-2.06-2.06-4.11-4.13-6.18-6.17-.94-.93-1-.91-1.95,0-.2.18-.39.37-.58.56q-6.52,6.53-13,13c-.46.46-.92.91-1.36,1.38-.74.81-.73.88,0,1.73.18.2.37.38.56.57l8.81,8.81c1.83,1.83,3.64,3.67,5.49,5.49.54.52.62.95,0,1.46-.33.28-.62.61-.92.91L.85,51.75a3.65,3.65,0,0,0-.76.82,1.43,1.43,0,0,0,0,1c.1.28.42.48.64.71q12,12.45,24.05,24.89c1.1,1.14,1.11,1.14,2.28,0l29.48-29.3,13.2-13.1C70,36.47,70.3,36.24,70.66,35.93Z" 
            fill="#ffffff" 
          />
        </svg>
        
        {/* Hero text container */}
        <div className={styles.heroTextContainer}>
          {/* Main title */}
          <h1 className={styles.heroTitle}>
            siphon
          </h1>
          
          {/* Subtitle */}
          <p className={styles.heroSubtitle}>
            trade without a trace
          </p>
        </div>
      </div>
      
      {/* Semi-transparent overlay - between logo and DApp */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.97)',
          zIndex: 2,
          pointerEvents: 'none'
        }}
      />
      
      {/* DApp Interface - on top of everything */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}>
        <div style={{
          width: '98vw',
          height: '90vh',
          maxWidth: 'none',
          pointerEvents: 'auto',
          position: 'relative'
        }}>
          {/* Marquee Disclaimer - Blue */}
          {!isDemoMode && (
            <>
              <style>{marqueeKeyframes}</style>
              <div style={{
                position: 'absolute',
                top: '60px',
                left: 0,
                right: 0,
                zIndex: 3000,
                background: 'rgba(59, 130, 246, 0.15)',
                borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '0.5rem 0',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                opacity: 0,
                animation: 'fadeIn 0.6s ease-in 0.2s forwards'
              }}>
                <div style={{
                  display: 'flex',
                  width: '200%',
                  animation: 'marquee 20s linear infinite'
                }}>
                  <div style={{
                    fontFamily: 'var(--font-source-code), monospace',
                    fontSize: '11px',
                    color: 'rgba(59, 130, 246, 0.9)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    flex: '0 0 50%'
                  }}>
                    ⚠️ SWITCH YOUR WALLET TO DEVNET BEFORE CONNECTING - SET YOUR WALLET NETWORK TO DEVNET IN WALLET SETTINGS ⚠️
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-source-code), monospace',
                    fontSize: '11px',
                    color: 'rgba(59, 130, 246, 0.9)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    flex: '0 0 50%'
                  }}>
                    ⚠️ SWITCH YOUR WALLET TO DEVNET BEFORE CONNECTING - SET YOUR WALLET NETWORK TO DEVNET IN WALLET SETTINGS ⚠️
                  </div>
                </div>
              </div>
            </>
          )}
          
          {/* Blurred content */}
          <div style={{
            filter: isDemoMode ? 'none' : 'blur(3px)',
            pointerEvents: isDemoMode ? 'auto' : 'none',
            width: '100%',
            height: '100%',
            opacity: isDemoMode ? 1 : 0,
            transition: isDemoMode ? 'opacity 0.4s ease-in, filter 0.4s ease-in' : 'none',
            animation: isDemoMode ? undefined : 'fadeIn 0.8s ease-in 0.1s forwards',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div 
              key={`darkpool-${isDemoMode}`}
              style={{
                opacity: isDemoMode ? 1 : 0,
                transition: isDemoMode ? 'opacity 0.5s ease-in 0.1s' : 'none',
                animation: isDemoMode ? undefined : 'fadeIn 0.6s ease-in 0.3s forwards',
                width: '100%',
                height: '100%'
              }}
            >
              {isCheckingWallet ? (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255, 255, 255, 0.9)'
                }}>
                  <div style={{ 
                    textAlign: 'center',
                    fontFamily: 'var(--font-source-code), monospace'
                  }}>
                    <div style={{
                      border: '2px solid rgba(255, 255, 255, 0.1)',
                      borderTop: '2px solid rgba(255, 255, 255, 0.6)',
                      borderRadius: '50%',
                      width: '40px',
                      height: '40px',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 16px'
                    }} />
                    <p style={{
                      fontSize: '14px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'rgba(255, 255, 255, 0.7)'
                    }}>Checking wallet connection...</p>
                  </div>
                </div>
              ) : (
                <DarkPoolInterface
                  walletAddress={walletAddress}
                  walletName={connectedWallet?.name}
                  onDisconnect={handleDisconnect}
                  onWalletConnected={handleWalletConnected}
                />
              )}
            </div>
          </div>
          
          {/* Presentation Module Overlay */}
          {!isDemoMode && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(4px)',
              paddingTop: '2rem',
              opacity: 0,
              animation: 'fadeIn 0.8s ease-in 0.3s forwards'
            }}>
              <div style={{
                background: 'rgba(0, 0, 0, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '16px',
                width: '90%',
                height: '80%',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                overflow: 'hidden',
                marginTop: '50px',
                opacity: 0,
                transform: 'translateY(20px)',
                animation: 'fadeInUp 0.6s ease-out 0.5s forwards'
              }}>
                {/* Sidebar */}
                <div style={{
                  width: '240px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '2.5rem 2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2rem'
                }}>
                  {/* Title Section */}
                  <div style={{
                    textAlign: 'left'
                  }}>
                    <h2 style={{
                      fontSize: '28px',
                      fontWeight: '700',
                      marginBottom: '1rem',
                      color: 'rgba(255, 255, 255, 0.95)',
                      textTransform: 'uppercase',
                      letterSpacing: '2px',
                      fontFamily: 'var(--font-source-code), monospace',
                      animation: 'fadeIn 0.8s ease-in'
                    }}>
                      Dark Pool
                    </h2>
                    <div style={{
                      width: '80px',
                      height: '2px',
                      background: 'rgba(255, 255, 255, 0.2)',
                      marginBottom: '1.5rem'
                    }} />
                    <p style={{
                      fontSize: '13px',
                      color: 'rgba(255, 255, 255, 0.75)',
                      lineHeight: '1.8',
                      fontFamily: 'var(--font-source-code), monospace',
                      letterSpacing: '0.3px',
                      maxWidth: '200px'
                    }}>
                                  Confidential, institutional, liquidity pools for large trades without market impact.

                    </p>
                  </div>

                  {/* Pools Summary */}
                  <div style={{
                    marginTop: 'auto',
                    paddingTop: '2rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'rgba(255, 255, 255, 0.95)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontFamily: 'var(--font-source-code), monospace',
                      marginBottom: '1rem'
                    }}>
                      Available Pools
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem'
                    }}>
                      {['SOL/USDC', 'SOL/USDT', 'SOL/ZEC', 'SOL/XMR', 'SOL/ETH', 'SOL/BTC'].map((pool) => {
                        const isActive = pool === 'SOL/USDC';
                        return (
                          <div key={pool} style={{
                            background: isActive ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                            border: isActive ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '4px',
                            padding: '0.25rem 0.5rem',
                            fontSize: '9px',
                            color: isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                            fontFamily: 'var(--font-source-code), monospace',
                            fontWeight: '500',
                            opacity: isActive ? 1 : 0.5
                          }}>
                            {pool}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div style={{
                  flex: 1,
                  padding: '2.5rem 3rem',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto'
                }}>
                  {/* Header */}
                  <div style={{
                    marginBottom: '2.5rem'
                  }}>
                    <h1 style={{
                      fontSize: '36px',
                      fontWeight: '700',
                      marginBottom: '1rem',
                      color: 'rgba(255, 255, 255, 0.95)',
                      textTransform: 'uppercase',
                      letterSpacing: '2px',
                      fontFamily: 'var(--font-source-code), monospace'
                    }}>
                      Private Order Matching
                    </h1>
                    <p style={{
                      fontSize: '15px',
                      color: 'rgba(255, 255, 255, 0.75)',
                      lineHeight: '1.8',
                      fontFamily: 'var(--font-source-code), monospace',
                      letterSpacing: '0.3px',
                      maxWidth: '700px'
                    }}>
                      Trade large orders privately through encrypted order batching. Your transactions are matched anonymously using Arcium MPC computation, ensuring complete privacy and preventing front-running.
                    </p>
                  </div>

                  {/* Feature Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    gap: '1rem',
                    marginBottom: '2rem'
                  }}>
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '1.25rem',
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{
                        fontSize: '24px',
                        marginBottom: '0.75rem',
                        filter: 'brightness(0) invert(1)'
                      }}>🔒</div>
                      <h4 style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.95)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '0.5rem',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}>Arcium MPC</h4>
                      <p style={{
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        lineHeight: '1.5',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}>Orders are matched using Arcium Multi-Party Computation, ensuring complete anonymity and privacy.</p>
                    </div>
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '1.25rem',
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{
                        fontSize: '24px',
                        marginBottom: '0.75rem',
                        filter: 'brightness(0) invert(1)'
                      }}>🛡️</div>
                      <h4 style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.95)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '0.5rem',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}>No Front-Running</h4>
                      <p style={{
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        lineHeight: '1.5',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}>Private order matching prevents front-running and market manipulation by keeping orders hidden.</p>
                    </div>
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '1.25rem',
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{
                        fontSize: '24px',
                        marginBottom: '0.75rem',
                        filter: 'brightness(0) invert(1)'
                      }}>📊</div>
                      <h4 style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.95)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '0.5rem',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}>Batch Matching</h4>
                      <p style={{
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        lineHeight: '1.5',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}>Orders are batched and matched efficiently, reducing slippage and improving execution quality.</p>
                    </div>
                   
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginTop: 'auto',
                    paddingTop: '2rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <button
                      onClick={handleDemoClick}
                      style={{
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        borderRadius: '8px',
                        padding: '0.875rem 2.5rem',
                        color: 'rgba(59, 130, 246, 1)',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontFamily: 'var(--font-source-code), monospace'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                      }}
                    >
                      launch on testnet
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

