"use client";

import { Handle, Position } from '@xyflow/react';
import { normalizeStrategyKind, SINGLE_PRICE_STRATEGIES, type ScheduleTrigger, type ScheduleUnit, displayScheduleFromSeconds } from "../../../lib/strategySpec";
import { simHighlightClass } from "./simHighlight";
import type { SimHighlightStatus } from "./useCanvasSimulation";
import "./BuildNodes.css";

interface NodeData {
  label?: string;
  type?: 'deposit' | 'withdraw' | 'swap' | 'strategy' | 'control';
  coin?: string;
  toCoin?: string;
  amount?: string;
  toAmount?: string;
  chain?: string;
  dex?: string;
  strategy?: string;
  wallet?: string;
  amountSource?: 'fixed' | 'output';
  linkedFromNodeId?: string | null;
  priceGoal?: string;
  intervals?: string;
  controlKind?: string;
  scheduleValue?: string;
  scheduleUnit?: string;
  scheduleTrigger?: string;
  scheduleAt?: string;
  repeatCount?: string;
  [key: string]: unknown; // Allow additional properties
}

function getScheduleFields(data: NodeData): { value: string; unit: ScheduleUnit } {
  if (data.scheduleValue != null && String(data.scheduleValue).trim() !== "") {
    return {
      value: String(data.scheduleValue),
      unit: (data.scheduleUnit as ScheduleUnit) || "seconds",
    };
  }
  return displayScheduleFromSeconds(data.intervalSeconds as string);
}


const tokens = ['ETH', 'USDC', 'SOL', 'USDT', 'WBTC', 'XMR'];

interface CustomNodeProps {
  data: NodeData;
  id: string;
  updateNodeData?: (nodeId: string, field: string, value: string) => void;
  tokens?: string[];
  isTokenActive?: (token: string) => boolean;
  simStatus?: SimHighlightStatus;
  simShaking?: boolean;
  simExiting?: boolean;
}

export function CustomNode({ data, id, updateNodeData, tokens: propTokens = tokens, isTokenActive, simStatus, simShaking, simExiting }: CustomNodeProps) {
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
    <div className={`custom-node ${simHighlightClass(simStatus, simShaking, simExiting)}`}>
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
                onFocus={(e) => e.stopPropagation()}
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
                type="text"
                inputMode="decimal"
                className="node-input node-input--amount"
                placeholder="Amount"
                value={data.amount || ''}
                onChange={(e) => handleChange('amount', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
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
                onFocus={(e) => e.stopPropagation()}
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
                type="text"
                inputMode="decimal"
                className="node-input node-input--amount"
                placeholder="Amount"
                value={data.amount || ''}
                onChange={(e) => handleChange('amount', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              />
            </div>
            <div className="node-input-row">
              <select
                className="node-select"
                value={data.toCoin || ''}
                onChange={(e) => handleChange('toCoin', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
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
                type="text"
                className="node-input node-input--amount"
                placeholder="Output"
                value={data.toAmount || ''}
                readOnly
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {data.type === 'withdraw' && (() => {
          const isLinked = Boolean(data.linkedFromNodeId);
          const amount = (data.amount as string) || '';
          const usesAllOutput = isLinked && !amount.trim();

          return (
          <div className="node-inputs">
            <div className="node-input-row node-input-row--withdraw">
              <select
                className="node-select"
                value={data.coin || ''}
                onChange={(e) => handleChange('coin', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
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
                type="text"
                inputMode="decimal"
                className={`node-input${usesAllOutput ? ' node-input--output' : ' node-input--amount'}`}
                placeholder={isLinked ? 'Output (all)' : 'Amount'}
                value={amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              />
            </div>
            <div className="node-input-row node-input-row--withdraw">
              <input
                type="text"
                className="node-input node-input--wallet"
                placeholder="Wallet address"
                value={data.wallet || ''}
                onChange={(e) => handleChange('wallet', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          );
        })()}

        {data.type === 'strategy' && (
          <div className="node-inputs">
            {SINGLE_PRICE_STRATEGIES.includes(
              normalizeStrategyKind((data.strategy as string) || undefined)
            ) && (
              <>
                <input
                  type="text"
                  className="node-input"
                  placeholder={
                    normalizeStrategyKind((data.strategy as string) || undefined) === 'Stop Loss' ? 'Stop price' :
                    normalizeStrategyKind((data.strategy as string) || undefined) === 'Take Profit' ? 'Target price' : 'Goal price'
                  }
                  value={data.priceGoal || ''}
                  onChange={(e) => handleChange('priceGoal', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                />
                {(data.strategy === 'Stop Loss' || data.strategy === 'Take Profit') && (
                  <input
                    type="text"
                    className="node-input"
                    placeholder="% of position (default 100)"
                    value={(data.positionPct as string) || ''}
                    onChange={(e) => handleChange('positionPct', e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                  />
                )}
              </>
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
                onFocus={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Range high"
                  value={(data.rangeHigh as string) || ''}
                  onChange={(e) => handleChange('rangeHigh', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Grid levels"
                  value={(data.gridLevels as string) || ''}
                  onChange={(e) => handleChange('gridLevels', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
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
                onFocus={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Interval (seconds)"
                  value={(data.intervalSeconds as string) || ''}
                  onChange={(e) => handleChange('intervalSeconds', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                />
                <input
                  type="text"
                  className="node-input"
                  placeholder="Max slippage (bps)"
                  value={(data.maxSlippageBps as string) || ''}
                  onChange={(e) => handleChange('maxSlippageBps', e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
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
                onFocus={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )}

        {data.type === 'control' && (
          <div className="node-inputs">
            {((data.controlKind as string) || '').toLowerCase() === 'schedule' && (() => {
              const trigger = ((data.scheduleTrigger as string) || 'after') as ScheduleTrigger;
              const afterFields = getScheduleFields(data);
              return (
                <div className="node-input-row node-input-row--schedule">
                  <select
                    className="node-select node-select--trigger"
                    value={trigger}
                    onChange={(e) => handleChange('scheduleTrigger', e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                  >
                    <option value="after">After</option>
                    <option value="at">At</option>
                  </select>
                  {trigger === 'after' ? (
                    <>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="node-input node-input--schedule-value"
                        placeholder="0"
                        value={afterFields.value}
                        onChange={(e) => handleChange('scheduleValue', e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                      />
                      <select
                        className="node-select node-select--unit"
                        value={afterFields.unit}
                        onChange={(e) => handleChange('scheduleUnit', e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                      >
                        <option value="blocks">Blocks</option>
                        <option value="seconds">Seconds</option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                      </select>
                    </>
                  ) : (
                    <input
                      type="time"
                      className="node-input node-input--time"
                      value={(data.scheduleAt as string) || ''}
                      onChange={(e) => handleChange('scheduleAt', e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

