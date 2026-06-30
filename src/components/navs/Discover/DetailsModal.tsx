"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Node, Edge } from '@xyflow/react';
import "./Discover.css";
import "./BuilderRunModal.css";
import StrategyPreviewFlow from "../Builder/StrategyPreviewFlow";
import { getModalStepNodes } from "../../../lib/builderLayout";
import { getRunStepFieldValue, buildRunModeValuesFromNodes } from "../../../lib/runModeValues";
import { buildGraphRunPlan } from "../../../lib/graphRunPlan";
import { submitEncryptedStrategy } from "../../../lib/strategySubmit";
import { generateZKData } from "../../../lib/zkHandler";
import { createVaultOutputNote } from "../../../lib/outputNoteResolver";
import { buildTwapLegs, buildGridLegs, submitSplitOnChain, resolveSwapPool } from "../../../lib/multiLegBuilder";
import { armingFeeUsd, FEE } from "../../../lib/feeModel";
import { getOrCreateClientKey } from "../../../lib/fhe";
import { NATIVE_TOKEN } from "../../../lib/networks";
import { normalizeStrategyKind, resolvePositionPct } from "../../../lib/strategySpec";
import { walletManager } from "../../extensions/walletManager";
import { resolveWalletAddress } from "../../../lib/walletAddress";
import { getSelectedChainId, getTokens, getNetwork, RUN_MODE_CHAIN_LABELS, resolveRunModeChainId, getRunModeChainLabel, getRunModeChainDisplayLabel, selectChainAndSwitchWallet, getZkWithdrawRecipient } from "../../../lib/networks";
import ChainToggle from "../../ChainToggle";
import { formatAmount as formatAmountUtil, calculateExchange as calculateExchangeUtil, calculateNetReceiveEstimate, fetchCoinPrices, calculateVariableCost, calculateFixedCost, calculateRunFee, durationToHours } from "./price_utils";
import { DEFAULT_SWAP_SLIPPAGE_PCT } from "@/lib/quickSwapSettings";


interface NodeData {
  label?: string;
  type?: 'deposit' | 'swap' | 'withdraw' | 'strategy' | 'repeatGroup' | 'control';
  coin?: string;
  toCoin?: string;
  amount?: string;
  strategy?: string;
  chain?: string;
  [key: string]: string | undefined;
}

interface StepTag {
  label: string;
  field: string;
  options?: string[];
  // Read-only derived tag (e.g. withdraw asset = swap output). Rendered as a static
  // chip showing `value` instead of an editable control.
  readOnly?: boolean;
  value?: string;
}

// Plain-English one-liner shown under each step so the numbers aren't ambiguous.
// `coin` is the volatile asset the strategy trades (e.g. ETH), derived from the graph.
function getStepHint(nodeData: NodeData, coin: string): string | null {
  switch (nodeData?.type) {
    case 'deposit':
      return 'Funds to spend from your vault — you deposit once; this just selects which balance to use.';
    case 'strategy': {
      switch (nodeData.strategy) {
        case 'Limit Order':
          return `Trigger price in USD for 1 ${coin} (e.g. 1500 = run when 1 ${coin} = $1,500). Direction follows the swap.`;
        case 'Stop Loss':
          return `Runs when 1 ${coin} falls to this USD price.`;
        case 'Take Profit':
          return `Runs when 1 ${coin} rises to this USD price.`;
        case 'Range':
          return `USD price band per 1 ${coin} — runs across this low–high range.`;
        case 'TWAP':
        case 'DCA':
          return 'Splits the order into slices over time.';
        default:
          return `Trigger price in USD for 1 ${coin}.`;
      }
    }
    case 'swap':
      return `The trade executed when the trigger hits (sells/buys via the chosen DEX).`;
    case 'withdraw':
      return 'Swap output stays private in your Siphon vault — withdraw it anytime from your wallet. (Your address = note owner.)';
    default:
      return null;
  }
}

interface StrategyMetadata {
  name: string;
  author: string;
  nodes: number;
  usage: string | number;
  profit: string;
  description: string;
  category: string;
  chains: string[];
  networks: string[];
  isActive?: boolean;
}

interface DetailsModalProps {
  selectedStrategy: StrategyMetadata;
  isOpen: boolean;
  onClose: () => void;
  isRunMode: boolean;
  setIsRunMode: (mode: boolean) => void;
  modalStrategyNodes: Node[];
  modalStrategyEdges: Edge[];
  runModeValues: Record<string, Record<string, string>>;
  setRunModeValues: (values: Record<string, Record<string, string>> | ((prev: Record<string, Record<string, string>>) => Record<string, Record<string, string>>)) => void;
  runDuration: string;
  setRunDuration: (duration: string) => void;
  isFading: boolean;
  setIsFading: (fading: boolean) => void;
  flowKey: number;
  isFlowLoading: boolean;
  runningStrategies?: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>;
  setRunningStrategies?: (strategies: Map<string, { startTime: number; isRunning: boolean; loop: boolean }> | ((prev: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>) => Map<string, { startTime: number; isRunning: boolean; loop: boolean }>)) => void;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  setViewMode: (mode: 'blueprint' | 'run' | 'discover') => void;
  setCurrentFileName: (name: string) => void;
  savedScenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
  setSavedScenes: (scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }> | ((scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>) => Array<{ name: string; nodes: Node[]; edges: Edge[] }>)) => void;
  setShowSuccessNotification: (show: boolean) => void;
  fromBuilder?: boolean;
}

