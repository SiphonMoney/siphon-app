// DarkPoolInterface.tsx - Main interface for dark pool trading
"use client";

import { useState, useCallback } from 'react';
import { useUserLedger } from './useUserLedger';
import InitializeLedger from './InitializeLedger';
import BalanceDisplay from './BalanceDisplay';
import DepositModal from './DepositModal';
import WithdrawModal from './WithdrawModal';
import OrderForm from './OrderForm';
import OrderList from './OrderList';
import PriceChart from './PriceChart';
import ManageLiquidity from './ManageLiquidity';
import { WalletInfo } from '@/components/extensions/walletManager';
import './darkpool.css';

interface DarkPoolInterfaceProps {
  walletAddress: string | null;
  walletName?: string;
  onDisconnect?: () => void;
  onWalletConnected?: (wallet: WalletInfo) => void;
}

type View = 'overview' | 'trade' | 'history';
type ModalType = 'deposit' | 'withdraw' | null;

export default function DarkPoolInterface({ 
  walletAddress,
  walletName = 'Wallet',
  onDisconnect,
  onWalletConnected
}: DarkPoolInterfaceProps) {
  // All hooks must be called at the top, before any conditional returns
  const { exists: ledgerExists, loading: checkingLedger, checkLedgerExists } = useUserLedger(walletAddress);
  const [view, setView] = useState<View>('overview');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [balanceKey, setBalanceKey] = useState(0);
  const [selectedPair, setSelectedPair] = useState("SOL/USDC");
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');
  const [orderView, setOrderView] = useState<'place' | 'liquidity'>('place');
  
  // DEMO MODE: Bypass initialization for testing/demo
  // Set to true to skip ledger check and go straight to main interface
  // TODO: Remove this before production launch
  const DEMO_MODE = true;
  
  console.log('DEMO MODE:', DEMO_MODE ? 'ENABLED' : 'DISABLED');

  // Mock signMessage function - replace with actual wallet adapter
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    // TODO: Implement actual message signing with wallet adapter
    console.log('Signing message:', message);
    return new Uint8Array(64).fill(0); // Mock signature
  }, []);

  const handleLedgerInitialized = () => {
    checkLedgerExists();
  };

  const handleDepositSuccess = () => {
    setActiveModal(null);
    setBalanceKey(prev => prev + 1); // Force balance refresh
  };

  const handleWithdrawSuccess = () => {
    setActiveModal(null);
    setBalanceKey(prev => prev + 1); // Force balance refresh
  };

  const handleOrderSuccess = (orderId: string) => {
    console.log('Order placed successfully:', orderId);
    setBalanceKey(prev => prev + 1); // Force balance refresh
  };

  // Not connected state - MUST connect wallet first
  if (!walletAddress) {
    return (
      <div className="darkpool-interface">
        <div className="welcome-screen">
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            padding: '2rem',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: 'var(--font-source-code), monospace'
          }}>
            <h2 style={{
              fontSize: '24px',
              marginBottom: '1rem',
              fontWeight: '600'
            }}>
              Wallet Not Connected
            </h2>
            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.7)',
              lineHeight: '1.6',
              maxWidth: '400px'
            }}>
              Please connect your wallet using the button in the top right corner to access the Dark Pool.
            </p>
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
          onComplete={handleLedgerInitialized}
        />
      </div>
    );
  }

  // Mock 24h stats data
  const stats24h = {
    high: 192.50,
    low: 188.20,
    volume: 2847500.0,
    change: 0.0023,
    changePercent: 1.85
  };

  return (
    <div className="darkpool-container loaded">
      {/* Header */}
      <div className="darkpool-header">
        <div className="darkpool-header-left">
          <div className="trading-pair-selector">
            <button 
              className={`pair-button ${selectedPair === 'SOL/USDC' ? 'active' : ''}`}
              onClick={() => setSelectedPair('SOL/USDC')}
            >
              SOL/USDC
            </button>
            <button 
              className={`pair-button example-pool ${selectedPair === 'XMR/SOL' ? 'active' : ''}`}
              onClick={() => setSelectedPair('XMR/SOL')}
              disabled
            >
              XMR/SOL
              <span className="example-label">(Soon)</span>
            </button>
            <button 
              className={`pair-button example-pool ${selectedPair === 'ZEC/SOL' ? 'active' : ''}`}
              onClick={() => setSelectedPair('ZEC/SOL')}
              disabled
            >
              ZEC/SOL
              <span className="example-label">(Soon)</span>
            </button>
          </div>
        </div>
        <div className="darkpool-header-right">
          {/* Connect button is in nav, but keeping structure for consistency */}
        </div>
      </div>

      {/* Top Row: Chart (2/3) + Order Form (1/3) */}
      <div className="darkpool-top-row">
        {/* Chart Section - 2/3 width */}
        <div className="chart-section">
          <div className="chart-header">
            <span className="chart-title">Price Chart</span>
            <div className="timeframe-selector">
              <button 
                className={`timeframe-btn ${timeframe === '1m' ? 'active' : ''}`}
                onClick={() => setTimeframe('1m')}
              >
                1m
              </button>
              <button 
                className={`timeframe-btn ${timeframe === '5m' ? 'active' : ''}`}
                onClick={() => setTimeframe('5m')}
              >
                5m
              </button>
              <button 
                className={`timeframe-btn ${timeframe === '15m' ? 'active' : ''}`}
                onClick={() => setTimeframe('15m')}
              >
                15m
              </button>
              <button 
                className={`timeframe-btn ${timeframe === '1h' ? 'active' : ''}`}
                onClick={() => setTimeframe('1h')}
              >
                1h
              </button>
              <button 
                className={`timeframe-btn ${timeframe === '4h' ? 'active' : ''}`}
                onClick={() => setTimeframe('4h')}
              >
                4h
              </button>
              <button 
                className={`timeframe-btn ${timeframe === '1d' ? 'active' : ''}`}
                onClick={() => setTimeframe('1d')}
              >
                1d
              </button>
            </div>
          </div>
          
          {/* 24h Stats */}
          <div className="stats-24h">
            <div className="stat-item">
              <span className="stat-label">24h High</span>
              <span className="stat-value">{stats24h.high.toFixed(2)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">24h Low</span>
              <span className="stat-value">{stats24h.low.toFixed(2)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">24h Volume</span>
              <span className="stat-value">{(stats24h.volume / 1000000).toFixed(2)}M</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">24h Change</span>
              <span className={`stat-value ${stats24h.change >= 0 ? 'positive' : 'negative'}`}>
                {stats24h.change >= 0 ? '+' : ''}{stats24h.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="chart-container">
            <PriceChart pair={selectedPair} timeframe={timeframe} />
          </div>
        </div>

        {/* Order Form Section - 1/3 width */}
        <div className="order-form-section">
          <div className="order-form-header">
            <div className="view-toggle">
              <button
                type="button"
                className={`view-toggle-text ${orderView === 'place' ? 'active' : ''}`}
                onClick={() => {
                  setOrderView('place');
                }}
              >
                Place Order
              </button>
              <button
                type="button"
                className={`view-toggle-text ${orderView === 'liquidity' ? 'active' : ''}`}
                onClick={() => {
                  setOrderView('liquidity');
                }}
              >
                Manage Liquidity
              </button>
            </div>
          </div>
          
          <div className="order-form-content">
            {orderView === 'place' ? (
              <OrderForm
                walletAddress={walletAddress}
                signMessage={signMessage}
                onSuccess={handleOrderSuccess}
              />
            ) : (
              <ManageLiquidity
                walletAddress={walletAddress}
                signMessage={signMessage}
                onDeposit={() => setActiveModal('deposit')}
                onWithdraw={() => setActiveModal('withdraw')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Order History Section */}
      <div className="order-history-section">
        <OrderList walletAddress={walletAddress} />
      </div>

      {/* Modals */}
      {activeModal === 'deposit' && (
        <DepositModal
          walletAddress={walletAddress}
          onClose={() => setActiveModal(null)}
          onSuccess={handleDepositSuccess}
        />
      )}

      {activeModal === 'withdraw' && (
        <WithdrawModal
          walletAddress={walletAddress}
          onClose={() => setActiveModal(null)}
          onSuccess={handleWithdrawSuccess}
        />
      )}
    </div>
  );
}

