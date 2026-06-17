"use client";

import { Handle, Position } from '@xyflow/react';
import { normalizeStrategyKind, SINGLE_PRICE_STRATEGIES, type ScheduleTrigger, type ScheduleUnit, displayScheduleFromSeconds } from "../../../lib/strategySpec";
import { simHighlightClass } from "./simHighlight";
import type { SimHighlightStatus } from "./useCanvasSimulation";
import "./BuildNodes.css";

export interface ConditionNode {
  op: "LEAF" | "AND" | "OR" | "NOT";
  asset?: string;
  condition?: "GTE" | "LTE";
  bound?: number;
  price_feed_id?: string;
  conditions?: ConditionNode[];
}

export const PYTH_PRICE_FEED_IDS: Record<string, string> = {
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};

export const CHAIN_LABEL_TO_ID: Record<string, string> = {
  Sepolia: "11155111",
  Ethereum: "1",
  Arbitrum: "42161",
  Optimism: "10",
  Base: "8453",
  Polygon: "137",
  Solana: "solana",
};

export function chainLabelToId(chain?: string | null): string {
  if (!chain) return "11155111";
  const normalized = chain.trim();
  if (CHAIN_LABEL_TO_ID[normalized]) return CHAIN_LABEL_TO_ID[normalized];
  if (normalized === "solana" || /^\d+$/.test(normalized)) return normalized;
  return "11155111";
}

export function validateRecipientAddress(address: string, toChain: string): string | null {
  if (!address) return "Recipient address required";
  const EVM_CHAIN_IDS = ["1", "11155111", "42161", "10", "8453", "137"];
  const EVM_REGEX = /^0x[0-9a-fA-F]{40}$/;
  const SOLANA_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  if (toChain === "solana") {
    return SOLANA_REGEX.test(address) ? null : "Invalid Solana address (Base58, 32-44 chars)";
  }
  if (EVM_CHAIN_IDS.includes(toChain)) {
    return EVM_REGEX.test(address) ? null : "Invalid EVM address (0x + 40 hex)";
  }
  return "Unknown destination chain";
}

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
  useTree?: string;
  conditionTree?: string;
  controlKind?: string;
  scheduleValue?: string;
  scheduleUnit?: string;
  scheduleTrigger?: string;
  scheduleAt?: string;
  repeatCount?: string;
  [key: string]: unknown;
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

