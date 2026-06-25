"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Node, Edge } from '@xyflow/react';
import "./Discover.css";
import StrategyPreviewFlow from "../Builder/StrategyPreviewFlow";
import { getModalStepNodes } from "../../../lib/builderLayout";
import { getRunStepFieldValue } from "../../../lib/runModeValues";
import { buildGraphRunPlan } from "../../../lib/graphRunPlan";
import { submitEncryptedStrategy } from "../../../lib/strategySubmit";
import { generateZKData } from "../../../lib/zkHandler";
import { walletManager } from "../../extensions/walletManager";
import { payExecutionFee } from "../../../lib/handler";
import { getSelectedChainId, getTokens, getNetwork } from "../../../lib/networks";
import ChainToggle from "../../ChainToggle";
import { formatAmount as formatAmountUtil, calculateExchange as calculateExchangeUtil, fetchCoinPrices, calculateVariableCost, calculateFixedCost, getTransactionOutputForCost } from "./price_utils";
import StrategyChart, { type ChartOverlay } from "../../charts/StrategyChart";
import "../../charts/charts.css";


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
      return 'Where the swap output is sent — destination chain + address.';
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

  const stepNodes = useMemo(
    () => getModalStepNodes(modalStrategyNodes, modalStrategyEdges),
    [modalStrategyNodes, modalStrategyEdges]
  );

  // Derive a chart asset + strategy overlays (target price line, range band)
  // from the strategy's nodes so the chart reflects what the user is building.
  const chartConfig = useMemo(() => {
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
    const coin = (candidates.find((c) => VOLATILE.includes(c.toUpperCase())) || 'ETH').toUpperCase();

    const overlays: ChartOverlay[] = [];
    for (const n of modalStrategyNodes) {
      const d = n.data as NodeData;
      if (d?.type !== 'strategy') continue;
      const kind = d.strategy || '';
      if (kind === 'Limit Order' || kind === 'Take Profit') {
        const p = parseFloat(field(n, 'priceGoal') || '');
        if (isFinite(p)) overlays.push({ kind: 'line', price: p, color: '#26a69a', title: kind });
      } else if (kind === 'Stop Loss') {
        const p = parseFloat(field(n, 'priceGoal') || '');
        if (isFinite(p)) overlays.push({ kind: 'line', price: p, color: '#ef5350', title: 'Stop' });
      } else if (kind === 'Range') {
        const lo = parseFloat(field(n, 'rangeLow') || '');
        const hi = parseFloat(field(n, 'rangeHigh') || '');
        overlays.push({
          kind: 'band',
          low: isFinite(lo) ? lo : undefined,
          high: isFinite(hi) ? hi : undefined,
          color: '#5b8def',
          title: 'Range',
        });
      }
    }
    return { coin, overlays };
  }, [modalStrategyNodes, runModeValues]);

  const getStepTags = (nodeData: NodeData, isRunModeView: boolean): StepTag[] => {
    const tags: StepTag[] = [];
    if (nodeData?.type === 'deposit') {
      tags.push({ label: 'Chain', field: 'chain', options: isRunModeView ? ['Sepolia'] : undefined });
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
      tags.push({ label: 'Chain', field: 'chain', options: isRunModeView ? ['Sepolia'] : undefined });
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

  // Fetch prices only when entering Run mode (not on plain details open)
  useEffect(() => {
    if (isOpen && isRunMode && !pricesLoaded) {
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
  }, [isOpen, isRunMode, pricesLoaded]);

  // Reset prices when modal closes or when exiting Run mode
  useEffect(() => {
    if (!isOpen || !isRunMode) {
      setPricesLoaded(false);
      setCoinPrices({});
    }
  }, [isOpen, isRunMode]);

  // Check wallet connection status
  useEffect(() => {
    const checkWalletConnection = () => {
      const wallets = walletManager.getConnectedWallets();
      const hasConnectedWallet = wallets.length > 0;
      
      // Also check localStorage as fallback
      if (!hasConnectedWallet) {
        try {
          const storedWallet = localStorage.getItem('siphon-connected-wallet');
          if (storedWallet) {
            const wallet = JSON.parse(storedWallet);
            if (wallet && wallet.address) {
              setIsWalletConnected(true);
              return;
            }
          }
        } catch (error) {
          console.error('Error reading wallet from localStorage:', error);
        }
      }
      
      setIsWalletConnected(hasConnectedWallet);
    };

    // Check on mount and when modal opens
    checkWalletConnection();

    // Listen for wallet connection/disconnection events
    const handleWalletConnected = () => {
      setIsWalletConnected(true);
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

  const formatAmount = (amount: number, coin?: string): string => {
    return formatAmountUtil(amount, coin);
  };

  // Calculate costs using fetched prices (only when prices are loaded)
  const transactionOutputUSD = pricesLoaded ? getTransactionOutputForCost(
    modalStrategyNodes,
    runModeValues,
    coinPrices,
    calculateExchangeUtil
  ) : 0;
  const executionTime = 2; // Fixed execution time
  const variableCost = calculateVariableCost(runDuration);
  const fixedCost = calculateFixedCost(transactionOutputUSD);
  const totalCost = variableCost + fixedCost;

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

  if (!isOpen) return null;

  const handleClose = () => {
    setIsRunMode(false);
    setRunModeValues({});
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
        setRunModeValues({});
        setIsFading(false);
      }, 200);
      return;
    }

    setIsExecuting(true);
    setExecutionLogs([]);
    addLog('Starting strategy execution...');

    const depositNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'deposit');
    const swapNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'swap');
    const withdrawNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'withdraw');

    const runPlan = buildGraphRunPlan(modalStrategyNodes, modalStrategyEdges, runModeValues);
    if (!runPlan.ok) {
      showToast(runPlan.error, 'error');
      setIsExecuting(false);
      return;
    }

    const { plan } = runPlan;
    const { assetIn, assetOut, amount, recipient, payload: bounds } = plan;

    const getValue = (nodeId: string | undefined, field: string, defaultVal: string = '') => {
      if (!nodeId) return defaultVal;
      if (runModeValues[nodeId] && runModeValues[nodeId][field]) {
        return runModeValues[nodeId][field];
      }
      const node = modalStrategyNodes.find(n => n.id === nodeId);
      return (node?.data as NodeData)?.[field] || defaultVal;
    };

    const amountStr = getValue(depositNode?.id, 'amount', String(amount));

    setIsFading(true);

    try {
      addLog('Scanning deposits...');
      
      // Small delay to show the scanning message
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const tokenMap = getTokens(activeChainId);
      const tokenInfo = tokenMap[(assetIn || 'USDC').toUpperCase()];
      if (!tokenInfo) throw new Error(`Token ${assetIn} not supported for ZK operations`);

      // Generate ZK proof for strategy execution using full deposit amount
      addLog(`Generating ZK proof on ${getNetwork(activeChainId).name}...`);
      const zkResult = await generateZKData(
        activeChainId,
        tokenInfo,
        amountStr,
        recipient
      );

      if ('error' in zkResult) {
        throw new Error(zkResult.error);
      }

      addLog('ZK proof generated');
      const { withdrawalTxData, newDeposit, newDepositKey, spentDepositKey } = zkResult;

      addLog('Building strategy payload...');
      const strategyPayload = {
        user_id: recipient,
        strategy_type: bounds.strategy_type,
        asset_in: assetIn || "USDC",
        asset_out: assetOut,
        amount,
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
        from_chain: String(activeChainId),
        to_chain: String(activeChainId),
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

  return (
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
      <div
        className={`strategy-modal-overlay ${isExecuting ? 'darkened' : ''}`}
        onClick={fromBuilder ? undefined : handleClose}
      >
        <div className="strategy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="strategy-modal-header">
          <div className="strategy-modal-header-name">
            <h2 className="strategy-modal-title">{selectedStrategy.name}</h2>
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
                  
                  const outputAmountNum = calculateExchange(
                    inputAmount, 
                    inputCoin || 'USDC', 
                    outputCoin || inputCoin || 'USDC'
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
                          <div className="strategy-modal-io-title">Output</div>
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
                    <span className="strategy-modal-steps-label">Steps ({stepNodes.length})</span>
                  </div>
                  {stepNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {stepNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        
                        const tags = getStepTags(nodeData, true);
                        
                        const stepId = node.id;
                        
                        const handleMyWallet = () => {
                          // Check both walletManager and localStorage for wallet connection
                          const primaryWallet = walletManager.getPrimaryWallet();
                          let walletAddress = primaryWallet?.address;
                          
                          // If not in walletManager, check localStorage
                          if (!walletAddress) {
                            try {
                              const storedWallet = localStorage.getItem('siphon-connected-wallet');
                              if (storedWallet) {
                                const wallet = JSON.parse(storedWallet);
                                walletAddress = wallet.address;
                              }
                            } catch (error) {
                              console.error('Error reading wallet from localStorage:', error);
                            }
                          }
                          
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
                              {getStepHint(nodeData, chartConfig.coin) && (
                                <div className="strategy-step-hint">{getStepHint(nodeData, chartConfig.coin)}</div>
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

              {/* Contextual price chart with the strategy's targets overlaid */}
              <div className="strategy-modal-chart">
                <div className="strategy-modal-chart-head">
                  <span className="strategy-modal-chart-pair">{chartConfig.coin} / USD</span>
                  {chartConfig.overlays.length > 0 && (
                    <span className="strategy-modal-chart-hint">targets overlaid</span>
                  )}
                </div>
                <div className="strategy-modal-chart-body">
                  <StrategyChart
                    key={chartConfig.coin}
                    coin={chartConfig.coin}
                    days={7}
                    overlays={chartConfig.overlays}
                    showLegend
                  />
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
                    <span className="strategy-modal-steps-label">Steps ({stepNodes.length})</span>
                  </div>
                  {stepNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {stepNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        
                        const tags = getStepTags(nodeData, false);
                        
                        return (
                          <div key={node.id} className="strategy-step-item">
                            <div className="strategy-step-number">{index + 1}</div>
                            <div className="strategy-step-content">
                              <div className="strategy-step-title">{nodeData?.label || `Step ${index + 1}`}</div>
                              {getStepHint(nodeData, chartConfig.coin) && (
                                <div className="strategy-step-hint">{getStepHint(nodeData, chartConfig.coin)}</div>
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
          {fromBuilder ? (
            <button
              className="strategy-modal-btn strategy-modal-btn-cancel"
              onClick={handleClose}
              type="button"
              disabled={isExecuting}
            >
              Cancel
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
