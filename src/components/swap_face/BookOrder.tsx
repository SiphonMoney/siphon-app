"use client";

import { useState, useRef, useEffect } from "react";
import "./ProSwapMode.css";
import PriceChart from "./extensions/PriceChart";
import TransactionList from "./extensions/TransactionList";
import ConnectButton from "./extensions/ConnectButton";
import { matchingEngineClient, OrderParams } from "../../lib/matchingEngine";
import { WalletInfo } from "../../lib/walletManager";

interface DarkPoolProps {
  isLoaded: boolean;
  walletConnected: boolean;
  connectedWallet: WalletInfo | null;
  onWalletConnected: (wallet: WalletInfo) => void;
}

interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

export default function BookOrder({
  isLoaded,
  walletConnected,
  connectedWallet,
  onWalletConnected
}: DarkPoolProps) {
  const [selectedPair, setSelectedPair] = useState("SOL/USDC");
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("192");
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');
  const [rightPanelView, setRightPanelView] = useState<'order' | 'liquidity'>('order');
  const [isLoadingModalOpen, setIsLoadingModalOpen] = useState(false);
  const BASE_SOL_USD = 192;
  const [loadingLogs, setLoadingLogs] = useState<string[]>([]);
  const [activeLogIndex, setActiveLogIndex] = useState(0);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const loadingTimers = useRef<number[]>([] as number[]);
  const pushLocalTransaction = (entry: { id: string; type: 'buy' | 'sell'; amount: number; price: number; total: number; status: 'pending' | 'completed' | 'failed'; pair: string; timestamp?: string; }) => {
    try {
      const key = 'siphon-mock-transactions';
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const timestamp = new Date().toISOString();
      const tx = { ...entry, timestamp };
      const next = [tx, ...arr];
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event('siphon-tx-updated'));
    } catch {}
  };

  const updateLocalTransactionStatus = (id: string, status: 'completed' | 'failed') => {
    try {
      const key = 'siphon-mock-transactions';
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const next = arr.map((t: any) => t.id === id ? { ...t, status } : t);
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event('siphon-tx-updated'));
    } catch {}
  };

  const openLoadingModal = (logs: string[]) => {
    // Clear any previous timers
    loadingTimers.current.forEach((t: number) => window.clearTimeout(t));
    loadingTimers.current = [];
    setLoadingLogs(logs);
    setActiveLogIndex(0);
    setIsLoadingModalOpen(true);
    logs.forEach((_, idx) => {
      if (idx === 0) return;
      const timer = window.setTimeout(() => setActiveLogIndex(idx), idx * 800);
      loadingTimers.current.push(timer);
    });
  };

  const closeLoadingModal = () => {
    loadingTimers.current.forEach((t: number) => window.clearTimeout(t));
    loadingTimers.current = [];
    setIsLoadingModalOpen(false);
    setLoadingLogs([]);
    setActiveLogIndex(0);
  };
  
  // Liquidity management state
  const [liquidityAction, setLiquidityAction] = useState<'add' | 'remove'>('add');
  const [solAmount, setSolAmount] = useState("");
  const [usdcAmount, setUsdcAmount] = useState("");
  
  // Mock user liquidity stats
  const userLiquidityStats = {
    totalLiquidity: 1250.5,
    solDeposited: 850.0,
    usdcDeposited: 110000.5,
    earnedFees: 12.34,
    share: 0.045 // 4.5% of total pool
  };

  // Mock order book data - updated for privacy coins
  const [orderBook, setOrderBook] = useState({
    bids: [
      { price: 0.126, amount: 1250.0, total: 157.5 },
      { price: 0.1258, amount: 2100.0, total: 264.18 },
      { price: 0.1256, amount: 850.0, total: 106.76 },
      { price: 0.1254, amount: 3200.0, total: 401.28 },
      { price: 0.1252, amount: 1500.0, total: 187.8 },
      { price: 0.125, amount: 2800.0, total: 350.0 },
      { price: 0.1248, amount: 1150.0, total: 143.52 },
      { price: 0.1246, amount: 4500.0, total: 560.7 },
    ] as OrderBookEntry[],
    asks: [
      { price: 0.1262, amount: 1800.0, total: 227.16 },
      { price: 0.1264, amount: 2300.0, total: 290.72 },
      { price: 0.1266, amount: 950.0, total: 120.27 },
      { price: 0.1268, amount: 1400.0, total: 177.52 },
      { price: 0.127, amount: 2600.0, total: 330.2 },
      { price: 0.1272, amount: 1750.0, total: 222.6 },
      { price: 0.1274, amount: 3200.0, total: 407.68 },
      { price: 0.1276, amount: 900.0, total: 114.84 },
    ] as OrderBookEntry[]
  });

  // Derived stats for darkpools (driven by TransactionList visible items)
  const [totalVolume, setTotalVolume] = useState<number>(0);

  const computeLocalVolume = (pair: string) => {
    try {
      const raw = localStorage.getItem('siphon-mock-transactions');
      const arr = raw ? JSON.parse(raw) : [];
      const sum = arr
        .filter((t: any) => t && t.pair === pair)
        .reduce((acc: number, t: any) => acc + (Number(t.total) || 0), 0);
      return sum;
    } catch {
      return 0;
    }
  };

  const formatCompactUsd = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  // Listen for visible volume updates from TransactionList
  useEffect(() => {
    const onListVolume = (e: any) => {
      if (e?.detail?.pair === selectedPair) {
        setTotalVolume(Number(e.detail.volume || 0));
      }
    };
    const onTxUpdate = () => setTotalVolume(computeLocalVolume(selectedPair));
    window.addEventListener('siphon-tx-volume', onListVolume as EventListener);
    window.addEventListener('siphon-tx-updated', onTxUpdate);
    // initial
    setTotalVolume(computeLocalVolume(selectedPair));
    return () => {
      window.removeEventListener('siphon-tx-volume', onListVolume as EventListener);
      window.removeEventListener('siphon-tx-updated', onTxUpdate);
    };
  }, [selectedPair]);

  // Mock recent activities data
  const recentActivities = [
    { time: "14:32:15", type: "buy", amount: 1250.0, price: 0.1268, total: 158.5 },
    { time: "14:31:42", type: "sell", amount: 850.0, price: 0.1265, total: 107.525 },
    { time: "14:30:18", type: "buy", amount: 2100.0, price: 0.1262, total: 265.02 },
    { time: "14:29:55", type: "sell", amount: 950.0, price: 0.1260, total: 119.7 },
    { time: "14:28:33", type: "buy", amount: 1800.0, price: 0.1258, total: 226.44 },
    { time: "14:27:21", type: "sell", amount: 1400.0, price: 0.1256, total: 175.84 },
    { time: "14:26:07", type: "buy", amount: 3200.0, price: 0.1254, total: 401.28 },
    { time: "14:25:44", type: "sell", amount: 1150.0, price: 0.1252, total: 143.98 }
  ];

  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    if (!orderAmount || !orderPrice) {
      alert('Please enter both amount and price');
      return;
    }

    if (!walletConnected || !connectedWallet) {
      alert('Please connect your wallet first');
      return;
    }

    if (selectedPair !== 'SOL/USDC') {
      alert('Only SOL/USDC trading is currently supported');
      return;
    }

    try {
      setIsPlacingOrder(true);
      // Prepare order parameters
      const orderParams: OrderParams = {
        amount: parseFloat(orderAmount),
        price: parseFloat(orderPrice),
        orderType,
        orderId: Date.now() // Simple order ID generation
      };

      // Mock: insert a pending local transaction and show loading modal
      const txId = `local_${orderParams.orderId}`;
      pushLocalTransaction({
        id: txId,
        type: orderType,
        amount: orderParams.amount,
        price: orderParams.price,
        total: orderParams.amount * orderParams.price,
        status: 'pending',
        pair: selectedPair
      });

      openLoadingModal([
        'Opening Phantom Wallet...',
        'Waiting for user approval...',
        'Creating transaction...',
        'Submitting to dark pool...',
        'Awaiting confirmations (1/2)...',
        'Awaiting confirmations (2/2)...',
        'Finalizing...'
      ]);

      // Simulate network delay and then mark completed
      window.setTimeout(() => {
        updateLocalTransactionStatus(txId, 'completed');
        closeLoadingModal();
      }, 3800);

      // Update local order book for immediate feedback
      const newOrder = {
        price: parseFloat(orderPrice),
        amount: parseFloat(orderAmount),
        total: parseFloat(orderPrice) * parseFloat(orderAmount)
      };

      if (orderType === 'buy') {
        setOrderBook(prev => ({
          ...prev,
          bids: [...prev.bids, newOrder].sort((a, b) => b.price - a.price)
        }));
      } else {
        setOrderBook(prev => ({
          ...prev,
          asks: [...prev.asks, newOrder].sort((a, b) => a.price - b.price)
        }));
      }

      setOrderAmount("");
      setOrderPrice("");
    } catch (error) {
      console.error('Failed to place order:', error);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className={`darkpool-container ${isLoaded ? 'loaded' : ''}`}>
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
          <ConnectButton 
            className="darkpool-connect-button"
            onConnected={onWalletConnected}
          />
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
          
          {/* Stats row removed; volume moved next to price in header */}
          <div className="chart-container">
            <PriceChart 
              pair={selectedPair} 
              timeframe={timeframe}
              leftLabel="Total Volume"
              leftValue={formatCompactUsd(totalVolume)}
              forceMock={true}
              mockBasePrice={192}
            />
          </div>
        </div>

        {/* Order Form + Liquidity Section - 1/3 width */}
        <div className="order-form-section">
          <div className="order-form-header">
            <div className="view-toggle">
              <span 
                className={`view-toggle-text ${rightPanelView === 'order' ? 'active' : ''}`}
                onClick={() => setRightPanelView('order')}
              >
                Place Order
              </span>
              <span 
                className={`view-toggle-text ${rightPanelView === 'liquidity' ? 'active' : ''}`}
                onClick={() => setRightPanelView('liquidity')}
              >
                Manage Liquidity
              </span>
            </div>
          </div>
          
          {rightPanelView === 'order' ? (
          <div className="order-form-content">
            <div className="order-type-selector">
              <button 
                className={`order-type-button ${orderType === 'buy' ? 'active' : ''}`}
                onClick={() => setOrderType('buy')}
              >
                Buy
              </button>
              <button 
                className={`order-type-button ${orderType === 'sell' ? 'active' : ''}`}
                onClick={() => setOrderType('sell')}
              >
                Sell
              </button>
            </div>
            
            <div className="form-group">
              <label>Amount ({selectedPair.split('/')[0]})</label>
              <input
                type="number"
                placeholder="0.0"
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label>Price (USDC)</label>
              <input
                type="number"
                placeholder="0.0"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label>Total (USDC)</label>
              <input
                type="number"
                placeholder="0.0"
                value={orderAmount && orderPrice ? (parseFloat(orderAmount) * parseFloat(orderPrice)).toFixed(2) : ""}
                readOnly
              />
            </div>

            <button 
              className="place-order-button" 
              onClick={handlePlaceOrder}
              disabled={!orderAmount || !orderPrice || isPlacingOrder}
            >
              {isPlacingOrder ? (
                <span className="loading-content"><span className="spinner"></span>Placing...</span>
              ) : (
                <>Place {orderType === 'buy' ? 'Buy' : 'Sell'} Order</>
              )}
            </button>
          </div>
          ) : (
          <div className="manage-liquidity-section">
            <div className="action-selector-inline">
              <button 
                className={`action-btn ${liquidityAction === 'add' ? 'active' : ''}`}
                onClick={() => setLiquidityAction('add')}
              >
                Add
              </button>
              <button 
                className={`action-btn ${liquidityAction === 'remove' ? 'active' : ''}`}
                onClick={() => setLiquidityAction('remove')}
              >
                Remove
              </button>
            </div>
            
            <div className="liquidity-content">
            {liquidityAction === 'add' ? (
              <div className="add-liquidity">
                <div className="form-group">
                  <label>SOL Amount</label>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                  />
                  <div className="inline-rate-hint">
                    {solAmount ? (
                      <span>
                        ≈ ${ (parseFloat(solAmount || '0') * BASE_SOL_USD).toFixed(2) } @ ${BASE_SOL_USD} <span className="pct muted">(-0.03%)</span>
                      </span>
                    ) : (
                      <span>Rate: ${BASE_SOL_USD} per SOL <span className="pct muted">(-0.03%)</span></span>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>USDC Amount</label>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={usdcAmount}
                    onChange={(e) => setUsdcAmount(e.target.value)}
                  />
                </div>
                <button 
                  className="liquidity-button"
                  disabled={!solAmount || !usdcAmount}
                  onClick={() => {
                    openLoadingModal([
                      'Preparing liquidity add...',
                      'Opening Phantom Wallet...',
                      'Waiting for user approval...',
                      'Creating transaction...',
                      'Submitting to pool...',
                      'Awaiting confirmations...',
                      'Finalizing...'
                    ]);
                    window.setTimeout(() => {
                      closeLoadingModal();
                    }, 3200);
                  }}
                >
                  Add Liquidity
                </button>
              </div>
            ) : (
              <div className="remove-liquidity">
                <div className="form-group">
                  <label>Remove Percentage</label>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    max="100"
                  />
                </div>
                <div className="removal-info">
                  <div className="info-row">
                    <span>SOL to receive:</span>
                    <span>0.0</span>
                  </div>
                  <div className="info-row">
                    <span>USDC to receive:</span>
                    <span>0.0</span>
                  </div>
                </div>
                <button 
                  className="liquidity-button"
                  disabled={true}
                >
                  Remove Liquidity
                </button>
              </div>
            )}
          </div>
          </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Order Book + Recent Transactions */}
      <div className="darkpool-bottom-row">
        <div className="orderbook-section">
          <div className="orderbook-header">
            <span className="orderbook-title">Order Book</span>
            <span className="pair-label">{selectedPair}</span>
          </div>
          <div className="orderbook-tables">
            <div className="asks-table">
              <div className="table-header">
                <span>Price</span>
                <span>Amount</span>
                <span>Total</span>
              </div>
              <div className="table-body">
                {[...orderBook.asks]
                  .sort((a, b) => a.price - b.price)
                  .slice(0, 3)
                  .map((ask, idx) => (
                    <div key={`ask-${idx}`} className="table-row ask">
                      <span className="cell price">{ask.price.toFixed(4)}</span>
                      <span className="cell amount">{ask.amount.toFixed(2)}</span>
                      <span className="cell total">{ask.total.toFixed(2)}</span>
                    </div>
                ))}
              </div>
            </div>

            <div className="bids-table">
              <div className="table-header">
                <span>Price</span>
                <span>Amount</span>
                <span>Total</span>
              </div>
              <div className="table-body">
                {[...orderBook.bids]
                  .sort((a, b) => b.price - a.price)
                  .slice(0, 3)
                  .map((bid, idx) => (
                    <div key={`bid-${idx}`} className="table-row bid">
                      <span className="cell price">{bid.price.toFixed(4)}</span>
                      <span className="cell amount">{bid.amount.toFixed(2)}</span>
                      <span className="cell total">{bid.total.toFixed(2)}</span>
                    </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="transactions-section">
          <TransactionList poolPair={selectedPair} maxItems={3} />
        </div>
      </div>

      {isLoadingModalOpen && (
        <div className="loading-modal-backdrop" onClick={closeLoadingModal}>
          <div className="loading-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Processing</h4>
            <div className="loading-logs">
              {loadingLogs.map((log, idx) => (
                <div key={idx} className={`loading-log ${idx <= activeLogIndex ? 'active' : ''}`}>
                  <span className="bullet">{idx < activeLogIndex ? '✔' : idx === activeLogIndex ? '•' : '○'}</span>
                  <span className="text">{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
  
    </div>
  );
}