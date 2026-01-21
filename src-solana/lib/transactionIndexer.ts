import { getProvider } from './nexus';
import { ethers, Contract, Interface, Log } from 'ethers';
import { getEntrypointContract } from './handler';
import entrypointArtifact from "../../contract/artifacts/src/Entrypoint.sol/Entrypoint.json";
import nativeVaultAbiJson from './abi/NativeVault.json';
import { TOKEN_MAP } from './nexus';

const ENTRYPOINT_ADDRESS = '0x8Be4A7A074468F571271192A0A0824cf6F08a1f6';
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export interface IndexedTransaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'SWAP' | 'FEE_PAYMENT' | 'COMMITMENT_UPDATE';
  blockNumber: number;
  timestamp: number;
  txHash: string;
  contractAddress: string;
  logIndex: number;
  
  // Event-specific data
  asset?: string;
  tokenSymbol?: string;
  amount?: string;
  amountFormatted?: string;
  commitment?: string;
  nullifier?: string;
  newCommitment?: string;
  depositor?: string;
  recipient?: string;
  
  // For swaps
  srcToken?: string;
  dstToken?: string;
  pool?: string;
  
  // For fee payments
  executionPrice?: string;
}

const STORAGE_KEY = 'siphon-indexed-transactions';
const LAST_BLOCK_KEY = 'siphon-last-indexed-block';

// Get all vault addresses for known tokens
async function getAllVaults(providerOverride?: any): Promise<Map<string, string>> {
  let provider = providerOverride || getProvider();
  
  // If provider not available, try to create one from window.ethereum for read-only access
  if (!provider && typeof window !== 'undefined' && window.ethereum) {
    try {
      const { BrowserProvider } = await import('ethers');
      provider = new BrowserProvider(window.ethereum);
    } catch (error) {
      console.warn("Failed to create provider for getting vaults:", error);
      return new Map();
    }
  }
  
  if (!provider) {
    console.warn("Provider not available for getting vaults");
    return new Map();
  }
  
  try {
    // getEntrypointContract expects Signer | BrowserProvider, so we pass provider directly
    const entrypoint = await getEntrypointContract(provider as any);
    const vaults = new Map<string, string>();
    
    // Get vaults for known tokens
    for (const [symbol, tokenInfo] of Object.entries(TOKEN_MAP)) {
      try {
        const tokenAddress = symbol === 'ETH' ? NATIVE_TOKEN : tokenInfo.address;
        console.log(`Getting vault for ${symbol} (${tokenAddress})...`);
        const vaultAddress = await entrypoint.getVault(tokenAddress);
        console.log(`  Vault address for ${symbol}: ${vaultAddress}`);
        if (vaultAddress && vaultAddress !== '0x0000000000000000000000000000000000000000') {
          vaults.set(tokenAddress, vaultAddress);
          console.log(`  ✓ Added vault for ${symbol} at ${vaultAddress}`);
        } else {
          console.warn(`  ✗ Invalid vault address for ${symbol}: ${vaultAddress}`);
        }
      } catch (error) {
        console.warn(`Failed to get vault for ${symbol}:`, error);
      }
    }
    
    return vaults;
  } catch (error) {
    console.error('Error getting vaults:', error);
    return new Map();
  }
}

// Format amount with token decimals
function formatAmount(amount: bigint, tokenSymbol: string): string {
  const token = TOKEN_MAP[tokenSymbol];
  if (!token) return amount.toString();
  return ethers.formatUnits(amount, token.decimals);
}

// Get token symbol from address
function getTokenSymbol(address: string): string {
  if (address.toLowerCase() === NATIVE_TOKEN.toLowerCase()) return 'ETH';
  for (const [symbol, tokenInfo] of Object.entries(TOKEN_MAP)) {
    if (tokenInfo.address.toLowerCase() === address.toLowerCase()) {
      return symbol;
    }
  }
  return address.slice(0, 6) + '...' + address.slice(-4);
}

