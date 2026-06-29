import { walletManager } from "@/components/extensions/walletManager";
import { fetchCoinPrices } from "@/components/navs/Discover/price_utils";
import { initializeWithProvider } from "@/lib/nexus";
import { createVaultOutputNote } from "@/lib/outputNoteResolver";
import {
  getNetwork,
  getSelectedChainId,
  getTokens,
  getZkWithdrawRecipient,
  selectChainAndSwitchWallet,
} from "@/lib/networks";
import {
  buildStrategyPayload,
  inferSideFromSwap,
} from "@/lib/strategySpec";
import { submitEncryptedStrategy } from "@/lib/strategySubmit";
import { slippagePctToBps } from "@/lib/quickSwapSettings";
import { markQuickSwapStrategy } from "@/lib/quickSwapStrategyIds";
import { generateZKData } from "@/lib/zkHandler";

export interface QuickSwapRunInput {
  assetIn: string;
  assetOut: string;
  amount: number;
  recipient: string;
  slippagePct: number;
  onProgress?: (message: string) => void;
}

export async function executeQuickSwapPayAndRun(
  input: QuickSwapRunInput,
): Promise<{ success: boolean; error?: string; strategyId?: string }> {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const mark = (label: string, start: number) => {
    timings[label] = performance.now() - start;
  };

  const { assetIn, assetOut, amount, recipient, slippagePct, onProgress } = input;
  const log = (msg: string) => onProgress?.(msg);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Enter a valid amount." };
  }
  if (!recipient) {
    return { success: false, error: "Connect your wallet or enter a destination address." };
  }

  let wallet = walletManager.getPrimaryWallet();
  if (!wallet?.address) {
    const connect = await walletManager.connectMetaMask();
    if (!connect.success || !connect.wallet?.address) {
      return { success: false, error: connect.error ?? "Wallet connection failed." };
    }
    wallet = connect.wallet;
  }

  if (typeof window !== "undefined" && window.ethereum) {
    try {
      await initializeWithProvider(window.ethereum);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Failed to initialize wallet provider.",
      };
    }
  }

  const chainId = getSelectedChainId();
  log(`Switching to ${getNetwork(chainId).name}…`);
  let step = performance.now();
  const switchResult = await selectChainAndSwitchWallet(chainId);
  mark("networkSwitch", step);
  if (!switchResult.ok) {
    return { success: false, error: switchResult.error ?? "Could not switch network." };
  }

  const tokenMap = getTokens(chainId);
  const tokenInfo = tokenMap[assetIn.toUpperCase()];
  if (!tokenInfo) {
    return { success: false, error: `Token ${assetIn} is not supported on this chain.` };
  }

  const outToken = tokenMap[assetOut.toUpperCase()];
  if (!outToken) {
    return { success: false, error: `Token ${assetOut} is not supported on this chain.` };
  }

  log("Generating ZK proof…");
  step = performance.now();
  const zkResult = await generateZKData(
    chainId,
    tokenInfo,
    String(amount),
    getZkWithdrawRecipient(chainId),
  );
  mark("zkProof", step);
  if ("error" in zkResult) {
    return { success: false, error: zkResult.error };
  }

  const { withdrawalTxData, newDeposit, newDepositKey, spentDepositKey } = zkResult;

  let outputMode: "vault" | "address" = "address";
  let outputPrecommitment: string | undefined;
  const isSameChainSwap = assetIn.toUpperCase() !== assetOut.toUpperCase();
  if (isSameChainSwap) {
    step = performance.now();
    const out = await createVaultOutputNote(chainId, outToken);
    mark("vaultOutputNote", step);
    outputMode = "vault";
    outputPrecommitment = out.precommitment;
    log(`Vault output prepared (${assetOut})`);
  }

  step = performance.now();
  const prices = await fetchCoinPrices();
  mark("priceFetch", step);
  const ethUsd = prices.ETH;
  if (!ethUsd || ethUsd <= 0) {
    return { success: false, error: "Could not fetch ETH price for immediate limit trigger." };
  }

  const side = inferSideFromSwap(assetIn, assetOut);
  const bounds = buildStrategyPayload("Limit Order", {
    side,
    priceGoal: String(ethUsd),
  });

  const strategyPayload = {
    user_id: recipient,
    strategy_type: bounds.strategy_type,
    asset_in: assetIn,
    asset_out: assetOut,
    amount,
    upper_bound: bounds.upper_bound,
    lower_bound: bounds.lower_bound,
    recipient_address: recipient,
    max_slippage_bps: slippagePctToBps(slippagePct),
    from_chain: String(chainId),
    to_chain: String(chainId),
    output_mode: outputMode,
    output_precommitment: outputPrecommitment,
    zk_proof: {
      pA: withdrawalTxData.pA,
      pB: withdrawalTxData.pB,
      pC: withdrawalTxData.pC,
      nullifierHash: withdrawalTxData.nullifierHash,
      newCommitment: withdrawalTxData.newCommitment,
      stateRoot: withdrawalTxData.stateRoot,
    },
  };

  log("Encrypting and submitting strategy…");
  step = performance.now();
  const result = await submitEncryptedStrategy(strategyPayload, {
    onKeygen: () => log("Generating FHE keys (one-time)…"),
    onUploadKey: () => log("Uploading FHE server key…"),
    onUploadClientKey: () => log("Sending client key to confidential VM…"),
    onEncrypt: () => log("Encrypting price bounds…"),
  });
  mark("fheSubmit", step);
  timings.total = performance.now() - t0;
  console.log(
    "[QuickSwap timing]",
    Object.entries(timings)
      .map(([k, ms]) => `${k}=${ms.toFixed(0)}ms`)
      .join(" "),
  );

  if (!result.success) {
    return { success: false, error: result.error ?? "Strategy submission failed." };
  }

  if (newDeposit && newDepositKey) {
    localStorage.setItem(newDepositKey, JSON.stringify({ ...newDeposit, spent: false }));
  }
  if (spentDepositKey) {
    try {
      localStorage.removeItem(spentDepositKey);
    } catch {
      /* best-effort */
    }
  }

  const strategyId = String(result.data?.strategy_id ?? result.data?.payload_id ?? "");
  if (strategyId) {
    markQuickSwapStrategy(strategyId);
    window.dispatchEvent(
      new CustomEvent("siphon:strategySubmitted", { detail: { strategyId, userId: recipient } }),
    );
  }

  return { success: true, strategyId: strategyId || undefined };
}
