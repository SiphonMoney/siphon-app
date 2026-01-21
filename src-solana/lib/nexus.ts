// replaced original nexus handler code with ethers.js implementation
import { ethers, BrowserProvider, Signer, Contract, formatUnits, parseUnits, Eip1193Provider } from 'ethers';

// --- State Variables ---
let provider: BrowserProvider | null = null;
let signer: Signer | null = null;

// --- ABIs and Token Definitions ---
// Minimal ERC20 ABI for balance_of and transfer
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// Minimal ERC20 ABI for allowance and approve
const ERC20_ABI_ALLOWANCE = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// Sepolia Chain ID
const SEPOLIA_CHAIN_ID = 11155111;

export const TOKEN_MAP: { [key: string]: { address: string, decimals: number, symbol: string } } = {
  'ETH': {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
    symbol: 'ETH'
  },
  'USDC': {
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    decimals: 6,
    symbol: 'USDC'
  },
  'USDT': {
    address: '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0',
    decimals: 6,
    symbol: 'USDT'
  },
  'WBTC': {
    address: '0x92f3B59a79bFf5dc60c0d59eA13a44D082B2bdFC',
    decimals: 8,
    symbol: 'WBTC'
  }
};


// --- Exportable Helper Functions ---

export function getProvider(): BrowserProvider | null {
  return provider;
}

export function getSigner(): Signer | null {
  return signer;
}

export function isInitialized(): boolean {
  return !!signer;
}

// --- Core Functions ---

// Initialize the ethers provider and signer from a browser wallet
export async function initializeWithProvider(eip1193Provider: Eip1193Provider) {
  if (!eip1193Provider) {
    throw new Error('No EIP-1193 provider (e.g., MetaMask) found'); 
  }
  if (isInitialized()) return;

  try {
    // Create a new ethers provider
    provider = new ethers.BrowserProvider(eip1193Provider);
    // Get the signer
    signer = await provider.getSigner();
    console.log("Ethers initialized with signer:", await signer.getAddress());

  } catch (error) {
    console.error("Failed to initialize ethers provider:", error);
    provider = null;
    signer = null;
  }
}

// Deinitialize the provider and signer.
export async function deinit() {
  if (!isInitialized()) return;
  provider = null;
  signer = null;
  console.log("Ethers de-initialized.");
}

// --- ERC20 Allowance Functions ---

export async function getTokenAllowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
  if (!provider) {
    throw new Error('Ethers provider not initialized.');
  }
  const tokenContract = new Contract(tokenAddress, ERC20_ABI_ALLOWANCE, provider);
  return tokenContract.allowance(owner, spender);
}

export async function approveToken(tokenAddress: string, spender: string, amount: bigint): Promise<ethers.TransactionResponse> {
  if (!signer) {
    throw new Error('Ethers signer not initialized.');
  }
  const tokenContract = new Contract(tokenAddress, ERC20_ABI_ALLOWANCE, signer);
  return tokenContract.approve(spender, amount);
}

