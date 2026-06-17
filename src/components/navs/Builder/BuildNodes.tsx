"use client";

import { Handle, Position } from '@xyflow/react';
import { normalizeStrategyKind, SINGLE_PRICE_STRATEGIES } from "../../../lib/strategySpec";
import "./BuildNodes.css";

interface NodeData {
  label?: string;
  type?: 'deposit' | 'withdraw' | 'swap' | 'strategy';
  coin?: string;
  toCoin?: string;
  amount?: string;
  toAmount?: string;
  chain?: string;
  dex?: string;
  strategy?: string;
  wallet?: string;
  priceGoal?: string;
  intervals?: string;
  [key: string]: unknown; // Allow additional properties
}


const tokens = ['ETH', 'USDC', 'SOL', 'USDT', 'WBTC', 'XMR'];

interface CustomNodeProps {
  data: NodeData;
  id: string;
  updateNodeData?: (nodeId: string, field: string, value: string) => void;
  tokens?: string[];
  isTokenActive?: (token: string) => boolean;
}

export function CustomNode({ data, id, updateNodeData, tokens: propTokens = tokens, isTokenActive }: CustomNodeProps) {
  const handleChange = (field: string, value: string) => {
    // Prevent selecting inactive tokens
    if ((field === 'coin' || field === 'toCoin') && value && isTokenActive && !isTokenActive(value)) {
      return;
    }
    if (updateNodeData) {
      updateNodeData(id, field, value);
    }
  };

  return (
    <div className="custom-node">
      <Handle type="target" position={Position.Left} />
      <div className="node-content">
        <div className="node-title">{data.label}</div>
        
        {data.type === 'deposit' && (
          <div className="node-inputs">
            <div className="node-input-row">
              <select
                className="node-select"
                value={data.coin || ''}
                onChange={(e) => handleChange('coin', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">Coin</option>
                {propTokens.map(token => {
                  const active = isTokenActive ? isTokenActive(token) : true;
                  return (
                    <option key={token} value={token} disabled={!active} className={!active ? 'inactive-token' : ''}>
                      {token}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                className="node-input"
                placeholder="Amount"
                value={data.amount || ''}
                onChange={(e) => handleChange('amount', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {data.type === 'swap' && (
          <div className="node-inputs">
            <div className="node-input-row">
              <select
                className="node-select"
                value={data.coin || ''}
                onChange={(e) => handleChange('coin', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">From</option>
                {propTokens.map(token => {
                  const active = isTokenActive ? isTokenActive(token) : true;
                  return (
                    <option key={token} value={token} disabled={!active} className={!active ? 'inactive-token' : ''}>
                      {token}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                className="node-input"
                placeholder="Amount"
                value={data.amount || ''}
                onChange={(e) => handleChange('amount', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="node-input-row">
              <select
                className="node-select"
                value={data.toCoin || ''}
                onChange={(e) => handleChange('toCoin', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">To</option>
                {propTokens.map(token => {
                  const active = isTokenActive ? isTokenActive(token) : true;
                  return (
                    <option key={token} value={token} disabled={!active} className={!active ? 'inactive-token' : ''}>
                      {token}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                className="node-input"
                placeholder="Output"
                value={data.toAmount || ''}
                readOnly
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {data.type === 'withdraw' && (
          <div className="node-inputs">
            <div className="node-input-row">
              <select
                className="node-select"
                value={data.coin || ''}
                onChange={(e) => handleChange('coin', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">Coin</option>
                {propTokens.map(token => {
                  const active = isTokenActive ? isTokenActive(token) : true;
                  return (
                    <option key={token} value={token} disabled={!active} className={!active ? 'inactive-token' : ''}>
                      {token}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                className="node-input"
                placeholder="Amount"
                value={data.amount || ''}
                onChange={(e) => handleChange('amount', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <input
              type="text"
              className="node-input"
              placeholder="Wallet address"
              value={data.wallet || ''}
              onChange={(e) => handleChange('wallet', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {data.type === 'strategy' && (
          <div className="node-inputs">
            {(normalizeStrategyKind((data.strategy as string) || undefined) === 'Limit Order') && (
              <select
                className="node-select"
                value={(data.side as string) || 'buy'}
                onChange={(e) => handleChange('side', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            )}

            {SINGLE_PRICE_STRATEGIES.includes(
              normalizeStrategyKind((data.strategy as string) || undefined)
            ) && (
              <input
                type="text"
                className="node-input"
                placeholder={
                  normalizeStrategyKind((data.strategy as string) || undefined) === 'Stop Loss' ? 'Stop price' :
                  normalizeStrategyKind((data.strategy as string) || undefined) === 'Take Profit' ? 'Target price' : 'Limit price'
                }
                value={data.priceGoal || ''}
                onChange={(e) => handleChange('priceGoal', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            )}

            {data.strategy === 'Range' && (
              <>
                <input
                  type="text"
                  className="node-input"
                  placeholder="Range low"
                  value={(data.rangeLow as string) || ''}
                  onChange={(e) => handleChange('rangeLow', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Range high"
                  value={(data.rangeHigh as string) || ''}
                  onChange={(e) => handleChange('rangeHigh', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Grid levels"
                  value={(data.gridLevels as string) || ''}
                  onChange={(e) => handleChange('gridLevels', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </>
            )}

            {data.strategy === 'TWAP' && (
              <>
                <input
                  type="text"
                  className="node-input"
                  placeholder="Slices"
                  value={(data.sliceCount as string) || ''}
                  onChange={(e) => handleChange('sliceCount', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Interval (seconds)"
                  value={(data.intervalSeconds as string) || ''}
                  onChange={(e) => handleChange('intervalSeconds', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Max slippage (bps)"
                  value={(data.maxSlippageBps as string) || ''}
                  onChange={(e) => handleChange('maxSlippageBps', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </>
            )}

            {data.strategy === 'DCA' && (
              <input
                type="text"
                className="node-input"
                placeholder="Intervals"
                value={(data.intervals as string) || ''}
                onChange={(e) => handleChange('intervals', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

