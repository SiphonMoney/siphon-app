// DarkPoolInterface.tsx - Main interface for dark pool trading
"use client";

import { useState, useCallback, useEffect } from "react";
import { useUserLedger } from "@/lib/siphon/hooks";
import InitializeLedger from "./InitializeLedger";
import BalanceDisplay from "./BalanceDisplay";
import DepositModal from "./DepositModal";
import WithdrawModal from "./WithdrawModal";
import OrderForm from "./OrderForm";
import OrderList from "./OrderList";
import TxList, { getTxList, appendTx, type TxEntry } from "./TxList";
import { WalletInfo } from "@/lib/walletManager";
import { getBrowserWalletAdapter } from "@/lib/solanaWallet";
import "./darkpool.css";
// import ConnectButton from "@/components/extensions/ConnectButton";

interface DarkPoolInterfaceProps {
  walletAddress: string | null;
  walletName?: string;
  onDisconnect?: () => void;
  onWalletConnected?: (wallet: WalletInfo) => void;
}

type View = "overview" | "trade" | "history";
type ModalType = "deposit" | "withdraw" | null;

export default function DarkPoolInterface({
  walletAddress,
  walletName = "Wallet",
  onDisconnect,
  onWalletConnected,
}: DarkPoolInterfaceProps) {
  const {
    exists: ledgerExists,
    loading: checkingLedger,
    checkLedgerExists,
  } = useUserLedger(walletAddress);
  const [view, setView] = useState<View>("overview");
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [balanceKey, setBalanceKey] = useState(0);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [txList, setTxList] = useState<TxEntry[]>([]);

  useEffect(() => {
    setTxList(getTxList());
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  const notify = useCallback((message: string, type: "success" | "error") => {
    setNotification({ message, type });
  }, []);

  const handleTxRecorded = useCallback((entry: TxEntry) => {
    appendTx(entry);
    setTxList(getTxList());
  }, []);

  // 🎭 DEMO MODE: Bypass initialization for testing/demo
  // Set to true to skip ledger check and go straight to main interface
  // TODO: Remove this before production launch
  const DEMO_MODE = false;

  console.log("🎭 DEMO MODE:", DEMO_MODE ? "ENABLED" : "DISABLED");

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      const adapter = getBrowserWalletAdapter();
      if (!adapter.signMessage) {
        throw new Error("Wallet does not support message signing");
      }
      return adapter.signMessage(message);
    },
    [],
  );

  const handleLedgerInitialized = () => {
    checkLedgerExists();
  };

  const handleDepositSuccess = (_txHash?: string) => {
    setActiveModal(null);
    setBalanceKey((prev) => prev + 1);
  };

  const handleWithdrawSuccess = (_txHash?: string) => {
    setActiveModal(null);
    setBalanceKey((prev) => prev + 1);
  };

  const handleOrderSuccess = (orderId: string) => {
    console.log("Order placed successfully:", orderId);
    setBalanceKey((prev) => prev + 1); // Force balance refresh
  };

  // Not connected state - MUST connect wallet first
  if (!walletAddress) {
    return (
      <div className="darkpool-interface">
        <div className="welcome-screen">
          <div className="connect-button-wrapper">
            {/* <ConnectButton
              className="welcome-connect-button"
              onConnected={onWalletConnected}
            /> */}
            <p className="text-white">Please connect your wallet to continue.</p>
          </div>
        </div>
      </div>
    );
  }

  // Checking ledger state (skip in demo mode)
  if (checkingLedger && !DEMO_MODE) {
    return (
      <div className="darkpool-interface">
        <div className="loading-screen">
          <div className="spinner-large"></div>
          <p>Checking account status...</p>
        </div>
      </div>
    );
  }

  // Need to initialize ledger (skip in demo mode)
  if (!ledgerExists && !DEMO_MODE) {
    return (
      <div className="darkpool-interface">
        <InitializeLedger
          walletAddress={walletAddress}
          signMessage={signMessage}
          onComplete={handleLedgerInitialized}
        />
      </div>
    );
  }

  // Main interface
  return (
    <div className="darkpool-interface">
      {/* Toast notification - styled, no alert */}
      {notification && (
        <div className={`darkpool-toast darkpool-toast-${notification.type}`} role="alert">
          {notification.type === "success" ? (
            <svg className="darkpool-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg className="darkpool-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          <span className="darkpool-toast-message">{notification.message}</span>
        </div>
      )}

      {/* Demo Mode Banner */}
      {DEMO_MODE && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background: "rgba(255, 165, 0, 0.15)",
            borderBottom: "1px solid rgba(255, 165, 0, 0.4)",
            padding: "0.5rem",
            textAlign: "center",
            zIndex: 9999,
            fontFamily: "var(--font-source-code), monospace",
            fontSize: "11px",
            color: "rgba(255, 165, 0, 0.95)",
            fontWeight: "600",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          🎭 Demo Mode Active - Bypassing Ledger Initialization
        </div>
      )}

      {/* Header */}
      <div
        className="darkpool-main-header"
        style={{ marginTop: DEMO_MODE ? "35px" : "40px" }}
      >
        <div className="header-left">
          <h2>DarkPools</h2>
        </div>
        <div className="header-right">
          <div className="wallet-badge">
            <span className="wallet-name">{walletName}</span>
            <span className="wallet-address">
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </span>
          </div>
          {onDisconnect && (
            <button onClick={onDisconnect} className="disconnect-btn">
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="view-tabs">
        <button
          className={`tab ${view === "overview" ? "active" : ""}`}
          onClick={() => setView("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${view === "trade" ? "active" : ""}`}
          onClick={() => setView("trade")}
        >
          Trade
        </button>
        <button
          className={`tab ${view === "history" ? "active" : ""}`}
          onClick={() => setView("history")}
        >
          Order History
        </button>
      </div>

      {/* Content Area */}
      <div className="content-area">
        {view === "overview" && (
          <div className="overview-view">
            <div className="balance-section">
              <BalanceDisplay
                key={balanceKey}
                walletAddress={walletAddress}
                signMessage={signMessage}
              />
            </div>

            <div className="actions-section">
              <h3>Manage Funds</h3>
              <div className="action-buttons">
                <button
                  onClick={() => setActiveModal("deposit")}
                  className="action-card deposit"
                >
                  <div className="action-content">
                    <h4>Deposit</h4>
                    <p>Add tokens to your encrypted balance</p>
                  </div>
                </button>
                <button
                  onClick={() => setActiveModal("withdraw")}
                  className="action-card withdraw"
                >
                  <div className="action-content">
                    <h4>Withdraw</h4>
                    <p>Remove tokens from the pool</p>
                  </div>
                </button>
              </div>
            </div>

            <TxList entries={txList} />

            <div className="info-section">
              <div className="info-card">
                <div>
                  <h4>Privacy First</h4>
                  <p>Your balances are encrypted on-chain using MPC</p>
                </div>
              </div>
              <div className="info-card">
                <div>
                  <h4>Fast Settlement</h4>
                  <p>Orders settle within seconds using Solana</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "trade" && (
          <div className="trade-view">
            <div className="trade-container">
              <div className="order-form-container">
                <OrderForm
                  walletAddress={walletAddress}
                  signMessage={signMessage}
                  onSuccess={handleOrderSuccess}
                />
              </div>
              <div className="market-info">
                <div className="market-card">
                  <h4>SOL/USDC Market</h4>
                  <div className="market-stats">
                    <div className="stat">
                      <span className="label">Current Price</span>
                      <span className="value">$192.00</span>
                    </div>
                    <div className="stat">
                      <span className="label">24h Change</span>
                      <span className="value positive">+2.3%</span>
                    </div>
                    <div className="stat">
                      <span className="label">24h Volume</span>
                      <span className="value">$1.2M</span>
                    </div>
                  </div>
                </div>
                <div className="info-box">
                  <div>
                    <strong>How it works:</strong>
                    <ol>
                      <li>Your order is encrypted and submitted</li>
                      <li>MPC matches orders privately</li>
                      <li>Settlement happens on-chain</li>
                      <li>Your balance updates automatically</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "history" && (
          <div className="history-view">
            <OrderList walletAddress={walletAddress} />
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal === "deposit" && (
        <DepositModal
          walletAddress={walletAddress}
          signMessage={signMessage}
          onClose={() => setActiveModal(null)}
          onSuccess={handleDepositSuccess}
          onNotify={notify}
          onTxRecorded={handleTxRecorded}
        />
      )}

      {activeModal === "withdraw" && (
        <WithdrawModal
          walletAddress={walletAddress}
          signMessage={signMessage}
          onClose={() => setActiveModal(null)}
          onSuccess={handleWithdrawSuccess}
          onNotify={notify}
          onTxRecorded={handleTxRecorded}
        />
      )}
    </div>
  );
}
