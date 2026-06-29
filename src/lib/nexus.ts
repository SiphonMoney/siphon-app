// replaced original nexus handler code with ethers.js implementation
import { ethers, BrowserProvider, Signer, Contract, formatUnits, parseUnits, Eip1193Provider } from 'ethers';
import { getSelectedChainId, getNetwork, getTokens } from './networks';

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

// Token map is now per-chain (ETH + that chain's USDC), sourced from the network registry.
export function getTokenMap(): { [key: string]: { address: string; decimals: number; symbol: string } } {
  return getTokens();
}
// Back-compat alias for modules/components that import a static TOKEN_MAP — resolves to the
// active chain's tokens at access time via a Proxy.
export const TOKEN_MAP: { [key: string]: { address: string; decimals: number; symbol: string } } =
  new Proxy({}, {
    get: (_t, prop: string) => getTokenMap()[prop],
    ownKeys: () => Reflect.ownKeys(getTokenMap()),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    has: (_t, prop: string) => prop in getTokenMap(),
  }) as { [key: string]: { address: string; decimals: number; symbol: string } };


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
export async function initializeWithProvider(eip1193Provider: Eip1193Provider, force = false) {
  if (!eip1193Provider) {
    throw new Error('No EIP-1193 provider (e.g., MetaMask) found'); 
  }
  if (!force && isInitialized()) return;

  try {
    provider = new ethers.BrowserProvider(eip1193Provider);
    signer = await provider.getSigner();
    console.log("Ethers initialized with signer:", await signer.getAddress());
  } catch (error) {
    console.error("Failed to initialize ethers provider:", error);
    provider = null;
    signer = null;
    throw error;
  }
}

/** Re-create the provider/signer after the wallet switches chains. */
export async function refreshProvider(eip1193Provider: Eip1193Provider) {
  await deinit();
  await initializeWithProvider(eip1193Provider, true);
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

// Gets ETH and ERC20 balances for the connected wallet on the active network
export async function getUnifiedBalances(chainId?: number) {
  if (!signer || !provider) {
    console.error('Ethers not initialized, cannot get balances.');
    return null;
  }

  const targetChainId = chainId ?? getSelectedChainId();
  const walletNetwork = await provider.getNetwork();
  if (Number(walletNetwork.chainId) !== targetChainId) {
    console.warn(
      `Wallet is on chain ${walletNetwork.chainId} but dapp expects ${targetChainId}; skipping balance fetch.`,
    );
    return [];
  }

  const address = await signer.getAddress();
  const balancePromises = [];

  // 1. Fetch Native ETH Balance
  balancePromises.push(
    provider.getBalance(address).then((balance) => ({
      symbol: 'ETH',
      balance: formatUnits(balance, 18),
      decimals: 18,
      balanceRaw: balance,
    })).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not fetch ETH balance: ${message}`);
      return null;
    }),
  );

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
    // Breakdown reflects the active network (Eth Sepolia / Base Sepolia)
    breakdown: [
      {
        balance: bal.balance,
        chain: {
          id: targetChainId,
          logo: '',
          name: getNetwork(targetChainId).name
        },

        contractAddress: getTokenMap()[bal.symbol]?.address as `0x${string}`
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