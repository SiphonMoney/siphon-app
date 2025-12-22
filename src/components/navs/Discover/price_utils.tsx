/**
 * Price Utilities
 * 
 * Contains all price-related calculations and formatting functions
 */

export interface PriceUtils {
  formatAmount: (amount: number, coin?: string) => string;
  calculateExchange: (inputAmount: number, coinA: string, coinB: string, coinPrices: Record<string, number>) => number;
  calculateVariableCost: (duration: string) => number;
  calculateFixedCost: (transactionOutputUSD: number) => number;
  getTransactionOutputForCost: (
    modalStrategyNodes: any[],
    runModeValues: Record<string, Record<string, string>>,
    coinPrices: Record<string, number>,
    calculateExchange: (inputAmount: number, coinA: string, coinB: string, coinPrices: Record<string, number>) => number
  ) => number;
  getInitialBalance: (modalStrategyNodes: any[], runModeValues: Record<string, Record<string, string>>) => string;
  getInputCoin: (modalStrategyNodes: any[], runModeValues: Record<string, Record<string, string>>) => string;
}

/**
 * Format amount with appropriate decimal places based on coin type
 */
export const formatAmount = (amount: number, coin?: string): string => {
  if (amount <= 0 || isNaN(amount) || !isFinite(amount)) return '0.0';
  
  // Determine decimal places based on coin type
  let decimals = 6;
  if (coin) {
    // Stablecoins (USDC, USDT) show 2 decimals
    if (coin === 'USDC' || coin === 'USDT') {
      decimals = 2;
    }
    // Bitcoin shows 8 decimals
    else if (coin === 'BTC') {
      decimals = 8;
    }
    // Ethereum and other altcoins show 6 decimals
    else {
      decimals = 6;
    }
  }
  
  // Format with appropriate decimals
  const formatted = amount.toFixed(decimals);
  
  // Remove trailing zeros but keep at least one decimal place
  if (formatted.includes('.')) {
    return formatted.replace(/\.?0+$/, '') || '0.0';
  }
  
  return formatted;
};

/**
 * Calculate exchange rate between two coins using their USD prices
 * Uses Pyth prices: outputAmount = inputAmount * (priceA / priceB)
 */
export const calculateExchange = (
  inputAmount: number,
  coinA: string,
  coinB: string,
  coinPrices: Record<string, number>
): number => {
  if (inputAmount <= 0) return 0;
  if (coinA === coinB) return inputAmount;
  
  const priceA = coinPrices[coinA] || 0;
  const priceB = coinPrices[coinB] || 0;
  
  if (priceA === 0 || priceB === 0) {
    console.warn(`[Exchange] Missing prices for pair ${coinA}/${coinB}:`, {
      priceA,
      priceB,
      coinPrices: { ...coinPrices }
    });
    return 0;
  }
  
  // Calculate: outputAmount = inputAmount * (priceA / priceB)
  // Example: 1 ETH * (3000 USD / 1 USD) = 3000 USDC
  const exchangeRate = priceA / priceB;
  const outputAmount = inputAmount * exchangeRate;
  
  console.log(`[Exchange] ${inputAmount} ${coinA} → ${outputAmount.toFixed(6)} ${coinB}`, {
    priceA: `${coinA}: $${priceA}`,
    priceB: `${coinB}: $${priceB}`,
    exchangeRate: `${exchangeRate.toFixed(6)} ${coinB}/${coinA}`,
    calculation: `${inputAmount} × (${priceA} / ${priceB}) = ${outputAmount.toFixed(6)}`
  });
  
  return outputAmount;
};

/**
 * Calculate variable cost based on duration
 */
export const calculateVariableCost = (duration: string): number => {
  const match = duration.match(/(\d+)([hd])/);
  if (!match) return 0.05;
  const value = parseInt(match[1]);
  const unit = match[2];
  const costPerMinute = 0.05 / 2; // $0.05 for 2 minutes
  if (unit === 'h') {
    return value * 60 * costPerMinute;
  } else if (unit === 'd') {
    return value * 24 * 60 * costPerMinute;
  }
  return 0.05;
};

/**
 * Calculate fixed cost as 0.015% of transaction output
 */
