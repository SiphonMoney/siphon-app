"use client";

import React, { useRef, useState, useEffect } from "react";
import { ReactFlow, ReactFlowProvider, Background, Node, Edge, Handle, Position, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./Discover.css";
import { createStrategy } from "../../../lib/strategy";
import { generateZKData } from "../../../lib/zkHandler";
import { walletManager } from "../../../lib/walletManager";
import { payExecutionFee } from "../../../lib/handler";
import { formatAmount as formatAmountUtil, calculateExchange as calculateExchangeUtil, fetchCoinPrices, calculateVariableCost, calculateFixedCost, getTransactionOutputForCost } from "./price_utils";


interface NodeData {
  label?: string;
  type?: 'deposit' | 'swap' | 'withdraw' | 'strategy';
  coin?: string;
  toCoin?: string;
  amount?: string;
  strategy?: string;
  chain?: string;
  [key: string]: string | undefined;
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
  setShowSuccessNotification
}: DetailsModalProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [coinPrices, setCoinPrices] = useState<Record<string, number>>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'loading' } | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  // Fetch prices once when modal opens
  useEffect(() => {
    if (isOpen && !pricesLoaded) {
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
  }, [isOpen, pricesLoaded]);

  // Reset prices when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPricesLoaded(false);
      setCoinPrices({});
    }
  }, [isOpen]);

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
    const strategyNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'strategy');
    const swapNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'swap');
    const withdrawNode = modalStrategyNodes.find(n => (n.data as NodeData).type === 'withdraw');

    const getValue = (nodeId: string | undefined, field: string, defaultVal: string = '') => {
      if (!nodeId) return defaultVal;
      if (runModeValues[nodeId] && runModeValues[nodeId][field]) {
        return runModeValues[nodeId][field];
      }
      const node = modalStrategyNodes.find(n => n.id === nodeId);
      return (node?.data as NodeData)?.[field] || defaultVal;
    };

    const amountStr = getValue(depositNode?.id, 'amount', '0');
    const assetIn = getValue(depositNode?.id, 'tokenA', (depositNode?.data as NodeData)?.coin);
    const assetOut = getValue(swapNode?.id, 'coinB', (swapNode?.data as NodeData)?.toCoin) || 'ETH';
    const priceGoalStr = getValue(strategyNode?.id, 'priceGoal', '0');
    
    const recipient = getValue(withdrawNode?.id, 'address');

    const amount = parseFloat(amountStr);
    const targetPrice = parseFloat(priceGoalStr);

    if (amount <= 0) {
      showToast("Please enter a valid amount.", 'error');
      setIsExecuting(false);
      return;
    }
    if (targetPrice <= 0) {
      showToast("Please enter a valid Price Goal.", 'error');
      setIsExecuting(false);
      return;
    }

    setIsFading(true);

    try {
      addLog('Scanning deposits...');
      
      // Small delay to show the scanning message
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const tokenMap: Record<string, { symbol: string; decimals: number; address: string }> = {
        'ETH': { symbol: 'ETH', decimals: 18, address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" },
        'USDC': { symbol: 'USDC', decimals: 6, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" }
      };

      const tokenInfo = tokenMap[assetIn || 'USDC'];
      if (!tokenInfo) throw new Error(`Token ${assetIn} not supported for ZK operations`);

      // Calculate execution price in user's token
      addLog('Calculating execution price...');
      const tokenPrice = coinPrices[assetIn || 'USDC'] || (assetIn === 'ETH' ? 3000 : 1);
      const executionPriceInToken = totalCost / tokenPrice;
      
      if (executionPriceInToken <= 0) {
        throw new Error('Invalid execution price calculation');
      }

      // Round execution price to token's decimal places to avoid precision issues
      const executionPriceRounded = parseFloat(executionPriceInToken.toFixed(tokenInfo.decimals));
      const executionPriceStr = executionPriceRounded.toFixed(tokenInfo.decimals);

      addLog(`Execution price: ${executionPriceStr} ${assetIn} ($${totalCost.toFixed(2)})`);

      // Check if user has sufficient balance
      const userBalance = parseFloat(amountStr);
      if (userBalance < executionPriceRounded) {
        throw new Error(`Insufficient balance. Need ${executionPriceStr} ${assetIn}, have ${userBalance} ${assetIn}`);
      }

      const remainingBalance = userBalance - executionPriceRounded;
      const remainingBalanceStr = remainingBalance.toFixed(tokenInfo.decimals);
      addLog(`Balance check: ${userBalance} ${assetIn} - ${executionPriceStr} ${assetIn} = ${remainingBalanceStr} ${assetIn} remaining`);

      if (remainingBalance <= 0) {
        throw new Error('Insufficient balance remaining for strategy execution after fee payment');
      }

      // Step 1: Pay execution fee
      addLog('Paying execution fee...');
      const vaultContractAddress = "0x8Be4A7A074468F571271192A0A0824cf6F08a1f6"; // Corrected Entrypoint address
      
      // Generate ZK proof for fee payment (deducting execution price from commitment)
      const feeZkResult = await generateZKData(
        11155111,
        tokenInfo,
        executionPriceStr, // Fee amount in user's token (properly formatted)
        vaultContractAddress // Recipient is vault (we're updating commitment, not withdrawing)
      );

      if ('error' in feeZkResult) {
        throw new Error(`Fee payment proof generation failed: ${feeZkResult.error}`);
      }

      addLog('Fee payment proof generated');
      
      const feePaymentResult = await payExecutionFee(
        assetIn || 'USDC',
        executionPriceStr, // Execution price in user's token (properly formatted)
        executionPriceStr, // Amount for proof verification (must match the proof's withdrawnValue)
        feeZkResult.withdrawalTxData.stateRoot || "0",
        feeZkResult.withdrawalTxData.nullifierHash.toString(),
        feeZkResult.withdrawalTxData.newCommitment.toString(),
        feeZkResult.withdrawalTxData.proof
      );

      if (!feePaymentResult.success) {
        throw new Error(`Fee payment failed: ${feePaymentResult.error}`);
      }

      addLog(`✅ Fee payment successful! Transaction: ${feePaymentResult.transactionHash}`);

      // Save new commitment after fee payment to localStorage (so it can be used for strategy execution)
      if (feeZkResult.newDeposit && feeZkResult.newDepositKey) {
        localStorage.setItem(feeZkResult.newDepositKey, JSON.stringify({ ...feeZkResult.newDeposit, spent: false }));
        addLog('Saved new commitment after fee payment for strategy execution');
      }

      // Mark fee payment deposit as spent
      if (feeZkResult.spentDepositKey) {
        const feeOldData = JSON.parse(localStorage.getItem(feeZkResult.spentDepositKey) || '{}');
        feeOldData.spent = true;
        localStorage.setItem(feeZkResult.spentDepositKey, JSON.stringify(feeOldData));
      }

      // Step 2: Generate ZK proof for strategy execution with remaining balance
      // This will use the new commitment created after fee payment
      addLog('Generating strategy execution proof with remaining balance...');
      const zkResult = await generateZKData(
        11155111, 
        tokenInfo,
        remainingBalanceStr, // Use remaining balance after fee (properly formatted)
        vaultContractAddress
      );

      if ('error' in zkResult) {
        throw new Error(zkResult.error);
      }

      addLog('Strategy execution proof generated');
      const { withdrawalTxData, newDeposit, newDepositKey, spentDepositKey } = zkResult;

      addLog('Building strategy payload...');
      const strategyPayload = {
        user_id: "user_123",
        strategy_type: "LIMIT_ORDER",
        asset_in: assetIn || "USDC",
        asset_out: assetOut,
        amount: amount,
        upper_bound: targetPrice,
        lower_bound: 0.0,
        recipient_address: recipient,
        // This pool address needs to be dynamically determined based on asset_in, asset_out, and fee
        // For now, using a hardcoded WETH/USDC 0.05% pool on Sepolia
        pool_address: "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1",
        zk_proof: {
          proof: withdrawalTxData.proof,
          nullifierHash: withdrawalTxData.nullifierHash,
          newCommitment: withdrawalTxData.newCommitment,
          atomicAmount: withdrawalTxData.amount, // This is `_amountIn` for the `publicInputs`
          root: withdrawalTxData.stateRoot
        }
      };

      addLog('Sending payload to backend...');
      const result = await createStrategy(strategyPayload);

      if (result.success) {
        addLog('Payload received, processing execution...');
        addLog('Strategy execution completed!');
        showToast('Strategy execution completed!', 'success');

        // Handle strategy execution deposits (fee payment deposits already handled above)
        if (newDeposit && newDepositKey) {
            localStorage.setItem(newDepositKey, JSON.stringify({ ...newDeposit, spent: false }));
            addLog('Saved new commitment after strategy execution');
        }
        if (spentDepositKey) {
            const oldData = JSON.parse(localStorage.getItem(spentDepositKey) || '{}');
            oldData.spent = true;
            localStorage.setItem(spentDepositKey, JSON.stringify(oldData));
            addLog('Marked strategy execution deposit as spent');
        }

        addLog('Execution completed successfully!');
        setTimeout(() => {
          if (runningStrategies && setRunningStrategies) {
            const newRunning = new Map(runningStrategies);
            newRunning.set(selectedStrategy.name, { 
              startTime: Date.now(), 
              isRunning: true, 
              loop: false 
            });
            setRunningStrategies(newRunning);
          }
          setShowSuccessNotification(true);
          setTimeout(() => setShowSuccessNotification(false), 3000);
          setIsExecuting(false);
          setExecutionLogs([]);
          handleClose();
        }, 1500);
      } else {
        addLog(`Error: ${result.error}`);
        showToast(`Strategy generation failed: ${result.error}`, 'error');
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
    const discoverStrategiesKey = 'siphon-discover-strategies';
    const stored = localStorage.getItem(discoverStrategiesKey);
    if (stored) {
      try {
        const strategiesData = JSON.parse(stored);
        const strategyData = strategiesData[selectedStrategy.name];
        if (strategyData && strategyData.nodes && strategyData.edges) {
          setNodes(strategyData.nodes as Node[]);
          setEdges(strategyData.edges as Edge[]);
          setCurrentFileName(`${selectedStrategy.name}.io`);
          setViewMode('blueprint');
          handleClose();
          
          const existingScene = savedScenes.find(s => s.name === selectedStrategy.name);
          if (!existingScene) {
            const newScene = {
              name: selectedStrategy.name,
              nodes: strategyData.nodes as Node[],
              edges: strategyData.edges as Edge[]
            };
            const updatedScenes = [...savedScenes, newScene];
            setSavedScenes(updatedScenes);
            localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
          }
        }
      } catch (error) {
        console.error('Failed to load strategy for editing:', error);
      }
    }
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
      <div className={`strategy-modal-overlay ${isExecuting ? 'darkened' : ''}`} onClick={handleClose}>
        <div className="strategy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="strategy-modal-header">
          <div className="strategy-modal-header-name">
            <h2 className="strategy-modal-title">{selectedStrategy.name}</h2>
            <p className="strategy-modal-author">by {selectedStrategy.author}</p>
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
                  const depositStepValues = depositStepId ? runModeValues[depositStepId] || {} : {};
                  const inputCoin = depositStepValues['tokenA'] || (depositNodes.length > 0 && (depositNodes[0].data as NodeData)?.coin 
                    ? (depositNodes[0].data as NodeData).coin 
                    : 'USDC');
                  
                  const swapStepId = swapNodes.length > 0 ? swapNodes[0].id : null;
                  const swapStepValues = swapStepId ? runModeValues[swapStepId] || {} : {};
                  const outputCoin = swapStepValues['coinB'] || (swapNodes.length > 0 && (swapNodes[0].data as NodeData)?.toCoin
                    ? (swapNodes[0].data as NodeData).toCoin
                    : inputCoin);
                  
                  const inputAmount = parseFloat(depositStepValues['amount'] || '0') || 0;
                  
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
                    <span className="strategy-modal-steps-label">Steps ({selectedStrategy.nodes})</span>
                  </div>
                  {modalStrategyNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {modalStrategyNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        
                        const tags: Array<{ label: string; field: string; options?: string[] }> = [];
                        
                        if (nodeData?.type === 'deposit') {
                          tags.push({ label: 'Chain', field: 'chain', options: ['Sepolia'] });
                          tags.push({ label: 'Token A', field: 'tokenA', options: ['USDC', 'ETH'] });
                          tags.push({ label: 'Amount', field: 'amount' });
                        } else if (nodeData?.type === 'strategy' && nodeData.strategy === 'Limit Order') {
                          tags.push({ label: 'Type', field: 'type', options: ['Buy', 'Sell'] });
                          tags.push({ label: 'PriceGoal', field: 'priceGoal' });
                        } else if (nodeData?.type === 'swap') {
                          tags.push({ label: 'Dex Type', field: 'dexType', options: ['Uniswap'] });
                          tags.push({ label: 'Token B', field: 'coinB', options: ['ETH', 'USDC'] });
                        } else if (nodeData?.type === 'withdraw') {
                          tags.push({ label: 'Chain', field: 'chain', options: ['Sepolia'] });
                          tags.push({ label: 'Address', field: 'address' });
                        }
                        
                        const stepId = node.id;
                        const stepValues = runModeValues[stepId] || {};
                        
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
                              <div className="strategy-step-details">
                                {nodeData?.type === 'withdraw' ? (
                                  <div className="strategy-step-withdraw-row">
                                    <div className="strategy-step-input-wrapper">
                                      <select
                                        className="strategy-step-select"
                                        value={stepValues['chain'] || ''}
                                        onChange={(e) => {
                                          setRunModeValues(prev => ({
                                            ...prev,
                                            [stepId]: {
                                              ...prev[stepId],
                                              chain: e.target.value
                                            }
                                          }));
                                        }}
                                      >
                                        <option value="">Chain</option>
                                        <option value="Sepolia">Sepolia</option>
                                      </select>
                                    </div>
                                    <div className="strategy-step-input-wrapper">
                                      <input
                                        type="text"
                                        className="strategy-step-input"
                                        placeholder="Address"
                                        value={stepValues['address'] || ''}
                                        onChange={(e) => {
                                          setRunModeValues(prev => ({
                                            ...prev,
                                            [stepId]: {
                                              ...prev[stepId],
                                              address: e.target.value
                                            }
                                          }));
                                        }}
                                      />
                                    </div>
                                    <button
                                      className="strategy-step-my-wallet-btn"
                                      onClick={handleMyWallet}
                                      type="button"
                                    >
                                      My Wallet
                                    </button>
                                  </div>
                                ) : (
                                  tags.map((tag, idx) => (
                                    <div key={idx} className="strategy-step-input-wrapper">
                                      {tag.options ? (
                                        <select
                                          className="strategy-step-select"
                                          value={stepValues[tag.field] || ''}
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
                                          {tag.options.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          className="strategy-step-input"
                                          placeholder={tag.label}
                                          value={stepValues[tag.field] || ''}
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
                                  ))
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
                        const depositStepValues = depositStepId ? runModeValues[depositStepId] || {} : {};
                        const inputAmount = depositStepValues['amount'] || '0';
                        const inputCoinLocal = depositStepValues['tokenA'] || (depositNodes.length > 0 && (depositNodes[0].data as NodeData)?.coin 
                          ? (depositNodes[0].data as NodeData).coin 
                          : 'USDC');
                        const inputAmountNum = parseFloat(inputAmount) || 0;
                        const formattedInputAmount = formatAmount(inputAmountNum, inputCoinLocal);
                        return `${formattedInputAmount} ${inputCoinLocal}`;
                      })()}
                    </span>
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
                    <span className="strategy-modal-steps-label">Steps ({selectedStrategy.nodes})</span>
                  </div>
                  {modalStrategyNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {modalStrategyNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        
                        const tags: Array<{ label: string; field: string }> = [];
                        
                        if (nodeData?.type === 'deposit') {
                          tags.push({ label: 'Chain', field: 'chain' });
                          tags.push({ label: 'Token A', field: 'tokenA' });
                          tags.push({ label: 'Amount', field: 'amount' });
                        } else if (nodeData?.type === 'strategy' && nodeData.strategy === 'Limit Order') {
                          tags.push({ label: 'Type', field: 'type' });
                          tags.push({ label: 'PriceGoal', field: 'priceGoal' });
                        } else if (nodeData?.type === 'swap') {
                          tags.push({ label: 'Dex Type', field: 'dexType' });
                          tags.push({ label: 'Token B', field: 'coinB' });
                        } else if (nodeData?.type === 'withdraw') {
                          tags.push({ label: 'Chain', field: 'chain' });
                          tags.push({ label: 'Address', field: 'address' });
                        }
                        
                        return (
                          <div key={node.id} className="strategy-step-item">
                            <div className="strategy-step-number">{index + 1}</div>
                            <div className="strategy-step-content">
                              <div className="strategy-step-title">{nodeData?.label || `Step ${index + 1}`}</div>
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
                  {isFlowLoading ? (
                    <div className="strategy-preview-placeholder">
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <p>Loading strategy preview...</p>
                    </div>
                  ) : modalStrategyNodes.length > 0 ? (
                    <div ref={flowRef} style={{ width: '100%', height: '100%', minHeight: '240px', position: 'relative' }}>
                      <ReactFlowProvider key={flowKey}>
                        <ReactFlow
                          key={`flow-${flowKey}`}
                          nodes={modalStrategyNodes}
                          edges={modalStrategyEdges}
                          onInit={(instance) => {
                            reactFlowInstance.current = instance;
                            setTimeout(() => {
                              instance.fitView({ padding: 0.2, duration: 400 });
                            }, 100);
                          }}
                          nodeTypes={{
                            custom: ({ data }: { data: NodeData }) => {
                              const nodeData = data as NodeData;
                              const isStrategy = nodeData.type === 'strategy';
                              return (
                                <div 
                                  className={`blueprint-custom-node ${isStrategy ? 'strategy-node' : ''}`} 
                                  style={{ 
                                    position: 'relative',
                                    background: isStrategy ? 'rgba(255, 193, 7, 0.2)' : undefined,
                                    border: isStrategy ? '1px solid rgba(255, 193, 7, 0.5)' : undefined
                                  }}
                                >
                                  <Handle type="target" position={Position.Left} style={{ background: 'rgba(255, 255, 255, 0.3)' }} />
                                  <div className="node-content">
                                    <div className="node-title">{nodeData.label}</div>
                                    {nodeData.type === 'deposit' && nodeData.coin && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.coin} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.type === 'swap' && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.coin || 'From'} → {nodeData.toCoin || 'To'} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.type === 'withdraw' && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.coin || 'Coin'} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.type === 'strategy' && nodeData.strategy && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.strategy} {nodeData.coin ? `- ${nodeData.coin}` : ''} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.chain && (
                                      <div className="node-preview-info" style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
                                        {nodeData.chain}
                                      </div>
                                    )}
                                  </div>
                                  <Handle type="source" position={Position.Right} style={{ background: 'rgba(255, 255, 255, 0.3)' }} />
                                </div>
                              );
                            }
                          }}
                          defaultEdgeOptions={{
                            style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 },
                            type: 'smoothstep'
                          }}
                          fitView
                          minZoom={0.3}
                          maxZoom={1.5}
                          nodesDraggable={false}
                          nodesConnectable={false}
                          elementsSelectable={false}
                          panOnDrag={true}
                          zoomOnScroll={true}
                          zoomOnPinch={true}
                          proOptions={{ hideAttribution: true }}
                        >
                          <Background color="rgba(255, 255, 255, 0.02)" gap={16} size={1} />
                        </ReactFlow>
                      </ReactFlowProvider>
                    </div>
                  ) : (
                    <div className="strategy-preview-placeholder">
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <p>Loading strategy preview...</p>
                    </div>
                  )}
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
    </>
  );
}
