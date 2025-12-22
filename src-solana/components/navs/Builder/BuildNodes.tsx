"use client";

import { Handle, Position } from '@xyflow/react';
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

interface CustomNodeProps {
  data: NodeData;
  id: string;
  updateNodeData?: (nodeId: string, field: string, value: string) => void;
  tokens?: string[];
}

const tokens = ['SOL', 'USDC', 'USDT', 'WBTC', 'XMR'];

export function CustomNode({ data, id, updateNodeData, tokens: propTokens = tokens }: CustomNodeProps) {
  const handleChange = (field: string, value: string) => {
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
                {propTokens.map(token => (
                  <option key={token} value={token}>{token}</option>
                ))}
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
                {propTokens.map(token => (
                  <option key={token} value={token}>{token}</option>
                ))}
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
                {propTokens.map(token => (
                  <option key={token} value={token}>{token}</option>
                ))}
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
                {propTokens.map(token => (
                  <option key={token} value={token}>{token}</option>
                ))}
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
            <input
              type="text"
              className="node-input"
              placeholder="Price goal"
              value={data.priceGoal || ''}
              onChange={(e) => handleChange('priceGoal', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <input
              type="text"
              className="node-input"
              placeholder="Intervals"
              value={(data.intervals as string) || ''}
              onChange={(e) => handleChange('intervals', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