export const calculateFixedCost = (transactionOutputUSD: number): number => {
  // Fixed cost is 0.015% of transaction output
  return transactionOutputUSD * 0.00015;
};

/**
 * Get transaction output in USD for cost calculation
 */
export const getTransactionOutputForCost = (
  modalStrategyNodes: any[],
  runModeValues: Record<string, Record<string, string>>,
  coinPrices: Record<string, number>,
  calculateExchangeFn: (inputAmount: number, coinA: string, coinB: string, coinPrices: Record<string, number>) => number
): number => {
  if (modalStrategyNodes.length === 0) return 0;
  
  const depositNode = modalStrategyNodes.find((node: any) => node.data?.type === 'deposit');
  const swapNode = modalStrategyNodes.find((node: any) => node.data?.type === 'swap');
  
  if (!depositNode) return 0;
  
  const depositStepId = depositNode.id;
  const depositStepValues = runModeValues[depositStepId] || {};
  const inputAmount = parseFloat(depositStepValues['amount'] || '0') || 0;
  const inputCoin = depositStepValues['tokenA'] || depositNode.data?.coin || 'USDC';
  
  // Get output coin
  let outputCoin = inputCoin;
  if (swapNode) {
    const swapStepId = swapNode.id;
    const swapStepValues = runModeValues[swapStepId] || {};
    outputCoin = swapStepValues['coinB'] || swapNode.data?.toCoin || inputCoin;
  }
  
  // Calculate output amount using simple exchange: Coin A → Coin B
  const outputAmount = calculateExchangeFn(inputAmount, inputCoin, outputCoin, coinPrices);
  
  // Convert output amount to USD for cost calculation
  const outputPriceUSD = coinPrices[outputCoin] || 0;
  return outputAmount * outputPriceUSD;
};

/**
 * Get initial balance from deposit step
 */
export const getInitialBalance = (
  modalStrategyNodes: any[],
  runModeValues: Record<string, Record<string, string>>
): string => {
  if (modalStrategyNodes.length === 0) return '0.0';
  const depositNode = modalStrategyNodes.find((node: any) => node.data?.type === 'deposit');
  if (depositNode) {
    const stepId = depositNode.id;
    const stepValues = runModeValues[stepId] || {};
    return stepValues['amount'] || '0.0';
  }
  return '0.0';
};

/**
 * Get input coin from deposit step
 */
export const getInputCoin = (
  modalStrategyNodes: any[],
  runModeValues: Record<string, Record<string, string>>
): string => {
  if (modalStrategyNodes.length === 0) return 'USDC';
  const depositNode = modalStrategyNodes.find((node: any) => node.data?.type === 'deposit');
  if (depositNode) {
    const stepId = depositNode.id;
    const stepValues = runModeValues[stepId] || {};
    return stepValues['tokenA'] || depositNode.data?.coin || 'USDC';
  }
  return 'USDC';
};

/**
 * Fetch coin prices from Pyth Network API
 */
export const fetchCoinPrices = async (): Promise<Record<string, number>> => {
  try {
    console.log('[PriceUtils] Fetching prices from Pyth Network...');
    const response = await fetch('/api/pyth_price?coin=all');
    if (response.ok) {
      const data = await response.json();
      if (data.prices) {
        console.log('[PriceUtils] ✓ Received Pyth prices:', data.prices);
        // Log each price
        Object.entries(data.prices).forEach(([coin, price]) => {
          console.log(`[PriceUtils]   ${coin}: $${price}`);
        });
        // Verify Ethereum price is present
        if (data.prices.ETH && data.prices.ETH > 0) {
          console.log('[PriceUtils] ✓ Ethereum price verified:', data.prices.ETH, 'USD');
        } else {
          console.warn('[PriceUtils] ⚠ Ethereum price missing or zero:', data.prices.ETH);
        }
        return data.prices;
      } else {
        console.error('[PriceUtils] Invalid price data format:', data);
        return {};
      }
    } else {
      console.error('[PriceUtils] Failed to fetch prices:', response.status, response.statusText);
      return {};
    }
  } catch (error) {
    console.error('[PriceUtils] Error fetching prices:', error);
    return {};
  }
};


