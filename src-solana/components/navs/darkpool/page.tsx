"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/theme/Nav";
// import DAppNav from "@/components/swap_face/DAppNav";
import { WalletInfo, walletManager } from "@/lib/walletManager";
// import "@/components/swap_face/SwapInterface.css";
import DarkPoolInterface from "./darkpool/DarkPoolInterface";

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
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(
    null,
  );
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [isLaunched, setIsLaunched] = useState(false);

  const handleWalletConnected = (wallet: WalletInfo) => {
    console.log("Wallet connected:", wallet);
    setWalletConnected(true);
    setConnectedWallet(wallet);
    localStorage.setItem("siphon-connected-wallet", JSON.stringify(wallet));
  };

  const handleDisconnect = () => {
    if (connectedWallet) {
      walletManager.disconnectWallet(connectedWallet.id);
    }
    setWalletConnected(false);
    setConnectedWallet(null);
    localStorage.removeItem("siphon-connected-wallet");
  };

  useEffect(() => {
    // Check for actual wallet connection, not just localStorage
    const checkWalletConnection = async () => {
      try {
        // Check if wallet is actually connected in the browser
        if (typeof window !== "undefined") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const solana = (window as any).solana;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const solflare = (window as any).solflare;

          // Check Phantom or Solflare
          const provider = solflare?.isSolflare ? solflare : solana;

          if (provider && provider.isConnected && provider.publicKey) {
            // Wallet is actually connected
            const persistedWallet = localStorage.getItem(
              "siphon-connected-wallet",
            );
            if (persistedWallet) {
              try {
                const wallet = JSON.parse(persistedWallet);
                // Verify the address matches
                if (wallet.address === provider.publicKey.toString()) {
                  console.log("Restored wallet connection:", wallet);
                  setConnectedWallet(wallet);
                  setWalletConnected(true);
                } else {
                  // Address mismatch, clear storage
                  console.log("Wallet address mismatch, clearing storage");
                  localStorage.removeItem("siphon-connected-wallet");
                }
              } catch (error) {
                console.error("Failed to parse persisted wallet:", error);
                localStorage.removeItem("siphon-connected-wallet");
              }
            }
          } else {
            // No active wallet connection, clear any stale data
            console.log("No active wallet connection detected");
            localStorage.removeItem("siphon-connected-wallet");
            setConnectedWallet(null);
            setWalletConnected(false);
          }
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error);
        localStorage.removeItem("siphon-connected-wallet");
      } finally {
        setIsCheckingWallet(false);
      }
    };

    checkWalletConnection();
  }, []);

  // Show loading while checking wallet connection
  const walletAddress =
    walletConnected && connectedWallet ? connectedWallet.address : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#000",
        position: "relative",
      }}
    >
      <Nav onWalletConnected={handleWalletConnected} />

      {/* DApp Interface - on top of everything */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          className="dapp-container"
          style={{
            width: "98vw",
            height: "90vh",
            maxWidth: "none",
            pointerEvents: "auto",
            position: "relative",
          }}
        >
          {/* Marquee Disclaimer */}
          {!isLaunched && (
            <>
              <style>{marqueeKeyframes}</style>
              <style>{`
                @media (max-width: 768px) {
                  .dapp-marquee {
                    top: 13px !important;
                  }
                }
                @media (max-width: 480px) {
                  .dapp-marquee {
                    top: 13px !important;
                  }
                }
              `}</style>
              <div
                className="dapp-marquee"
                style={{
                  position: "absolute",
                  top: "60px",
                  left: 0,
                  right: 0,
                  zIndex: 3000,
                  background: "rgba(33, 150, 243, 0.15)",
                  borderBottom: "1px solid rgba(33, 150, 243, 0.3)",
                  padding: "0.5rem 0",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  opacity: 0,
                  animation: "fadeIn 0.6s ease-in 0.2s forwards",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: "200%",
                    animation: "marquee 20s linear infinite",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-source-code), monospace",
                      fontSize: "11px",
                      color: "rgba(33, 150, 243, 0.9)",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                      flex: "0 0 50%",
                    }}
                  >
                    🔵 AVAILABLE IN TESTNET - NEXT STAGE: MAINNET LAUNCH COMING
                    SOON 🔵
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-source-code), monospace",
                      fontSize: "11px",
                      color: "rgba(33, 150, 243, 0.9)",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                      flex: "0 0 50%",
                    }}
                  >
                    🔵 AVAILABLE IN TESTNET - NEXT STAGE: MAINNET LAUNCH COMING
                    SOON 🔵
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Blurred content */}
          <div
            style={{
              filter: isLaunched ? "none" : "blur(3px)",
              pointerEvents: isLaunched ? "auto" : "none",
              width: "100%",
              height: "100%",
              opacity: isLaunched ? 1 : 0,
              transition: isLaunched
                ? "opacity 0.4s ease-in, filter 0.4s ease-in"
                : "none",
              animation: isLaunched
                ? undefined
                : "fadeIn 0.8s ease-in 0.1s forwards",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isCheckingWallet ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255, 255, 255, 0.9)",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontFamily: "var(--font-source-code), monospace",
                  }}
                >
                  <div
                    style={{
                      border: "2px solid rgba(255, 255, 255, 0.1)",
                      borderTop: "2px solid rgba(255, 255, 255, 0.6)",
                      borderRadius: "50%",
                      width: "40px",
                      height: "40px",
                      animation: "spin 1s linear infinite",
                      margin: "0 auto 16px",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "14px",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      color: "rgba(255, 255, 255, 0.7)",
                    }}
                  >
                    Checking wallet connection...
                  </p>
                </div>
              </div>
            ) : (
              <>
                {isLaunched && (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      paddingTop: "40px",
                    }}
                  >
                    <DarkPoolInterface
                      walletAddress={walletAddress}
                      walletName={connectedWallet?.name}
                      onDisconnect={handleDisconnect}
                      onWalletConnected={handleWalletConnected}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Presentation Module Overlay */}
          {!isLaunched && (
            <div
              className="dapp-presentation-overlay"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2000,
                backgroundColor: "rgba(0, 0, 0, 0.65)",
                backdropFilter: "blur(4px)",
                paddingTop: "2rem",
                opacity: 0,
                animation: "fadeIn 0.8s ease-in 0.3s forwards",
              }}
            >
              <div
                className="dapp-presentation-box"
                style={{
                  background: "rgba(0, 0, 0, 0.95)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "16px",
                  width: "90%",
                  height: "80%",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  overflow: "hidden",
                  marginTop: "50px",
                  opacity: 0,
                  transform: "translateY(20px)",
                  animation: "fadeInUp 0.6s ease-out 0.5s forwards",
                }}
              >
                {/* Sidebar - Hidden on mobile */}
                <div
                  className="dapp-sidebar"
                  style={{
                    width: "240px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRight: "1px solid rgba(255, 255, 255, 0.1)",
                    padding: "2.5rem 2rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2rem",
                  }}
                >
                  {/* Title Section */}
                  <div
                    style={{
                      textAlign: "left",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "28px",
                        fontWeight: "700",
                        marginBottom: "1rem",
                        color: "rgba(255, 255, 255, 0.95)",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        fontFamily: "var(--font-source-code), monospace",
                        animation: "fadeIn 0.8s ease-in",
                      }}
                    >
                      Dark Pool
                    </h2>
                    <div
                      style={{
                        width: "80px",
                        height: "2px",
                        background: "rgba(255, 255, 255, 0.2)",
                        marginBottom: "1.5rem",
                      }}
                    />
                    <p
                      style={{
                        fontSize: "13px",
                        color: "rgba(255, 255, 255, 0.75)",
                        lineHeight: "1.8",
                        fontFamily: "var(--font-source-code), monospace",
                        letterSpacing: "0.3px",
                        maxWidth: "200px",
                      }}
                    >
                      Private order matching with encrypted balances and
                      MPC-based settlement
                    </p>
                  </div>

                  {/* Chains & Protocols Summary */}
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "2rem",
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "rgba(255, 255, 255, 0.95)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontFamily: "var(--font-source-code), monospace",
                        marginBottom: "1rem",
                      }}
                    >
                      Supported Networks
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                        marginBottom: "1.5rem",
                      }}
                    >
                      {["Solana", "Ethereum", "BASE"].map((chain) => {
                        const isHighlighted = chain === "Solana";
                        return (
                          <div
                            key={chain}
                            style={{
                              background: isHighlighted
                                ? "rgba(255, 255, 255, 0.05)"
                                : "rgba(255, 255, 255, 0.02)",
                              border: isHighlighted
                                ? "1px solid rgba(255, 255, 255, 0.1)"
                                : "1px solid rgba(255, 255, 255, 0.05)",
                              borderRadius: "4px",
                              padding: "0.25rem 0.5rem",
                              fontSize: "9px",
                              color: isHighlighted
                                ? "rgba(255, 255, 255, 0.9)"
                                : "rgba(255, 255, 255, 0.5)",
                              fontFamily: "var(--font-source-code), monospace",
                              fontWeight: "500",
                              opacity: isHighlighted ? 1 : 0.5,
                            }}
                          >
                            {chain}
                          </div>
                        );
                      })}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "rgba(255, 255, 255, 0.95)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontFamily: "var(--font-source-code), monospace",
                        marginBottom: "1rem",
                      }}
                    >
                      Features
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                      }}
                    >
                      {[
                        "MPC Encryption",
                        "Private Matching",
                        "On-Chain Settlement",
                      ].map((feature) => {
                        return (
                          <div
                            key={feature}
                            style={{
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.05)",
                              borderRadius: "4px",
                              padding: "0.25rem 0.5rem",
                              fontSize: "9px",
                              color: "rgba(255, 255, 255, 0.5)",
                              fontFamily: "var(--font-source-code), monospace",
                              fontWeight: "500",
                              opacity: 0.5,
                            }}
                          >
                            {feature}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div
                  className="dapp-main-content"
                  style={{
                    flex: 1,
                    padding: "2.5rem 3rem",
                    display: "flex",
                    flexDirection: "column",
                    overflowY: "auto",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      marginBottom: "2.5rem",
                    }}
                  >
                    <h1
                      style={{
                        fontSize: "36px",
                        fontWeight: "700",
                        marginBottom: "1rem",
                        color: "rgba(255, 255, 255, 0.95)",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        fontFamily: "var(--font-source-code), monospace",
                      }}
                    >
                      Private Order Matching
                    </h1>
                    <p
                      style={{
                        fontSize: "15px",
                        color: "rgba(255, 255, 255, 0.75)",
                        lineHeight: "1.8",
                        fontFamily: "var(--font-source-code), monospace",
                        letterSpacing: "0.3px",
                        maxWidth: "700px",
                      }}
                    >
                      Trade with complete privacy through encrypted balances and
                      private order matching. Your orders are matched using
                      Multi-Party Computation (MPC) without revealing your
                      trading intentions or balances.
                    </p>
                  </div>

                  {/* Feature Cards */}
                  <div
                    className="dapp-feature-cards"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: "1rem",
                      marginBottom: "2rem",
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "10px",
                        padding: "1.25rem",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          marginBottom: "0.75rem",
                          filter: "brightness(0) invert(1)",
                        }}
                      >
                        🔒
                      </div>
                      <h4
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "rgba(255, 255, 255, 0.95)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "0.5rem",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Encrypted Balances
                      </h4>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "rgba(255, 255, 255, 0.7)",
                          lineHeight: "1.5",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Your balances are encrypted on-chain using MPC, ensuring
                        complete privacy even from the protocol itself.
                      </p>
                    </div>
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "10px",
                        padding: "1.25rem",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          marginBottom: "0.75rem",
                          filter: "brightness(0) invert(1)",
                        }}
                      >
                        🎯
                      </div>
                      <h4
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "rgba(255, 255, 255, 0.95)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "0.5rem",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Private Matching
                      </h4>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "rgba(255, 255, 255, 0.7)",
                          lineHeight: "1.5",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Orders are matched privately using MPC without revealing
                        your trading intentions or order details.
                      </p>
                    </div>
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "10px",
                        padding: "1.25rem",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          marginBottom: "0.75rem",
                          filter: "brightness(0) invert(1)",
                        }}
                      >
                        ⚡
                      </div>
                      <h4
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "rgba(255, 255, 255, 0.95)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "0.5rem",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Fast Settlement
                      </h4>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "rgba(255, 255, 255, 0.7)",
                          lineHeight: "1.5",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Orders settle within seconds using Solana&apos;s
                        high-speed blockchain for instant execution.
                      </p>
                    </div>
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "10px",
                        padding: "1.25rem",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          marginBottom: "0.75rem",
                          filter: "brightness(0) invert(1)",
                        }}
                      >
                        🛡️
                      </div>
                      <h4
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "rgba(255, 255, 255, 0.95)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "0.5rem",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        Zero Leakage
                      </h4>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "rgba(255, 255, 255, 0.7)",
                          lineHeight: "1.5",
                          fontFamily: "var(--font-source-code), monospace",
                        }}
                      >
                        No front-running, no MEV, no information leakage. Your
                        trades remain completely private.
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div
                    className="darkpool-action-buttons"
                    style={{
                      display: "flex",
                      gap: "1rem",
                      marginTop: "auto",
                      paddingTop: "2rem",
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <button
                      onClick={() => {
                        setIsLaunched(true);
                      }}
                      style={{
                        background: "rgba(255, 255, 255, 0.1)",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: "8px",
                        padding: "0.875rem 2.5rem",
                        color: "white",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontFamily: "var(--font-source-code), monospace",
                        width: "auto",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255, 255, 255, 0.15)";
                        e.currentTarget.style.borderColor =
                          "rgba(255, 255, 255, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255, 255, 255, 0.1)";
                        e.currentTarget.style.borderColor =
                          "rgba(255, 255, 255, 0.2)";
                      }}
                    >
                      Launch
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