// Gets ETH and ERC20 balances for the connected wallet on Sepolia
export async function getUnifiedBalances() {
  if (!signer || !provider) {
    console.error('Ethers not initialized, cannot get balances.');
    return null;
  }

  const address = await signer.getAddress();
  const balancePromises = [];

  // 1. Fetch Native ETH Balance
  balancePromises.push(provider.getBalance(address).then(balance => ({
    symbol: 'ETH',
    balance: formatUnits(balance, 18),
    decimals: 18,
    balanceRaw: balance
  })));

  // 2. Fetch ERC20 Balances (from TOKEN_MAP, -> skip ETH)
  for (const tokenSymbol in TOKEN_MAP) {
    if (tokenSymbol === 'ETH') continue;
    
    const tokenInfo = TOKEN_MAP[tokenSymbol];
    const tokenContract = new Contract(tokenInfo.address, ERC20_ABI, provider);
    
    balancePromises.push(
      tokenContract.balanceOf(address).then(balance => ({
        symbol: tokenInfo.symbol,
        balance: formatUnits(balance, tokenInfo.decimals),
        decimals: tokenInfo.decimals,
        balanceRaw: balance
      })).catch(err => {
        console.warn(`Could not fetch balance for ${tokenSymbol}: ${err.message}`);
        return null; // Return null on error for this token
      })
    );
  }

  // 3. Resolve all promises and format the output
  const results = (await Promise.all(balancePromises)).filter(b => b !== null); // Filter out any failed fetches

  // 4. Format to match the UnifiedBalances structure
  const unifiedBalances = results.map(bal => ({
    symbol: bal.symbol,
    balance: bal.balance,
    decimals: bal.decimals,
    // Mock the breakdown structure to show it's on Sepolia
    breakdown: [
      {
        balance: bal.balance,
        chain: {
          id: SEPOLIA_CHAIN_ID,
          logo: '',
          name: 'Ethereum Sepolia'
        },
        
        contractAddress: TOKEN_MAP[bal.symbol]?.address as `0x${string}`
      }
    ]
  }));

  return unifiedBalances;
}

// Transfers ETH or an ERC20 token on the same chain (Sepolia).

export async function transferTokens(tokenSymbol: string, amount: string, recipient: string) {
  console.log('transferTokens called with:', { tokenSymbol, amount, recipient });
  if (!signer) {
    console.error('SDK not initialized');
    return { success: false, error: 'Wallet not connected' };
  }

  try {
    const tokenInfo = TOKEN_MAP[tokenSymbol.toUpperCase()];
    if (!tokenInfo) {
      throw new Error(`Token not supported: ${tokenSymbol}`);
    }

    const parsedAmount = parseUnits(amount, tokenInfo.decimals);
    let tx;

    if (tokenSymbol.toUpperCase() === 'ETH') {
      // Native ETH transfer
      tx = await signer.sendTransaction({
        to: recipient,
        value: parsedAmount
      });
    } else {
      // ERC20 token transfer
      const tokenContract = new Contract(tokenInfo.address, ERC20_ABI, signer);
      tx = await tokenContract.transfer(recipient, parsedAmount);
    }

    console.log('Transaction sent:', tx.hash);
    await tx.wait(); // Wait for transaction to be mined
    console.log('Transaction confirmed:', tx.hash);

    return { success: true, transactionHash: tx.hash };

  } catch (error: unknown) {
    console.error('Transfer failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transfer transaction failed'
    };
  }
}

export function getSiphonVaultTotalBalance(chainId: number, tokenMap: { [key: string]: { decimals: number } }): { totalBalance: number; details: { [token: string]: number } } {
  let totalBalance = 0;
  const details: { [token: string]: number } = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Expected key format: `${chainId}-${tokenSymbol}-${commitment}`
    if (key.startsWith(`${chainId}-`)) {
      try {
        const parts = key.split('-');
        if (parts.length < 3) continue; // Not a valid siphon deposit key

        const tokenSymbol = parts[1];
        const data = JSON.parse(localStorage.getItem(key) || '{}');

        if (data && data.amount && !data.spent) {
          const tokenInfo = tokenMap[tokenSymbol.toUpperCase()];
          if (tokenInfo) {
            const amountInUnits = parseFloat(ethers.formatUnits(BigInt(ethers.parseUnits(data.amount, tokenInfo.decimals).toString()), tokenInfo.decimals));
            totalBalance += amountInUnits;
            details[tokenSymbol] = (details[tokenSymbol] || 0) + amountInUnits;
          } else {
            console.warn(`Token info not found for symbol: ${tokenSymbol}`);
          }
        }
      } catch (e) {
        console.warn(`Failed to parse local storage item with key ${key}:`, e);
      }
    }
  }

  return { totalBalance, details };
}