function TreeBuilderNode({
  node,
  onChange,
  onDelete
}: {
  node: ConditionNode;
  onChange: (newNode: ConditionNode) => void;
  onDelete?: () => void;
}) {
  const handleOpChange = (newOp: "LEAF" | "AND" | "OR" | "NOT") => {
    if (newOp === "LEAF") {
      onChange({
        op: "LEAF",
        asset: "ETH",
        condition: "LTE",
        bound: 1500,
        price_feed_id: PYTH_PRICE_FEED_IDS.ETH
      });
    } else if (newOp === "NOT") {
      onChange({
        op: "NOT",
        conditions: [
          {
            op: "LEAF",
            asset: "ETH",
            condition: "LTE",
            bound: 1500,
            price_feed_id: PYTH_PRICE_FEED_IDS.ETH
          }
        ]
      });
    } else {
      onChange({
        op: newOp,
        conditions: [
          {
            op: "LEAF",
            asset: "ETH",
            condition: "LTE",
            bound: 1500,
            price_feed_id: PYTH_PRICE_FEED_IDS.ETH
          }
        ]
      });
    }
  };

  const handleLeafChange = (field: string, value: string | number) => {
    const updated = { ...node, [field]: value };
    if (field === "asset") {
      updated.price_feed_id = PYTH_PRICE_FEED_IDS[value as string] || "";
    }
    onChange(updated);
  };

  const handleChildChange = (index: number, newChild: ConditionNode) => {
    const newConditions = [...(node.conditions || [])];
    newConditions[index] = newChild;
    onChange({ ...node, conditions: newConditions });
  };

  const handleAddChild = (childOp: "LEAF" | "AND" | "OR") => {
    const newChild: ConditionNode = childOp === "LEAF"
      ? {
          op: "LEAF",
          asset: "ETH",
          condition: "LTE",
          bound: 1500,
          price_feed_id: PYTH_PRICE_FEED_IDS.ETH
        }
      : {
          op: childOp,
          conditions: []
        };
    onChange({
      ...node,
      conditions: [...(node.conditions || []), newChild]
    });
  };

  const handleRemoveChild = (index: number) => {
    const newConditions = (node.conditions || []).filter((_, i) => i !== index);
    onChange({ ...node, conditions: newConditions });
  };

  return (
    <div className="tree-builder-node" style={{
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '6px',
      padding: '8px',
      marginTop: '6px',
      background: 'rgba(0, 0, 0, 0.2)',
      textAlign: 'left'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <select
          value={node.op}
          onChange={(e) => handleOpChange(e.target.value as "LEAF" | "AND" | "OR" | "NOT")}
          style={{
            background: '#222',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            fontSize: '11px',
            padding: '2px 4px',
            fontFamily: 'monospace'
          }}
        >
          <option value="LEAF">Condition</option>
          <option value="AND">AND Group</option>
          <option value="OR">OR Group</option>
          <option value="NOT">NOT Wrap</option>
        </select>

        {onDelete && (
          <button
            onClick={onDelete}
            style={{
              background: 'transparent',
              color: '#ff6b6b',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '0px 4px',
              fontWeight: 'bold'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {node.op === "LEAF" ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <select
              value={node.asset || 'ETH'}
              onChange={(e) => handleLeafChange('asset', e.target.value)}
              style={{
                background: '#333',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                fontSize: '11px',
                flex: 1,
                padding: '3px',
                fontFamily: 'monospace'
              }}
            >
              <option value="ETH">ETH</option>
              <option value="BTC">BTC</option>
              <option value="SOL">SOL</option>
              <option value="USDC">USDC</option>
            </select>
            
            <select
              value={node.condition || 'LTE'}
              onChange={(e) => handleLeafChange('condition', e.target.value)}
              style={{
                background: '#333',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                fontSize: '11px',
                width: '60px',
                padding: '3px',
                fontFamily: 'monospace'
              }}
            >
              <option value="LTE">≤</option>
              <option value="GTE">≥</option>
            </select>
          </div>
          
          <input
            type="number"
            placeholder="Price Limit"
            value={node.bound === undefined ? '' : node.bound}
            onChange={(e) => handleLeafChange('bound', parseFloat(e.target.value) || 0)}
            style={{
              background: '#333',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '4px',
              fontSize: '11px',
              padding: '3px 6px',
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'monospace'
            }}
          />
        </div>
      ) : (
        <div style={{ paddingLeft: '8px', borderLeft: '1px dashed rgba(255, 255, 255, 0.15)', marginTop: '6px' }}>
          {node.conditions?.map((child, idx) => (
            <TreeBuilderNode
              key={idx}
              node={child}
              onChange={(newChild) => handleChildChange(idx, newChild)}
              onDelete={() => handleRemoveChild(idx)}
            />
          ))}

          {node.op !== "NOT" && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              <button
                onClick={() => handleAddChild('LEAF')}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '9px',
                  padding: '3px 6px',
                  cursor: 'pointer',
                  flex: 1,
                  fontFamily: 'monospace'
                }}
              >
                + Add Limit
              </button>
              <button
                onClick={() => handleAddChild('AND')}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '9px',
                  padding: '3px 6px',
                  cursor: 'pointer',
                  flex: 1,
                  fontFamily: 'monospace'
                }}
              >
                + Add Group
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CustomNode({ data, id, updateNodeData, tokens: propTokens = tokens, isTokenActive, simStatus, simShaking, simExiting }: CustomNodeProps) {
  const handleChange = (field: string, value: string) => {
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
            {data.wallet && (() => {
              const err = validateRecipientAddress(data.wallet, chainLabelToId(data.chain as string));
              return err ? (
                <div style={{ color: '#ff6b6b', fontSize: '10px', marginTop: '4px', textAlign: 'left', textTransform: 'none', fontFamily: 'monospace' }}>
                  ⚠️ {err}
                </div>
              ) : null;
            })()}
          </div>
          );
        })()}

        {data.type === 'strategy' && (
          <div className="node-inputs">
            {/* Mode selection toggle */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button
                onClick={() => { handleChange('useTree', 'false'); handleChange('conditionTree', ''); }}
                style={{
                  flex: 1,
                  background: data.useTree !== 'true' ? 'rgba(255, 193, 7, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  border: data.useTree !== 'true' ? '1px solid #ffc107' : '1px solid transparent',
                  borderRadius: '4px', fontSize: '10px', padding: '4px', cursor: 'pointer',
                  fontWeight: 'bold', fontFamily: 'monospace'
                }}
              >Legacy Mode</button>
              <button
                onClick={() => {
                  handleChange('useTree', 'true');
                  const defaultTree: ConditionNode = { op: "LEAF", asset: "ETH", condition: "LTE", bound: 1500, price_feed_id: PYTH_PRICE_FEED_IDS.ETH };
                  handleChange('conditionTree', JSON.stringify(defaultTree));
                }}
                style={{
                  flex: 1,
                  background: data.useTree === 'true' ? 'rgba(255, 193, 7, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  border: data.useTree === 'true' ? '1px solid #ffc107' : '1px solid transparent',
                  borderRadius: '4px', fontSize: '10px', padding: '4px', cursor: 'pointer',
                  fontWeight: 'bold', fontFamily: 'monospace'
                }}
              >Multi-Asset</button>
            </div>

            {data.useTree !== 'true' ? (
              <>
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

                {SINGLE_PRICE_STRATEGIES.includes(normalizeStrategyKind((data.strategy as string) || undefined)) && (
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
                    <input type="text" className="node-input" placeholder="Range low"
                      value={(data.rangeLow as string) || ''} onChange={(e) => handleChange('rangeLow', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                    <input type="text" className="node-input" placeholder="Range high"
                      value={(data.rangeHigh as string) || ''} onChange={(e) => handleChange('rangeHigh', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                    <input type="text" className="node-input" placeholder="Grid levels"
                      value={(data.gridLevels as string) || ''} onChange={(e) => handleChange('gridLevels', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                  </>
                )}

                {data.strategy === 'TWAP' && (
                  <>
                    <input type="text" className="node-input" placeholder="Slices"
                      value={(data.sliceCount as string) || ''} onChange={(e) => handleChange('sliceCount', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                    <input type="text" className="node-input" placeholder="Interval (seconds)"
                      value={(data.intervalSeconds as string) || ''} onChange={(e) => handleChange('intervalSeconds', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                    <input type="text" className="node-input" placeholder="Max slippage (bps)"
                      value={(data.maxSlippageBps as string) || ''} onChange={(e) => handleChange('maxSlippageBps', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                  </>
                )}

                {data.strategy === 'DCA' && (
                  <input type="text" className="node-input" placeholder="Intervals"
                    value={(data.intervals as string) || ''} onChange={(e) => handleChange('intervals', e.target.value)} onMouseDown={(e) => e.stopPropagation()} />
                )}
              </>
            ) : (
              <div onMouseDown={(e) => e.stopPropagation()}>
                {(() => {
                  let parsedTree: ConditionNode;
                  try { parsedTree = JSON.parse(data.conditionTree as string); }
                  catch { parsedTree = { op: "LEAF", asset: "ETH", condition: "LTE", bound: 1500, price_feed_id: PYTH_PRICE_FEED_IDS.ETH }; }
                  return <TreeBuilderNode node={parsedTree} onChange={(newTree) => handleChange('conditionTree', JSON.stringify(newTree))} />;
                })()}
              </div>
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