export default function DetailsModal({
  selectedStrategy,
  isOpen,
  onClose,
  isRunMode,
  setIsRunMode,
  modalStrategyNodes,
  modalStrategyEdges,
  runModeValues,
  setRunModeValues,
  runDuration,
  setRunDuration,
  isFading,
  setIsFading,
  flowKey,
  isFlowLoading,
  runningStrategies,
  setRunningStrategies,
  setNodes,
  setEdges,
  setViewMode,
  setCurrentFileName,
  savedScenes,
  setSavedScenes,
  setShowSuccessNotification,
  fromBuilder = false,
}: DetailsModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [coinPrices, setCoinPrices] = useState<Record<string, number>>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'loading' } | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [activeChainId, setActiveChainId] = useState(getSelectedChainId);
  const [mounted, setMounted] = useState(false);
  const [builderStepsOpen, setBuilderStepsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.classList.add("strategy-modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("strategy-modal-open");
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const stepNodes = useMemo(
    () => getModalStepNodes(modalStrategyNodes, modalStrategyEdges),
    [modalStrategyNodes, modalStrategyEdges]
  );

  // The swap output stays in the Siphon vault (private note) — there is no external withdrawal
  // step, so hide the withdraw node from the displayed steps.
  const displayStepNodes = useMemo(
    () => stepNodes.filter((n) => (n.data as NodeData).type !== 'withdraw'),
    [stepNodes]
  );

  // Derive primary asset from strategy nodes for contextual step hints.
  const strategyCoin = useMemo(() => {
    const VOLATILE = ['ETH', 'BTC', 'SOL'];
    const field = (node: Node, f: string): string | undefined => {
      const rm = getRunStepFieldValue(runModeValues, node.id, f, (node.data as NodeData) || {});
      if (rm != null && rm !== '') return String(rm);
      return (node.data as NodeData)?.[f];
    };

    const swap = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === 'swap');
    const deposit = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === 'deposit');
    const candidates = [
      swap && field(swap, 'coinB'),
      swap && field(swap, 'coin'),
      deposit && field(deposit, 'tokenA'),
      deposit && (deposit.data as NodeData)?.coin,
    ].filter(Boolean) as string[];
    return (candidates.find((c) => VOLATILE.includes(c.toUpperCase())) || 'ETH').toUpperCase();
  }, [modalStrategyNodes, runModeValues]);

  const getStepTags = (nodeData: NodeData, isRunModeView: boolean): StepTag[] => {
    const tags: StepTag[] = [];
    if (nodeData?.type === 'deposit') {
      tags.push({ label: 'Chain', field: 'chain', options: isRunModeView ? [...RUN_MODE_CHAIN_LABELS] : undefined });
      tags.push({ label: 'Token A', field: 'tokenA', options: isRunModeView ? ['USDC', 'ETH'] : undefined });
      tags.push({ label: 'Amount', field: 'amount' });
      return tags;
    }

    if (nodeData?.type === 'strategy') {
      const strategyKind = nodeData.strategy || '';
      if (strategyKind === 'Limit Order') {
        tags.push({ label: 'Goal Price', field: 'priceGoal' });
      } else if (strategyKind === 'Range') {
        tags.push({ label: 'Range Low', field: 'rangeLow' });
        tags.push({ label: 'Range High', field: 'rangeHigh' });
        tags.push({ label: 'Grid Levels', field: 'gridLevels' });
      } else if (strategyKind === 'TWAP') {
        tags.push({ label: 'Slices', field: 'sliceCount' });
        tags.push({ label: 'Interval Sec', field: 'intervalSeconds' });
        tags.push({ label: 'Slippage Bps', field: 'maxSlippageBps' });
      } else if (strategyKind === 'Stop Loss' || strategyKind === 'Take Profit') {
        tags.push({ label: 'PriceGoal', field: 'priceGoal' });
        tags.push({ label: 'Position %', field: 'positionPct' });
      }
      return tags;
    }

    if (nodeData?.type === 'swap') {
      tags.push({ label: 'Dex', field: 'dexType', options: isRunModeView ? ['Uniswap'] : undefined });
      if (isRunModeView) {
        tags.push({ label: 'From', field: 'coin', options: ['ETH', 'USDC'] });
        tags.push({ label: 'Amount', field: 'amount' });
      }
      tags.push({ label: 'To', field: 'coinB', options: isRunModeView ? ['ETH', 'USDC'] : undefined });
      return tags;
    }

    if (nodeData?.type === 'withdraw') {
      tags.push({ label: 'Chain', field: 'chain', options: isRunModeView ? [...RUN_MODE_CHAIN_LABELS] : undefined });
      if (isRunModeView) {
        // The withdrawn asset is whatever the swap outputs — not a free choice. Show it
        // read-only (derived from the swap's "To" coin, honouring any run-mode override)
        // instead of a misleading editable dropdown that the execution path ignores.
        const swapNode = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === 'swap');
        const swapOut = swapNode
          ? getRunStepFieldValue(runModeValues, swapNode.id, 'coinB', swapNode.data as NodeData)
          : '';
        tags.push({ label: 'Receive', field: 'coin', readOnly: true, value: swapOut || 'ETH' });
        tags.push({ label: 'Amount', field: 'amount' });
      }
      tags.push({ label: 'Address', field: 'address' });
      return tags;
    }

    if (nodeData?.type === 'repeatGroup') {
      if (!isRunModeView) return tags;
      tags.push({
        label: 'Mode',
        field: 'repeatMode',
        options: ['until_funds', 'count'],
      });
      tags.push({ label: 'Count', field: 'repeatCount' });
      tags.push({ label: 'Every', field: 'loopIntervalValue' });
      tags.push({
        label: 'Unit',
        field: 'loopIntervalUnit',
        options: ['blocks', 'seconds', 'minutes', 'hours'],
      });
      return tags;
    }

    if (nodeData?.type === 'control') {
      const kind = String(nodeData.controlKind || '').toLowerCase();
      if (kind === 'schedule' && isRunModeView) {
        tags.push({ label: 'Value', field: 'scheduleValue' });
        tags.push({
          label: 'Unit',
          field: 'scheduleUnit',
          options: ['blocks', 'seconds', 'minutes', 'hours'],
        });
      }
      return tags;
    }

    return tags;
  };

  // Fetch prices when entering Run mode or opening from the builder
  useEffect(() => {
    if (isOpen && (isRunMode || fromBuilder) && !pricesLoaded) {
      const fetchPrices = async () => {
        try {
          const prices = await fetchCoinPrices();
          if (Object.keys(prices).length > 0) {
            setCoinPrices(prices);
            setPricesLoaded(true);
          } else {
            // Fallback prices
            console.warn('[DetailsModal] Using fallback prices');
            setCoinPrices({
              'ETH': 3000,
              'USDC': 1,
              'SOL': 192,
              'BTC': 45000,
            });
            setPricesLoaded(true);
          }
        } catch (error) {
          console.error('[DetailsModal] Error fetching prices:', error);
          // Fallback prices
          setCoinPrices({
            'ETH': 3000,
            'USDC': 1,
            'SOL': 192,
            'BTC': 45000,
          });
          setPricesLoaded(true);
        }
      };
      fetchPrices();
    }
  }, [isOpen, isRunMode, fromBuilder, pricesLoaded]);

  // Reset prices when modal closes or when exiting Run mode
  useEffect(() => {
    if (!isOpen || !isRunMode) {
      setPricesLoaded(false);
      setCoinPrices({});
    }
  }, [isOpen, isRunMode]);

  // Check wallet connection status
  useEffect(() => {
    const checkWalletConnection = async () => {
      const restored = await walletManager.restorePersistedSession();
      setIsWalletConnected(Boolean(restored ?? walletManager.getPrimaryWallet()));
    };

    void checkWalletConnection();

    const handleWalletConnected = () => {
      setIsWalletConnected(walletManager.hasActiveSession());
    };

    const handleWalletDisconnected = () => {
      setIsWalletConnected(false);
    };

    window.addEventListener('walletConnected', handleWalletConnected);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);

    return () => {
      window.removeEventListener('walletConnected', handleWalletConnected);
      window.removeEventListener('walletDisconnected', handleWalletDisconnected);
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveChainId(getSelectedChainId());
    const onChain = (e: Event) => {
      const id = (e as CustomEvent<{ chainId: number }>).detail?.chainId;
      if (id) setActiveChainId(id);
    };
    window.addEventListener('siphon:chainChanged', onChain);
    return () => window.removeEventListener('siphon:chainChanged', onChain);
  }, [isOpen]);

  // Local wrapper functions that use fetched prices
  const calculateExchange = (inputAmount: number, coinA: string, coinB: string): number => {
    return calculateExchangeUtil(inputAmount, coinA, coinB, coinPrices);
  };

  const estimateSlippagePct = useMemo(() => {
    const strategyNode = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === "strategy");
    if (!strategyNode) return DEFAULT_SWAP_SLIPPAGE_PCT;
    const bps = getRunStepFieldValue(
      runModeValues,
      strategyNode.id,
      "maxSlippageBps",
      strategyNode.data as NodeData,
    );
    const parsed = parseFloat(bps || "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed / 100 : DEFAULT_SWAP_SLIPPAGE_PCT;
  }, [modalStrategyNodes, runModeValues]);

  const formatAmount = (amount: number, coin?: string): string => {
    return formatAmountUtil(amount, coin);
  };

  const executionTime = 2; // Fixed execution time
  const runDurationHours = durationToHours(runDuration);
  const baseFee = calculateFixedCost();
  const hourlyFee = calculateVariableCost(runDuration);
  const totalCost = calculateRunFee(runDuration);
  const ethUsd = coinPrices.ETH || 3000;

  const runSummary = useMemo(() => {
    const depositNode = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === "deposit");
    const swapNode = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === "swap");
    const depositData = depositNode?.data as NodeData | undefined;
    const swapData = swapNode?.data as NodeData | undefined;
    const depositStepId = depositNode?.id ?? "";
    const swapStepId = swapNode?.id ?? "";

    const inputCoin =
      getRunStepFieldValue(runModeValues, depositStepId, "tokenA", depositData || {}) ||
      depositData?.coin ||
      "USDC";
    const outputCoin =
      getRunStepFieldValue(runModeValues, swapStepId, "coinB", swapData || {}) ||
      swapData?.toCoin ||
      inputCoin;
    const inputAmount =
      parseFloat(getRunStepFieldValue(runModeValues, depositStepId, "amount", depositData || {}) || "0") ||
      0;
    const outputAmount = calculateNetReceiveEstimate(
      inputAmount,
      inputCoin,
      outputCoin,
      coinPrices,
      estimateSlippagePct,
      totalCost,
    );

    const strategyNode = modalStrategyNodes.find((n) => (n.data as NodeData)?.type === "strategy");
    const strategyKind = (strategyNode?.data as NodeData)?.strategy || "Custom";
    const priceGoal = strategyNode
      ? getRunStepFieldValue(runModeValues, strategyNode.id, "priceGoal", strategyNode.data as NodeData)
      : "";
    const depositChainRaw = depositNode
      ? getRunStepFieldValue(runModeValues, depositStepId, "chain", depositData || {}) ||
        getRunModeChainLabel(activeChainId)
      : getRunModeChainLabel(activeChainId);
    const depositChain = getRunModeChainDisplayLabel(depositChainRaw);

    const coinPrice = (symbol: string) =>
      coinPrices[symbol.toUpperCase()] ?? (symbol.toUpperCase() === "USDC" ? 1 : 0);
    const inputUsd = inputAmount * coinPrice(inputCoin);
    const outputUsd = outputAmount * coinPrice(outputCoin);

    return {
      inputCoin,
      outputCoin,
      inputAmount,
      outputAmount,
      inputUsd,
      outputUsd,
      strategyKind,
      priceGoal,
      depositChain,
      stepCount: displayStepNodes.length,
    };
  }, [modalStrategyNodes, runModeValues, coinPrices, displayStepNodes, activeChainId, estimateSlippagePct, totalCost]);

  const formatUsd = (value: number) =>
    value > 0 ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—";

  const renderEditableRunSteps = () => (
    <div className="strategy-steps-list builder-run-steps-list">
      {displayStepNodes.map((node, index) => {
        const nodeData = node.data as NodeData;
        const tags = getStepTags(nodeData, true);
        const stepId = node.id;

        const handleMyWallet = () => {
          const walletAddress = resolveWalletAddress();
          if (walletAddress) {
            setRunModeValues((prev) => ({
              ...prev,
              [stepId]: { ...prev[stepId], address: walletAddress },
            }));
            showToast("Wallet address filled successfully", "success");
          } else {
            showToast("No wallet connected. Please connect a wallet first.", "error");
          }
        };

        return (
          <div key={node.id} className="strategy-step-item builder-run-step-item">
            <div className="strategy-step-number">{index + 1}</div>
            <div className="strategy-step-content">
              <div className="strategy-step-title">{nodeData?.label || `Step ${index + 1}`}</div>
              {getStepHint(nodeData, strategyCoin) && (
                <div className="strategy-step-hint">{getStepHint(nodeData, strategyCoin)}</div>
              )}
              <div className="strategy-step-details">
                {tags.map((tag, idx) => (
                  <div key={idx} className="strategy-step-input-wrapper">
                    {tag.readOnly ? (
                      <div className="strategy-step-readonly" title="Determined by the swap output">
                        <span className="strategy-step-readonly-label">{tag.label}</span>
                        <span className="strategy-step-readonly-value">{tag.value}</span>
                      </div>
                    ) : tag.options ? (
                      <select
                        className="strategy-step-select"
                        value={getRunStepFieldValue(runModeValues, stepId, tag.field, nodeData)}
                        onChange={(e) => {
                          setRunModeValues((prev) => ({
                            ...prev,
                            [stepId]: { ...prev[stepId], [tag.field]: e.target.value },
                          }));
                        }}
                      >
                        <option value="">{tag.label}</option>
                        {tag.field === "repeatMode" ? (
                          <>
                            <option value="until_funds">Until funds end</option>
                            <option value="count">N times</option>
                          </>
                        ) : (
                          tag.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))
                        )}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="strategy-step-input"
                        placeholder={tag.label}
                        value={
                          runModeValues[stepId]?.[tag.field] ??
                          getRunStepFieldValue(runModeValues, stepId, tag.field, nodeData)
                        }
                        onChange={(e) => {
                          setRunModeValues((prev) => ({
                            ...prev,
                            [stepId]: { ...prev[stepId], [tag.field]: e.target.value },
                          }));
                        }}
                      />
                    )}
                  </div>
                ))}
                {nodeData?.type === "withdraw" && (
                  <button
                    className="strategy-step-my-wallet-btn"
                    onClick={handleMyWallet}
                    type="button"
                  >
                    My Wallet
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const addLog = (message: string) => {
    setExecutionLogs(prev => [...prev, message]);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'loading' = 'info') => {
    setIsFadingOut(false);
    setToast({ message, type });
    if (type !== 'loading') {
      setTimeout(() => {
        setIsFadingOut(true);
        setTimeout(() => {
          setToast(null);
          setIsFadingOut(false);
        }, 300); // Match fade out animation duration
      }, 3000);
    }
  };

  // Auto-hide toast after 3 seconds (except loading toasts)
  useEffect(() => {
    if (toast && toast.type !== 'loading') {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!isOpen || !mounted) return null;

  const handleClose = () => {
    setIsRunMode(false);
    setRunModeValues({});
    setBuilderStepsOpen(false);
    onClose();
  };

  const handleConnectWallet = () => {
    // Trigger the topbar ConnectButton to open wallet selector
    window.dispatchEvent(new CustomEvent('triggerWalletConnection'));
  };

  const handleExecute = async () => {
    // Check wallet connection first
    if (!isWalletConnected) {
      await handleConnectWallet();
      return;
    }

    if (!isRunMode) {
      setIsFading(true);
      setTimeout(() => {
        setIsRunMode(true);
        setRunModeValues(buildRunModeValuesFromNodes(modalStrategyNodes));
        setIsFading(false);
      }, 200);
      return;
    }

    setIsExecuting(true);
    setExecutionLogs([]);
    addLog('Starting strategy execution...');

    const depositNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'deposit');
    const swapNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'swap');

    const runPlan = buildGraphRunPlan(modalStrategyNodes, modalStrategyEdges, runModeValues);
    if (!runPlan.ok) {
      showToast(runPlan.error, 'error');
      setIsExecuting(false);
      return;
    }

    const { plan } = runPlan;
    const { assetIn, assetOut, amount, payload: bounds } = plan;

    // Vault-mode: the swap output stays in the Siphon vault as the user's private note — there's
    // no external withdrawal step. The recipient/owner is simply the connected wallet.
    const recipient = walletManager.getConnectedWallets()[0]?.address || plan.recipient || '';
    if (!recipient) {
      showToast('Connect your wallet to run this strategy.', 'error');
      setIsExecuting(false);
      return;
    }

    const getValue = (nodeId: string | undefined, field: string, defaultVal: string = '') => {
      if (!nodeId) return defaultVal;
      if (runModeValues[nodeId] && runModeValues[nodeId][field]) {
        return runModeValues[nodeId][field];
      }
      const node = modalStrategyNodes.find(n => n.id === nodeId);
      return (node?.data as NodeData)?.[field] || defaultVal;
    };

    const amountStr = getValue(depositNode?.id, 'amount', String(amount));

    // Stop Loss / Take Profit can act on a fraction of the deposit (Position %). Apply it to the
    // amount actually withdrawn + swapped; the remainder stays as a shielded change note. Other
    // kinds use the full deposit (positionPct resolves to 100).
    const strategyNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'strategy');
    const strategyKind = normalizeStrategyKind((strategyNode?.data as NodeData)?.strategy as string | undefined);
    let effectiveAmountStr = amountStr;
    let effectiveAmount = amount;
    if (strategyKind === 'Stop Loss' || strategyKind === 'Take Profit') {
      const pct = resolvePositionPct({ positionPct: getValue(strategyNode?.id, 'positionPct') });
      if (pct < 100) {
        const full = parseFloat(amountStr) || 0;
        effectiveAmount = full * pct / 100;
        effectiveAmountStr = String(effectiveAmount);
        addLog(`Position ${pct}% → ${strategyKind} acts on ${effectiveAmountStr} of ${full} ${assetIn}`);
      }
    }

    const depositChainLabel = depositNode
      ? getRunStepFieldValue(runModeValues, depositNode.id, 'chain', depositNode.data as NodeData)
      : getRunModeChainLabel(activeChainId);
    const fromChainId = resolveRunModeChainId(depositChainLabel);
    // Vault-mode keeps the output in the deposit chain's vault — always same-chain (no bridge).
    const toChainId = fromChainId;
    if (fromChainId == null) {
      showToast('Please select a deposit chain (Base or Ethereum Sepolia).', 'error');
      setIsExecuting(false);
      return;
    }

    setIsFading(true);

    try {
      addLog('Scanning deposits...');
      
      // Small delay to show the scanning message
      await new Promise(resolve => setTimeout(resolve, 300));

      addLog(`Switching to ${getNetwork(fromChainId).name}...`);
      const switchResult = await selectChainAndSwitchWallet(fromChainId);
      if (!switchResult.ok) {
        throw new Error(switchResult.error || 'Failed to switch wallet to deposit chain');
      }
      setActiveChainId(fromChainId);
      
      const tokenMap = getTokens(fromChainId);
      const tokenInfo = tokenMap[(assetIn || 'USDC').toUpperCase()];
      if (!tokenInfo) throw new Error(`Token ${assetIn} not supported for ZK operations`);

      // ── Multi-leg (TWAP / Grid): split the deposit into N shielded slice/rung legs, each with
      // its own swap proof + encrypted trigger; submit legs[] (no single zk_proof). ──
      if (strategyKind === 'TWAP' || strategyKind === 'Range') {
        const outTokenMl = tokenMap[(assetOut || '').toUpperCase()];
        if (!outTokenMl) throw new Error(`Unsupported output asset: ${assetOut}`);
        const sliceCount = strategyKind === 'TWAP' ? (bounds.slices ?? 0) : (bounds.grid_levels ?? 0);
        if (!sliceCount || sliceCount < 2) throw new Error(`Need ≥2 ${strategyKind === 'TWAP' ? 'slices' : 'grid levels'}`);

        addLog(`Splitting deposit into ${sliceCount} ${strategyKind === 'TWAP' ? 'slices' : 'rungs'} + building proofs…`);
        const clientKey = await getOrCreateClientKey(recipient);
        const submitSplit = (s: Parameters<typeof submitSplitOnChain>[2]) => submitSplitOnChain(fromChainId, tokenInfo, s);

        // Part A: upfront arming fee, carved from the deposit as a protocol fee slice (shielded).
        const windowHoursMl = strategyKind === 'TWAP'
          ? (sliceCount * (bounds.interval_sec ?? 60)) / 3600
          : 24;
        let inUsdMl = coinPrices[tokenInfo.symbol.toUpperCase()] ?? (tokenInfo.symbol === 'USDC' ? 1 : 0);
        if (tokenInfo.symbol === 'ETH' && inUsdMl <= 0) {
          try {
            const pr = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace');
            const pj = await pr.json();
            const p = pj?.parsed?.[0]?.price;
            if (p) inUsdMl = Number(p.price) * 10 ** Number(p.expo);
          } catch { /* graceful */ }
        }
        const armingFeeWeiMl = inUsdMl > 0
          ? BigInt(Math.floor(armingFeeUsd(windowHoursMl) / inUsdMl * 10 ** tokenInfo.decimals))
          : 0n;
        addLog(`Arming fee: $${armingFeeUsd(windowHoursMl).toFixed(2)} (${armingFeeWeiMl} wei ${tokenInfo.symbol})`);

        // Each leg withdraws its slice → swaps → re-deposits the output into the asset_out vault.
        const multi = strategyKind === 'TWAP'
          ? await buildTwapLegs({ chainId: fromChainId, inToken: tokenInfo, outToken: outTokenMl, sliceCount, intervalSec: bounds.interval_sec ?? 60, clientKeyHex: clientKey, submitSplit, armingFeeWei: armingFeeWeiMl })
          : await buildGridLegs({ chainId: fromChainId, inToken: tokenInfo, outToken: outTokenMl, low: bounds.lower_bound ?? 0, high: bounds.upper_bound ?? 0, levels: sliceCount, clientKeyHex: clientKey, submitSplit, armingFeeWei: armingFeeWeiMl });

        addLog(`Submitting ${multi.legs.length}-leg ${strategyKind}…`);
        const mlResult = await submitEncryptedStrategy({
          user_id: recipient,
          strategy_type: strategyKind === 'TWAP' ? 'TWAP' : 'RANGE_GRID',
          asset_in: assetIn || 'USDC',
          asset_out: assetOut,
          amount: effectiveAmount,
          recipient_address: recipient,
          legs: multi.legs,
          interval_sec: bounds.interval_sec,
          grid_levels: bounds.grid_levels,
          max_slippage_bps: bounds.max_slippage_bps,
          schedule_anchor: multi.scheduleAnchor,
          is_private: true,
          output_mode: 'vault' as const,
          arming_fee_wei: multi.armingFeeWei,
          arming_precommitment: multi.armingPrecommitment,
          execution_window_sec: Math.round(runDurationHours * 3600),
          from_chain: String(fromChainId),
          to_chain: String(toChainId ?? fromChainId),
        }, {
          onKeygen: () => addLog('Generating FHE keys…'),
          onUploadKey: () => addLog('Uploading FHE server key…'),
          onUploadClientKey: () => addLog('Sending client key to confidential VM…'),
        });
        if (mlResult.success) {
          addLog(`✅ ${strategyKind} registered — ${multi.legs.length} legs (split ${multi.splitTxHash.slice(0, 10)}…)`);
          showToast(`${strategyKind} running with ${multi.legs.length} legs`, 'success');
          window.dispatchEvent(new CustomEvent('siphon:strategySubmitted', { detail: { strategyId: String(mlResult.data?.strategy_id ?? ''), userId: recipient } }));
        } else {
          addLog(`❌ ${mlResult.error}`);
          showToast(mlResult.error || 'Multi-leg submit failed', 'error');
        }
        setIsExecuting(false);
        setIsFading(false);
        return;
      }

      // Generate ZK proof for strategy execution using full deposit amount
      addLog(`Generating ZK proof on ${getNetwork(fromChainId).name}...`);
      const zkResult = await generateZKData(
        fromChainId,
        tokenInfo,
        effectiveAmountStr,
        getZkWithdrawRecipient(fromChainId),
      );

      if ('error' in zkResult) {
        throw new Error(zkResult.error);
      }

      addLog('ZK proof generated');
      const { withdrawalTxData, newDeposit, newDepositKey, spentDepositKey } = zkResult;

      // Vault-mode output: same-chain asset-changing swap keeps the output shielded as a
      // private note in the asset_out vault (user withdraws later) instead of an external send.
      const outToken = getTokens(fromChainId)[(assetOut || '').toUpperCase()];
      const isSameChainSwap =
        (assetIn || 'USDC').toUpperCase() !== (assetOut || '').toUpperCase() &&
        String(toChainId ?? fromChainId) === String(fromChainId);
      let outputMode: 'vault' | 'address' = 'address';
      let outputPrecommitment: string | undefined;
      if (isSameChainSwap && outToken) {
        const out = await createVaultOutputNote(fromChainId, outToken);
        outputMode = 'vault';
        outputPrecommitment = out.precommitment;
        addLog(`Vault-output note prepared (stays private in ${(assetOut || '').toUpperCase()} vault)`);
      }

      addLog('Building strategy payload...');
      const strategyPayload = {
        user_id: recipient,
        strategy_type: bounds.strategy_type,
        asset_in: assetIn || "USDC",
        asset_out: assetOut,
        amount: effectiveAmount,
        upper_bound: bounds.upper_bound,
        lower_bound: bounds.lower_bound,
        recipient_address: recipient,
        ...(bounds.grid_levels != null ? { grid_levels: bounds.grid_levels } : {}),
        ...(bounds.slices != null ? { slices: bounds.slices } : {}),
        ...(bounds.interval_sec != null ? { interval_sec: bounds.interval_sec } : {}),
        ...(bounds.start_delay_sec != null && bounds.start_delay_sec > 0
          ? { start_delay_sec: bounds.start_delay_sec }
          : {}),
        ...(bounds.max_slippage_bps != null ? { max_slippage_bps: bounds.max_slippage_bps } : {}),
        from_chain: String(fromChainId),
        to_chain: String(toChainId ?? fromChainId),
        output_mode: outputMode,
        output_precommitment: outputPrecommitment,
        zk_proof: {
          pA: withdrawalTxData.pA,
          pB: withdrawalTxData.pB,
          pC: withdrawalTxData.pC,
          nullifierHash: withdrawalTxData.nullifierHash,
          newCommitment: withdrawalTxData.newCommitment,
          stateRoot: withdrawalTxData.stateRoot,
        }
      };

      addLog('Encrypting bounds client-side and submitting...');
      const result = await submitEncryptedStrategy(strategyPayload, {
        onKeygen:    () => addLog('Generating FHE keys (one-time, ~5s)...'),
        onUploadKey: () => addLog('Uploading FHE server key (one-time)...'),
        onUploadClientKey: () => addLog('Sending client key to confidential VM (decrypt only there)...'),
        onEncrypt:   () => addLog('Encrypting price bounds locally...'),
      });

      if (result.success) {
        addLog(
          plan.isScheduled
            ? 'Strategy registered! Scheduler will run on cadence...'
            : 'Strategy registered! Waiting for price trigger...'
        );

        if (newDeposit && newDepositKey) {
          localStorage.setItem(newDepositKey, JSON.stringify({ ...newDeposit, spent: false }));
        }

        if (runningStrategies && setRunningStrategies) {
          const newRunning = new Map(runningStrategies);
          newRunning.set(selectedStrategy.name, {
            startTime: Date.now(),
            isRunning: true,
            loop: plan.isScheduled,
          });
          setRunningStrategies(newRunning);
        }

        // Strategy is registered with the trade-executor, which evaluates and executes it
        // server-side. No local FHE decryption / browser authorization needed.
        const strategyId = String(result.data?.strategy_id ?? result.data?.payload_id ?? '');
        if (strategyId) {
          addLog('Strategy registered — it will execute server-side when the price triggers.');
          window.dispatchEvent(
            new CustomEvent('siphon:strategySubmitted', { detail: { strategyId, userId: recipient } }),
          );
          if (spentDepositKey) { try { localStorage.removeItem(spentDepositKey); } catch {} }
        }
        showToast('Strategy registered! Track it under Runs.', 'success');

        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
        setIsExecuting(false);
        setExecutionLogs([]);
        handleClose();
      } else {
        addLog(`Error: ${result.error}`);
        showToast(
          `Strategy generation failed: ${(result.error ?? 'Unknown error').slice(0, 200)}`,
          'error',
        );
        setIsExecuting(false);
        setTimeout(() => setExecutionLogs([]), 3000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      addLog(`Execution failed: ${errorMessage}`);
      showToast(`An error occurred: ${errorMessage}`, 'error');
      setIsExecuting(false);
      setTimeout(() => setExecutionLogs([]), 3000);
    } finally {
      setIsFading(false);
    }
  };

  const handleEdit = () => {
    if (modalStrategyNodes.length > 0 && modalStrategyEdges.length > 0) {
      setNodes(modalStrategyNodes as Node[]);
      setEdges(modalStrategyEdges as Edge[]);
      setCurrentFileName(`${selectedStrategy.name}.io`);
      setViewMode('blueprint');
      handleClose();

      const existingScene = savedScenes.find(s => s.name === selectedStrategy.name);
      if (!existingScene) {
        const newScene = {
          name: selectedStrategy.name,
          nodes: modalStrategyNodes as Node[],
          edges: modalStrategyEdges as Edge[]
        };
        const updatedScenes = [...savedScenes, newScene];
        setSavedScenes(updatedScenes);
        localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
      }
      return;
    }

    showToast('No graph loaded for this strategy yet.', 'error');
  };

  const handleSave = () => {
    const discoverStrategiesKey = 'siphon-discover-strategies';
    const stored = localStorage.getItem(discoverStrategiesKey);
    if (stored) {
      try {
        const strategiesData = JSON.parse(stored);
        const strategyData = strategiesData[selectedStrategy.name];
        if (strategyData) {
          const savedStrategy = {
            ...strategyData,
            runValues: runModeValues
          };
          strategiesData[selectedStrategy.name] = savedStrategy;
          localStorage.setItem(discoverStrategiesKey, JSON.stringify(strategiesData));
          console.log('Strategy saved with run values');
          handleClose();
        }
      } catch (error) {
        console.error('Failed to save strategy:', error);
      }
    }
  };

  // Get the latest log message for the central notification
  const latestLog = executionLogs.length > 0 ? executionLogs[executionLogs.length - 1] : null;
  const notificationMessage = toast?.message || latestLog || '';
  const notificationType = toast?.type || (isExecuting ? 'loading' : 'info');

  return createPortal(
    <>
      {(isExecuting || toast) && (
        <div className={`strategy-toast strategy-toast-${notificationType} strategy-toast-central ${isFadingOut ? 'fade-out' : ''}`}>
            <div className="strategy-toast-content">
              {notificationType === 'loading' && (
                <div className="strategy-toast-loader">
                  <div className="strategy-toast-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              <div className="strategy-toast-message">{notificationMessage}</div>
            </div>
        </div>
      )}
      {fromBuilder ? (
        <div
          className={`builder-run-overlay${isExecuting ? " builder-run-overlay--dark" : ""}`}
          onClick={handleClose}
          role="presentation"
        >
          <article
            className="builder-run-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="builder-run-title"
          >
            <header className="builder-run-card-header">
              <button
                className="builder-run-close"
                onClick={handleClose}
                aria-label="Close"
                type="button"
                disabled={isExecuting}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className="builder-run-card-heading">
                <p className="builder-run-receipt-eyebrow">Execution summary</p>
                <h2 className="builder-run-receipt-title" id="builder-run-title">
                  {selectedStrategy.name}
                </h2>
                {selectedStrategy.author && (
                  <p className="builder-run-receipt-author">by {selectedStrategy.author}</p>
                )}
              </div>
            </header>

            <div className="builder-run-card-body">
              <div className="builder-run-receipt-io">
                  <div className="builder-run-receipt-io-col">
                    <span className="builder-run-receipt-io-label">You Send</span>
                    <span className="builder-run-receipt-io-amount">
                      {pricesLoaded ? formatAmount(runSummary.inputAmount, runSummary.inputCoin) : "…"}
                    </span>
                    <span className="builder-run-receipt-io-coin">{runSummary.inputCoin}</span>
                    <span className="builder-run-receipt-io-usd">
                      {pricesLoaded ? formatUsd(runSummary.inputUsd) : "…"}
                    </span>
                  </div>
                  <span className="builder-run-receipt-io-arrow" aria-hidden>
                    →
                  </span>
                  <div className="builder-run-receipt-io-col builder-run-receipt-io-col--receive">
                    <span className="builder-run-receipt-io-label">You receive (est.)</span>
                    <span className="builder-run-receipt-io-amount builder-run-receipt-io-amount--estimate">
                      <span className="builder-run-receipt-io-circa" aria-hidden>≈</span>
                      {pricesLoaded ? formatAmount(runSummary.outputAmount, runSummary.outputCoin) : "…"}
                    </span>
                    <span className="builder-run-receipt-io-coin">{runSummary.outputCoin}</span>
                    <span className="builder-run-receipt-io-usd">
                      {pricesLoaded ? formatUsd(runSummary.outputUsd) : "…"}
                    </span>
                  </div>
                </div>

                <div className="builder-run-stats-grid">
                  <div className="builder-run-stat">
                    <span className="builder-run-stat-label">Strategy</span>
                    <span className="builder-run-stat-value">{runSummary.strategyKind}</span>
                  </div>
                  <div className="builder-run-stat">
                    <span className="builder-run-stat-label">Chain</span>
                    <span className="builder-run-stat-value">{runSummary.depositChain}</span>
                  </div>
                  <div className="builder-run-stat">
                    <span className="builder-run-stat-label">Steps</span>
                    <span className="builder-run-stat-value">{runSummary.stepCount}</span>
                  </div>
                  <div className="builder-run-stat">
                    <span className="builder-run-stat-label">Exec time</span>
                    <span className="builder-run-stat-value">{executionTime}s</span>
                  </div>
                </div>

                {runSummary.stepCount > 0 && (
                  <div className="builder-run-receipt-steps-wrap">
                    <button
                      type="button"
                      className="builder-run-receipt-steps-toggle"
                      onClick={() => setBuilderStepsOpen((open) => !open)}
                      aria-expanded={builderStepsOpen}
                    >
                      {builderStepsOpen ? "Hide steps" : "Review steps"}
                      <span className="builder-run-receipt-steps-count">
                        ({runSummary.stepCount})
                      </span>
                    </button>
                    {builderStepsOpen && (
                      <div className="builder-run-steps-panel">
                        {renderEditableRunSteps()}
                      </div>
                    )}
                  </div>
                )}

                <div className="builder-run-receipt-divider" aria-hidden />

                <p className="builder-run-costs-heading">Cost review</p>
                <dl className="builder-run-receipt-costs">
                  <div className="builder-run-receipt-cost-row">
                    <dt>Base fee (min)</dt>
                    <dd>${baseFee.toFixed(2)}</dd>
                  </div>
                  <div className="builder-run-receipt-cost-row">
                    <dt>Hourly fee (${FEE.PER_HOUR_ARM_USD.toFixed(2)} × {runDurationHours}h)</dt>
                    <dd>${hourlyFee.toFixed(2)}</dd>
                  </div>
                  <div className="builder-run-receipt-cost-row">
                    <dt>Execution window</dt>
                    <dd>
                      <select
                        className="builder-run-receipt-duration"
                        value={runDuration}
                        onChange={(e) => setRunDuration(e.target.value)}
                        aria-label="Execution window"
                      >
                        <option value="1h">1 hour</option>
                        <option value="2h">2 hours</option>
                        <option value="3h">3 hours</option>
                        <option value="6h">6 hours</option>
                        <option value="12h">12 hours</option>
                        <option value="24h">24 hours</option>
                        <option value="2d">2 days</option>
                        <option value="3d">3 days</option>
                        <option value="7d">7 days</option>
                        <option value="14d">14 days</option>
                        <option value="30d">30 days</option>
                        <option value="60d">60 days</option>
                        <option value="90d">90 days</option>
                        <option value="180d">180 days</option>
                        <option value="365d">365 days</option>
                      </select>
                    </dd>
                  </div>
                  <div className="builder-run-receipt-cost-row">
                    <dt>Arming fee (upfront, non-refundable)</dt>
                    <dd>
                      ${totalCost.toFixed(2)} USD
                      <span className="builder-run-receipt-cost-sub">
                        ≈ {(totalCost / ethUsd).toFixed(6)} ETH
                      </span>
                    </dd>
                  </div>
                  <div className="builder-run-receipt-cost-row">
                    <dt>Execution fee (per fill)</dt>
                    <dd>
                      {(FEE.EXEC_BPS / 100).toFixed(2)}% of trade
                      <span className="builder-run-receipt-cost-sub">
                        min ${FEE.MIN_EXEC_USD.toFixed(2)} + ${FEE.GAS_REIMBURSE_USD.toFixed(2)} gas · taken from each leg
                      </span>
                    </dd>
                  </div>
                  <div className="builder-run-receipt-cost-row">
                    <dt>Settlement</dt>
                    <dd>Private vault note</dd>
                  </div>
                </dl>
            </div>

            <div className={`builder-run-actions ${isFading ? "fade-out" : "fade-in"}`}>
              <button
                className={`builder-run-submit ${!isWalletConnected ? "builder-run-submit--disabled" : ""}`}
                onClick={handleExecute}
                disabled={isExecuting}
                type="button"
              >
                {isExecuting ? "Processing…" : !isWalletConnected ? "Connect wallet" : "Pay & run"}
              </button>
            </div>
          </article>
        </div>
      ) : (
      <div
        className={`strategy-modal-overlay ${isExecuting ? "darkened" : ""}`}
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="strategy-modal-title"
      >
        <div className="strategy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="strategy-modal-header">
          <div className="strategy-modal-header-name">
            <h2 className="strategy-modal-title" id="strategy-modal-title">{selectedStrategy.name}</h2>
            <p className="strategy-modal-author">by {selectedStrategy.author}</p>
            <ChainToggle className="strategy-modal-categories" />
          </div>
          <button 
            className="strategy-modal-close"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="strategy-modal-content">
          {isRunMode ? (
            <React.Fragment>
              <div className="strategy-modal-info">
                {/* Input/Output Section for Run Mode */}
                {(() => {
                  const depositNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'deposit');
                  const swapNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'swap');
                  
                  const depositStepId = depositNodes.length > 0 ? depositNodes[0].id : null;
                  const depositData = depositNodes.length > 0 ? (depositNodes[0].data as NodeData) : undefined;
                  const inputCoin =
                    getRunStepFieldValue(runModeValues, depositStepId || '', 'tokenA', depositData || {}) ||
                    'USDC';

                  const swapStepId = swapNodes.length > 0 ? swapNodes[0].id : null;
                  const swapData = swapNodes.length > 0 ? (swapNodes[0].data as NodeData) : undefined;
                  const outputCoin =
                    getRunStepFieldValue(runModeValues, swapStepId || '', 'coinB', swapData || {}) ||
                    inputCoin;

                  const inputAmount = parseFloat(
                    getRunStepFieldValue(runModeValues, depositStepId || '', 'amount', depositData || {}) || '0'
                  ) || 0;
                  
                  const outputAmountNum = calculateNetReceiveEstimate(
                    inputAmount,
                    inputCoin || "USDC",
                    outputCoin || inputCoin || "USDC",
                    coinPrices,
                    estimateSlippagePct,
                    totalCost,
                  );
                  
                  const formattedInputAmount = formatAmount(inputAmount, inputCoin);
                  const formattedOutputAmount = formatAmount(outputAmountNum, outputCoin || inputCoin);
                  
                  return (
                    <div className="strategy-modal-io-section">
                      <div className="strategy-modal-io-content">
                        <div className="strategy-modal-io-inputs">
                          <div className="strategy-modal-io-title">Input</div>
                          <div className="strategy-modal-io-items">
                            <div className="strategy-modal-io-item">
                              <span className="strategy-modal-io-coin">{inputCoin}</span>
                              <span className="strategy-modal-io-amount">{formattedInputAmount}</span>
                            </div>
                          </div>
                        </div>
                        <div className="strategy-modal-io-arrow">→</div>
                        <div className="strategy-modal-io-outputs">
                          <div className="strategy-modal-io-title">Output (est.)</div>
                          <div className="strategy-modal-io-items">
                            <div className="strategy-modal-io-item">
                              <span className="strategy-modal-io-coin">{outputCoin}</span>
                              <span className="strategy-modal-io-amount">{formattedOutputAmount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Steps Section for Run Mode */}
                <div className="strategy-modal-steps-section">
                  <div className="strategy-modal-steps-header">
                    <span className="strategy-modal-steps-label">Steps ({displayStepNodes.length})</span>
                  </div>
                  {displayStepNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {displayStepNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        
                        const tags = getStepTags(nodeData, true);
                        
                        const stepId = node.id;
                        
                        const handleMyWallet = () => {
                          const walletAddress = resolveWalletAddress();
                          
                          if (walletAddress) {
                            setRunModeValues(prev => ({
                              ...prev,
                              [stepId]: {
                                ...prev[stepId],
                                address: walletAddress
                              }
                            }));
                            showToast('Wallet address filled successfully', 'success');
                          } else {
                            showToast('No wallet connected. Please connect a wallet first.', 'error');
                          }
                        };
                        
                        return (
                          <div key={node.id} className="strategy-step-item">
                            <div className="strategy-step-number">{index + 1}</div>
                            <div className="strategy-step-content">
                              <div className="strategy-step-title">{nodeData?.label || `Step ${index + 1}`}</div>
                              {getStepHint(nodeData, strategyCoin) && (
                                <div className="strategy-step-hint">{getStepHint(nodeData, strategyCoin)}</div>
                              )}
                              <div className="strategy-step-details">
                                {tags.map((tag, idx) => (
                                    <div key={idx} className="strategy-step-input-wrapper">
                                      {tag.readOnly ? (
                                        <div className="strategy-step-readonly" title="Determined by the swap output">
                                          <span className="strategy-step-readonly-label">{tag.label}</span>
                                          <span className="strategy-step-readonly-value">{tag.value}</span>
                                        </div>
                                      ) : tag.options ? (
                                        <select
                                          className="strategy-step-select"
                                          value={getRunStepFieldValue(runModeValues, stepId, tag.field, nodeData)}
                                          onChange={(e) => {
                                            setRunModeValues(prev => ({
                                              ...prev,
                                              [stepId]: {
                                                ...prev[stepId],
                                                [tag.field]: e.target.value
                                              }
                                            }));
                                          }}
                                        >
                                          <option value="">{tag.label}</option>
                                          {tag.field === 'repeatMode' ? (
                                            <>
                                              <option value="until_funds">Until funds end</option>
                                              <option value="count">N times</option>
                                            </>
                                          ) : (
                                            tag.options.map(opt => (
                                              <option key={opt} value={opt}>{opt}</option>
                                            ))
                                          )}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          className="strategy-step-input"
                                          placeholder={tag.label}
                                          // Once the user has touched this field, honour their value verbatim —
                                          // including empty — so backspacing to clear doesn't snap back to the
                                          // template default. Only fall back to the default before any edit.
                                          value={
                                            runModeValues[stepId]?.[tag.field] ??
                                            getRunStepFieldValue(runModeValues, stepId, tag.field, nodeData)
                                          }
                                          onChange={(e) => {
                                            setRunModeValues(prev => ({
                                              ...prev,
                                              [stepId]: {
                                                ...prev[stepId],
                                                [tag.field]: e.target.value
                                              }
                                            }));
                                          }}
                                        />
                                      )}
                                    </div>
                                  ))}
                                {nodeData?.type === 'withdraw' && (
                                  <button
                                    className="strategy-step-my-wallet-btn"
                                    onClick={handleMyWallet}
                                    type="button"
                                  >
                                    My Wallet
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className={`strategy-modal-aside${isRunMode ? ' strategy-modal-aside--run-only' : ''}`}>
              {/* Run Configuration Panel */}
              <div className={`strategy-modal-run-config ${isFading ? 'fade-out' : 'fade-in'} ${isExecuting ? 'darkened' : ''}`}>
                <h3 className="strategy-run-config-title">Run Configuration</h3>
                
                <div className="strategy-run-stats">
                  <div className="strategy-run-stat-item">
                    <span className="strategy-run-stat-label">Execution Time</span>
                    <span className="strategy-run-stat-value">{executionTime} seconds</span>
                  </div>
                  <div className="strategy-run-stat-item">
                    <span className="strategy-run-stat-label">Execution Window</span>
                    <span className="strategy-run-stat-value">
                      <select
                        className="strategy-run-duration-select-inline"
                        value={runDuration}
                        onChange={(e) => setRunDuration(e.target.value)}
                      >
                        <option value="1h">1 hour</option>
                        <option value="2h">2 hours</option>
                        <option value="3h">3 hours</option>
                        <option value="6h">6 hours</option>
                        <option value="12h">12 hours</option>
                        <option value="24h">24 hours</option>
                        <option value="2d">2 days</option>
                        <option value="3d">3 days</option>
                        <option value="7d">7 days</option>
                        <option value="14d">14 days</option>
                        <option value="30d">30 days</option>
                        <option value="60d">60 days</option>
                        <option value="90d">90 days</option>
                        <option value="180d">180 days</option>
                        <option value="365d">365 days (1 year)</option>
                      </select>
                    </span>
                  </div>
                  <div className="strategy-run-stat-item">
                    <span className="strategy-run-stat-label">Run Fee</span>
                    <span className="strategy-run-stat-value">
                      ${totalCost.toFixed(4)} USD / {(totalCost / (coinPrices['ETH'] || 3000)).toFixed(6)} ETH
                    </span>
                  </div>
                  <div className="strategy-run-stat-item">
                    <span className="strategy-run-stat-label">Deposit Used</span>
                    <span className="strategy-run-stat-value">
                      {(() => {
                        const depositNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'deposit');
                        const depositStepId = depositNodes.length > 0 ? depositNodes[0].id : null;
                        const depositData = depositNodes.length > 0 ? (depositNodes[0].data as NodeData) : undefined;
                        const inputAmount = getRunStepFieldValue(runModeValues, depositStepId || '', 'amount', depositData || {}) || '0';
                        const inputCoinLocal = getRunStepFieldValue(runModeValues, depositStepId || '', 'tokenA', depositData || {}) || 'USDC';
                        const inputAmountNum = parseFloat(inputAmount) || 0;
                        const formattedInputAmount = formatAmount(inputAmountNum, inputCoinLocal);
                        return `${formattedInputAmount} ${inputCoinLocal}`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="strategy-modal-info">
                <div className="strategy-modal-categories">
                  {(() => {
                    const allChains = new Map<string, { name: string; isActive: boolean }>();
                    
                    selectedStrategy.chains.forEach((chain: string) => {
                      const normalized = chain.toLowerCase();
                      if (!allChains.has(normalized)) {
                        const isActive = selectedStrategy.name === 'Limit Order' 
                          ? normalized === 'base' 
                          : false;
                        allChains.set(normalized, {
                          name: chain.charAt(0).toUpperCase() + chain.slice(1),
                          isActive
                        });
                      }
                    });
                    
                    selectedStrategy.networks.forEach((network: string) => {
                      const normalized = network.toLowerCase();
                      if (!allChains.has(normalized)) {
                        const isActive = selectedStrategy.name === 'Limit Order' 
                          ? normalized === 'base' 
                          : false;
                        allChains.set(normalized, {
                          name: network,
                          isActive
                        });
                      } else {
                        const existing = allChains.get(normalized)!;
                        if (selectedStrategy.name === 'Limit Order') {
                          existing.isActive = normalized === 'base';
                        }
                      }
                    });
                    
                    const sortedChains = Array.from(allChains.values()).sort((a, b) => {
                      if (a.isActive && !b.isActive) return -1;
                      if (!a.isActive && b.isActive) return 1;
                      return 0;
                    });
                    
                    return sortedChains.map((chain, idx) => (
                      <span 
                        key={idx} 
                        className={`strategy-modal-category-badge ${!chain.isActive ? 'inactive' : ''}`}
                      >
                        {chain.name}
                      </span>
                    ));
                  })()}
                </div>
                <p className="strategy-modal-description">{selectedStrategy.description}</p>
                
                {/* Input/Output Section */}
                {modalStrategyNodes.length > 0 && (() => {
                  const depositNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'deposit');
                  const strategyNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'strategy');
                  
                  const inputCoin = depositNodes.length > 0 && (depositNodes[0].data as NodeData)?.coin 
                    ? (depositNodes[0].data as NodeData).coin 
                    : 'USDC';
                  
                  return (
                    <div className="strategy-modal-io-section">
                      <div className="strategy-modal-io-content">
                        <div className="strategy-modal-io-inputs">
                          <div className="strategy-modal-io-title">Input</div>
                          <div className="strategy-modal-io-items">
                            <div className="strategy-modal-io-item">
                              <span className="strategy-modal-io-coin">Coin A</span>
                            </div>
                          </div>
                        </div>
                        <div className="strategy-modal-io-arrow">→</div>
                        <div className="strategy-modal-io-outputs">
                          <div className="strategy-modal-io-title">Output</div>
                          <div className="strategy-modal-io-items">
                            <div className="strategy-modal-io-item">
                              <span className="strategy-modal-io-coin">Token B</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                <div className="strategy-modal-steps-section">
                  <div className="strategy-modal-steps-header">
                    <span className="strategy-modal-steps-label">Steps ({displayStepNodes.length})</span>
                  </div>
                  {displayStepNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {displayStepNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        
                        const tags = getStepTags(nodeData, false);
                        
                        return (
                          <div key={node.id} className="strategy-step-item">
                            <div className="strategy-step-number">{index + 1}</div>
                            <div className="strategy-step-content">
                              <div className="strategy-step-title">{nodeData?.label || `Step ${index + 1}`}</div>
                              {getStepHint(nodeData, strategyCoin) && (
                                <div className="strategy-step-hint">{getStepHint(nodeData, strategyCoin)}</div>
                              )}
                              <div className="strategy-step-details">
                                {tags.map((tag, idx) => (
                                  <span key={idx} className={`strategy-step-tag strategy-step-${tag.label.toLowerCase().replace(/\s+/g, '-')}`}>
                                    {tag.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="strategy-modal-preview">
                <h3 className="strategy-preview-title">Strategy Preview</h3>
                <div className="strategy-preview-flow">
                  <StrategyPreviewFlow
                    nodes={modalStrategyNodes}
                    edges={modalStrategyEdges}
                    flowKey={flowKey}
                    isLoading={isFlowLoading}
                  />
                </div>
              </div>
            </React.Fragment>
          )}
        </div>
        
        <div className={`strategy-modal-actions ${isFading ? 'fade-out' : 'fade-in'}`}>
          <button 
            className={`strategy-modal-btn strategy-modal-btn-run ${!isWalletConnected ? 'disabled' : ''}`}
            onClick={handleExecute}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeLinecap="round" />
              </svg>
            ) : !isWalletConnected ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12v-2a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v2" />
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {isExecuting ? 'Processing...' : (!isWalletConnected ? 'Connect Wallet' : (isRunMode ? 'Pay & Run' : 'Run'))}
          </button>
          <button 
            className="strategy-modal-btn strategy-modal-btn-edit"
            onClick={handleEdit}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          <button 
            className="strategy-modal-btn strategy-modal-btn-save"
            onClick={handleSave}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>
        </div>
        </div>
      </div>
      )}
    </>,
    document.body
  );
}
