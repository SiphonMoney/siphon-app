"use client";

import { useState } from "react";
import PriceChart from "./extensions/PriceChart";
import TransactionList from "./extensions/TransactionList";

interface BookOrderProps {
  isLoaded: boolean;
}

export default function BookOrder({ isLoaded }: BookOrderProps) {
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [showPoolDetails, setShowPoolDetails] = useState(false);

  const handlePoolSelect = (poolPair: string) => {
    setSelectedPool(poolPair);
    setShowPoolDetails(true);
  };

  const handleBackToPools = () => {
    setShowPoolDetails(false);
    setSelectedPool(null);
  };

  return (
    <div className={`book-order-mode ${isLoaded ? 'loaded' : ''}`}>
      {!showPoolDetails ? (
        // Pool Selection View
        <>
          <div className="book-header">
            <h3>Select Trading Pool</h3>
            <p>Choose a liquidity pool to view detailed trading information</p>
          </div>

          <div className="pool-selection-grid">
            <div 
              className={`pool-card ${selectedPool === 'SOL/USDC' ? 'active' : ''}`}
              onClick={() => handlePoolSelect('SOL/USDC')}
            >
              <div className="pool-pair">SOL/USDC</div>
              <div className="pool-liquidity">$2.4M Liquidity</div>
              <div className="pool-apy">12.5% APY</div>
              <div className="pool-fee">0.3% Fee</div>
            </div>
            
            <div 
              className={`pool-card ${selectedPool === 'ETH/USDC' ? 'active' : ''}`}
              onClick={() => handlePoolSelect('ETH/USDC')}
            >
              <div className="pool-pair">ETH/USDC</div>
              <div className="pool-liquidity">$1.8M Liquidity</div>
              <div className="pool-apy">8.2% APY</div>
              <div className="pool-fee">0.25% Fee</div>
            </div>
            
            <div 
              className={`pool-card ${selectedPool === 'BTC/USDC' ? 'active' : ''}`}
              onClick={() => handlePoolSelect('BTC/USDC')}
            >
              <div className="pool-pair">BTC/USDC</div>
              <div className="pool-liquidity">$3.2M Liquidity</div>
              <div className="pool-apy">15.1% APY</div>
              <div className="pool-fee">0.35% Fee</div>
            </div>
          </div>
        </>
      ) : (
        // Pool Details View
        <>
          <div className="pool-details-header">
            <button className="back-button" onClick={handleBackToPools}>
              ←
            </button>
            <h2 className="pool-details-title">{selectedPool} Pool Details</h2>
          </div>

          <div className="pool-details-content">
            {/* 2x2 Grid Layout */}
            <div className="book-grid-layout">
              {/* Row 1: Chart (2/3) + Place Order (1/3) */}
              <div className="grid-row">
                <div className="chart-section">
                  <PriceChart pair={selectedPool || 'SOL/USDC'} timeframe="1h" />
                </div>
                <div className="order-form-section">
                  <div className="order-form">
                    <h4>Place Order</h4>
                    <div className="form-group">
                      <label>Order Type</label>
                      <select>
                        <option>Market Order</option>
                        <option>Limit Order</option>
                        <option>Stop Order</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Side</label>
                      <div className="side-buttons">
                        <button className="side-btn active">Buy</button>
                        <button className="side-btn">Sell</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Amount</label>
                      <input type="number" placeholder="0.0" />
                    </div>
                    <div className="form-group">
                      <label>Price (Limit Orders)</label>
                      <input type="number" placeholder="0.0" />
                    </div>
                    <button className="place-order-btn">Place Order</button>
                  </div>
                </div>
              </div>

              {/* Row 2: Recent Transactions (2/3) + Order Book (1/3) */}
              <div className="grid-row">
                <div className="transaction-section">
                  <TransactionList poolPair={selectedPool || 'SOL/USDC'} />
                </div>
                <div className="order-book-section">
                  <div className="order-book">
                    <h4>Order Book</h4>
                    <div className="book-tabs">
                      <button className="book-tab active">Buy Orders</button>
                      <button className="book-tab">Sell Orders</button>
                    </div>
                    <div className="book-table">
                      <div className="book-header-row">
                        <span>Price</span>
                        <span>Amount</span>
                        <span>Total</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$150.25</span>
                        <span>1,250 SOL</span>
                        <span>$187,812</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$150.20</span>
                        <span>2,100 SOL</span>
                        <span>$315,420</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$150.15</span>
                        <span>850 SOL</span>
                        <span>$127,627</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$150.10</span>
                        <span>1,500 SOL</span>
                        <span>$225,150</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$150.05</span>
                        <span>2,200 SOL</span>
                        <span>$330,110</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$150.00</span>
                        <span>1,800 SOL</span>
                        <span>$270,000</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$149.95</span>
                        <span>1,100 SOL</span>
                        <span>$164,945</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$149.90</span>
                        <span>1,600 SOL</span>
                        <span>$239,840</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$149.85</span>
                        <span>900 SOL</span>
                        <span>$134,865</span>
                      </div>
                      <div className="book-row">
                        <span className="price">$149.80</span>
                        <span>1,300 SOL</span>
                        <span>$194,740</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