// Index deposits from vault events
async function indexDeposits(
  vaultAddress: string,
  assetAddress: string,
  fromBlock: number,
  toBlock: number | 'latest',
  providerOverride?: any
): Promise<IndexedTransaction[]> {
  const provider = providerOverride || getProvider();
  if (!provider) {
    console.warn('No provider for indexing deposits');
    return [];
  }
  
  try {
    const vault = new Contract(vaultAddress, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
    const filter = vault.filters.Deposited();
    console.log(`  Querying Deposited events from block ${fromBlock} to ${toBlock} on vault ${vaultAddress}`);
    const logs = await vault.queryFilter(filter, fromBlock, toBlock);
    console.log(`  Found ${logs.length} Deposited event logs`);
    
    const transactions: IndexedTransaction[] = [];
    const tokenSymbol = getTokenSymbol(assetAddress);
    
    for (const log of logs) {
      try {
        const parsed = vault.interface.parseLog(log as Log);
        if (!parsed) {
          console.warn('  Failed to parse log:', log);
          continue;
        }
        
        const block = await provider.getBlock(log.blockNumber);
        const amount = parsed.args.amount;
        const amountFormatted = formatAmount(amount, tokenSymbol);
        
        transactions.push({
          id: `${log.blockNumber}-${log.index}`,
          type: 'DEPOSIT',
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp || 0,
          txHash: log.transactionHash,
          contractAddress: vaultAddress,
          logIndex: log.index,
          asset: assetAddress,
          tokenSymbol,
          amount: amount.toString(),
          amountFormatted,
          commitment: parsed.args.commitment?.toString(),
          depositor: parsed.args.depositor
        });
      } catch (error) {
        console.warn('  Failed to parse deposit log:', error, log);
      }
    }
    
    return transactions;
  } catch (error) {
    console.error(`Error indexing deposits for vault ${vaultAddress}:`, error);
    return [];
  }
}

// Index withdrawals from vault events
async function indexWithdrawals(
  vaultAddress: string,
  assetAddress: string,
  fromBlock: number,
  toBlock: number | 'latest',
  providerOverride?: any
): Promise<IndexedTransaction[]> {
  const provider = providerOverride || getProvider();
  if (!provider) {
    console.warn('No provider for indexing withdrawals');
    return [];
  }
  
  try {
    const vault = new Contract(vaultAddress, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
    const filter = vault.filters.Withdrawn();
    console.log(`  Querying Withdrawn events from block ${fromBlock} to ${toBlock} on vault ${vaultAddress}`);
    const logs = await vault.queryFilter(filter, fromBlock, toBlock);
    console.log(`  Found ${logs.length} Withdrawn event logs`);
    
    const transactions: IndexedTransaction[] = [];
    const tokenSymbol = getTokenSymbol(assetAddress);
    
    for (const log of logs) {
      try {
        const parsed = vault.interface.parseLog(log as Log);
        if (!parsed) {
          console.warn('  Failed to parse log:', log);
          continue;
        }
        
        const block = await provider.getBlock(log.blockNumber);
        const amount = parsed.args.amount;
        const amountFormatted = formatAmount(amount, tokenSymbol);
        
        transactions.push({
          id: `${log.blockNumber}-${log.index}`,
          type: 'WITHDRAWAL',
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp || 0,
          txHash: log.transactionHash,
          contractAddress: vaultAddress,
          logIndex: log.index,
          asset: assetAddress,
          tokenSymbol,
          amount: amount.toString(),
          amountFormatted,
          nullifier: parsed.args.nullifier?.toString(),
          newCommitment: parsed.args.newCommitment?.toString(),
          recipient: parsed.args.recipient
        });
      } catch (error) {
        console.warn('  Failed to parse withdrawal log:', error, log);
      }
    }
    
    return transactions;
  } catch (error) {
    console.error(`Error indexing withdrawals for vault ${vaultAddress}:`, error);
    return [];
  }
}

// Index swaps from vault events
async function indexSwaps(
  vaultAddress: string,
  assetAddress: string,
  fromBlock: number,
  toBlock: number | 'latest',
  providerOverride?: any
): Promise<IndexedTransaction[]> {
  const provider = providerOverride || getProvider();
  if (!provider) return [];
  
  try {
    const vault = new Contract(vaultAddress, nativeVaultAbiJson.abi as ethers.InterfaceAbi, provider);
    
    // Check if Swapped event exists in the ABI
    if (!vault.filters || typeof vault.filters.Swapped !== 'function') {
      console.log(`  Swapped event not available in ABI for vault ${vaultAddress}, skipping swaps`);
      return [];
    }
    
    const filter = vault.filters.Swapped();
    console.log(`  Querying Swapped events from block ${fromBlock} to ${toBlock} on vault ${vaultAddress}`);
    const logs = await vault.queryFilter(filter, fromBlock, toBlock);
    console.log(`  Found ${logs.length} Swapped event logs`);
    
    const transactions: IndexedTransaction[] = [];
    const tokenSymbol = getTokenSymbol(assetAddress);
    
    for (const log of logs) {
      try {
        const parsed = vault.interface.parseLog(log as Log);
        if (!parsed) continue;
        
        const block = await provider.getBlock(log.blockNumber);
        const param = parsed.args._param;
        const amountIn = param.amountIn;
        const amountFormatted = formatAmount(amountIn, tokenSymbol);
        
        transactions.push({
          id: `${log.blockNumber}-${log.index}`,
          type: 'SWAP',
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp || 0,
          txHash: log.transactionHash,
          contractAddress: vaultAddress,
          logIndex: log.index,
          asset: assetAddress,
          tokenSymbol,
          amount: amountIn?.toString(),
          amountFormatted,
          nullifier: parsed.args._spentNullifier?.toString(),
          newCommitment: parsed.args._newCommitment?.toString(),
          recipient: param.recipient,
          srcToken: param.srcToken,
          dstToken: param.dstToken,
          pool: param.pool
        });
      } catch (error) {
        console.warn('Failed to parse swap log:', error);
      }
    }
    
    return transactions;
  } catch (error) {
    console.error('Error indexing swaps:', error);
    return [];
  }
}

// Index fee payments from Entrypoint events
async function indexFeePayments(
  fromBlock: number,
  toBlock: number | 'latest',
  providerOverride?: any
): Promise<IndexedTransaction[]> {
  const provider = providerOverride || getProvider();
  if (!provider) return [];
  
  try {
    const entrypoint = await getEntrypointContract(provider);
    const filter = entrypoint.filters.ExecutionFeePaid();
    const logs = await entrypoint.queryFilter(filter, fromBlock, toBlock);
    
    const transactions: IndexedTransaction[] = [];
    
    for (const log of logs) {
      try {
        const parsed = entrypoint.interface.parseLog(log as Log);
        if (!parsed) continue;
        
        const block = await provider.getBlock(log.blockNumber);
        const asset = parsed.args.asset;
        const tokenSymbol = getTokenSymbol(asset);
        const executionPrice = parsed.args.executionPrice;
        const amountFormatted = formatAmount(executionPrice, tokenSymbol);
        
        transactions.push({
          id: `${log.blockNumber}-${log.index}`,
          type: 'FEE_PAYMENT',
          blockNumber: log.blockNumber,
          timestamp: block?.timestamp || 0,
          txHash: log.transactionHash,
          contractAddress: ENTRYPOINT_ADDRESS,
          logIndex: log.index,
          asset,
          tokenSymbol,
          amount: executionPrice?.toString(),
          amountFormatted,
          executionPrice: executionPrice?.toString(),
          nullifier: parsed.args.nullifier?.toString(),
          newCommitment: parsed.args.newCommitment?.toString()
        });
      } catch (error) {
        console.warn('Failed to parse fee payment log:', error);
      }
    }
    
    return transactions;
  } catch (error) {
    console.error('Error indexing fee payments:', error);
    return [];
  }
}

// Main indexing function
export async function indexTransactions(
  fromBlock?: number,
  toBlock: number | 'latest' = 'latest'
): Promise<IndexedTransaction[]> {
  let provider = getProvider();
  
  // If provider not available, try to create one from window.ethereum for read-only access
  if (!provider && typeof window !== 'undefined' && window.ethereum) {
    try {
      const { BrowserProvider } = await import('ethers');
      provider = new BrowserProvider(window.ethereum);
      console.log('Created read-only provider for indexing');
    } catch (error) {
      console.error('Failed to create provider for indexing:', error);
      return loadTransactions(); // Return cached transactions
    }
  }
  
  if (!provider) {
    console.warn('Provider not available for indexing, returning cached transactions');
    return loadTransactions(); // Return cached transactions instead of empty array
  }
  
  try {
    // Get start block from storage or use provided/default
    let startBlock = fromBlock;
    if (!startBlock) {
      const stored = localStorage.getItem(LAST_BLOCK_KEY);
      startBlock = stored ? parseInt(stored, 10) : 0;
    }
    
    // Get current block if toBlock is 'latest'
    let endBlock: number;
    if (toBlock === 'latest') {
      endBlock = await provider.getBlockNumber();
    } else {
      endBlock = toBlock;
    }
    
    if (startBlock >= endBlock) {
      console.log('No new blocks to index (startBlock >= endBlock)');
      // Return existing transactions instead of empty array
      return loadTransactions();
    }
    
    const blockRange = endBlock - startBlock;
    if (blockRange < 100 && startBlock > 0) {
      console.warn(`⚠️  Only indexing ${blockRange} block(s) (${startBlock} to ${endBlock}). This is likely because indexing started from a recent block.`);
      console.warn(`💡 Tip: Click "Re-index" to index all historical transactions from block 0.`);
    }
    
    console.log(`Indexing transactions from block ${startBlock} to ${endBlock} (${blockRange} blocks)`);
    
    // Get all vault addresses (pass provider to avoid re-creating)
    const vaults = await getAllVaults(provider);
    console.log(`Found ${vaults.size} vaults to index`);
    
    if (vaults.size === 0) {
      console.warn('No vaults found! This might mean vaults are not initialized or Entrypoint.getVault() is failing.');
      console.log('Attempting to index from Entrypoint contract directly...');
    }
    
    // Index all event types
    const allTransactions: IndexedTransaction[] = [];
    
    // Index from each vault (pass provider to all functions)
    for (const [assetAddress, vaultAddress] of vaults.entries()) {
      console.log(`Indexing vault ${vaultAddress} for asset ${assetAddress}`);
      
      // Index deposits and withdrawals in parallel, swaps separately (may fail if not in ABI)
      const [deposits, withdrawals] = await Promise.all([
        indexDeposits(vaultAddress, assetAddress, startBlock, endBlock, provider),
        indexWithdrawals(vaultAddress, assetAddress, startBlock, endBlock, provider)
      ]);
      
      // Index swaps separately (may not be available in ABI)
      let swaps: IndexedTransaction[] = [];
      try {
        swaps = await indexSwaps(vaultAddress, assetAddress, startBlock, endBlock, provider);
      } catch (error) {
        console.warn(`  Failed to index swaps for vault ${vaultAddress}:`, error);
      }
      
      console.log(`  - Deposits: ${deposits.length}, Withdrawals: ${withdrawals.length}, Swaps: ${swaps.length}`);
      allTransactions.push(...deposits, ...withdrawals, ...swaps);
    }
    
    // Index fee payments from Entrypoint
    const feePayments = await indexFeePayments(startBlock, endBlock, provider);
    allTransactions.push(...feePayments);
    
    // Sort by block number and log index
    allTransactions.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return b.blockNumber - a.blockNumber; // Newest first
      }
      return b.logIndex - a.logIndex;
    });
    
    // Load existing transactions
    const existing = loadTransactions();
    const existingIds = new Set(existing.map(t => t.id));
    
    // Filter out duplicates and merge
    const newTransactions = allTransactions.filter(t => !existingIds.has(t.id));
    const updated = [...newTransactions, ...existing];
    
    // Save to localStorage
    saveTransactions(updated);
    localStorage.setItem(LAST_BLOCK_KEY, endBlock.toString());
    
    console.log(`Indexed ${newTransactions.length} new transactions`);
    return updated;
  } catch (error) {
    console.error('Error indexing transactions:', error);
    return [];
  }
}

// Load transactions from localStorage
export function loadTransactions(): IndexedTransaction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error loading transactions:', error);
    return [];
  }
}

// Save transactions to localStorage
function saveTransactions(transactions: IndexedTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (error) {
    console.error('Error saving transactions:', error);
  }
}

// Clear all indexed transactions
export function clearTransactions(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LAST_BLOCK_KEY);
}

// Force re-index from beginning (useful for debugging or when vaults are initialized)
export async function reindexFromBeginning(toBlock: number | 'latest' = 'latest'): Promise<IndexedTransaction[]> {
  console.log('Force re-indexing from beginning...');
  localStorage.removeItem(LAST_BLOCK_KEY);
  return indexTransactions(0, toBlock);
}

