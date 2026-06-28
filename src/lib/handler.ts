import { getSigner, getProvider, TOKEN_MAP, getTokenAllowance, approveToken } from './nexus';
import { ethers, Interface, Log, Contract, TransactionResponse, TransactionReceipt, BrowserProvider, Signer} from 'ethers';
import { generateCommitmentData, generateZKData, TokenInfo, invalidateLeafCache } from './zkHandler';
import entrypointArtifact from "./abi/Entrypoint.json";
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';
import { getNetwork, getSelectedChainId, NATIVE_TOKEN as NATIVE } from './networks';

// --------- Constants ----------
// Chain + Entrypoint now come from the active network registry (Eth Sepolia / Base Sepolia).
const currentChainId = (): number => getSelectedChainId();
const entrypointAddr = (): string => getNetwork().entrypoint;
const NATIVE_TOKEN = NATIVE;

// --------- ABIs & interface helpers ----------
const entrypointAbi = entrypointArtifact.abi as ethers.InterfaceAbi;
const vaultAbi = nativeVaultAbiJson.abi as ethers.InterfaceAbi;
const merkleTreeAbi = merkleTreeAbiJson.abi as ethers.InterfaceAbi;
const merkleTreeInterface = new Interface(merkleTreeAbi);

// --------- getEntrypointContract ----------
export async function getEntrypointContract(
  signerOrProvider: Signer | ethers.Provider
): Promise<Contract> {

  let actor: Signer | ethers.Provider = signerOrProvider;

  // A BrowserProvider (injected wallet) must be unwrapped to a signer for writes. A plain
  // read-only Provider (e.g. JsonRpcProvider fallback) is used directly — fine for view calls.
  if (actor instanceof BrowserProvider) {
    actor = await actor.getSigner();
  }

  const contract = new Contract(
    entrypointAddr(),
    entrypointAbi,
    actor
  );

  return contract;
}

// --------- Check Fee Payment Status ----------
export async function checkFeePaymentStatus(_nullifier: string): Promise<{ paid: boolean; amount: string | null }> {
  console.log("🔍 checkFeePaymentStatus() called for nullifier:", _nullifier.substring(0, 20) + "...");
  
  try {
    const provider = getProvider();
    if (!provider) {
      console.error("❌ Provider not found");
      return { paid: false, amount: null };
    }

    const contract = await getEntrypointContract(provider);
    const paidAmount = await contract.feePayments(_nullifier);
    
    if (paidAmount > 0n) {
      console.log("✅ Fee already paid:", paidAmount.toString());
      return { paid: true, amount: paidAmount.toString() };
    } else {
      console.log("ℹ️ No fee paid for this nullifier");
      return { paid: false, amount: null };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Error checking fee payment status:", message);
    return { paid: false, amount: null };
  }
}

// --------- Deposit Implementation ----------
export async function deposit(_token: string, _amount: string) {
  console.log("deposit() called", { _token, _amount });
  
  const signer = getSigner();
  if (!signer) {
    console.error("Wallet not connected");
    return { success: false, error: 'Wallet not connected' };
  }

  const token = TOKEN_MAP[_token.toUpperCase()];
  if (!token) {
    console.error(`Token not supported: ${_token.toUpperCase()}`);
    return { success: false, error: `Token not supported: ${_token.toUpperCase()}` };
  }

  // Convert to TokenInfo format for zkHandler
  const tokenInfo: TokenInfo = {
    symbol: token.symbol,
    decimals: token.decimals,
    address: token.address
  };

  let depositId: string | null = null;
  let finalDepositId: string | null = null;

  try {
    // 1) Generate commitment data using zkHandler
    console.log("Generating commitment data...");
    const commitmentData = await generateCommitmentData(currentChainId(), tokenInfo, _amount);

    const decAmount = ethers.parseUnits(_amount, token.decimals);
    const tokenAddress = token.symbol === 'ETH' ? NATIVE_TOKEN : token.address;
    const signerAddress = await signer.getAddress();

    // Store full secrets in temp hint BEFORE sending tx so they survive a page refresh
    // between mining and the final writeNote. Key is precommitment (known pre-tx).
    depositId = `${currentChainId()}-${_token}-${commitmentData.precommitment}`;
    localStorage.setItem(depositId, JSON.stringify({
      nullifier:     commitmentData.nullifier,
      secret:        commitmentData.secret,
      precommitment: commitmentData.precommitment,
      nullifierHash: commitmentData.nullifierHash ?? '',
      amount:        _amount,
      pending:       true,
    }));
    console.log("Stored deposit hint (with secrets) in localStorage:", depositId);

    const contract = await getEntrypointContract(signer);
    let receipt: TransactionReceipt | null = null;

    // 2) Send transaction
    if (token.symbol === 'ETH') {
      console.log("Depositing ETH flow...");
      const tx = await contract.deposit(
        NATIVE_TOKEN,
        decAmount,
        commitmentData.precommitment,
        { value: decAmount }
      );
      console.log("Deposit tx sent (ETH):", tx.hash);
      receipt = await tx.wait();
      if (!receipt) throw new Error("Receipt is null after deposit tx");
      console.log("Deposit tx mined (ETH):", receipt.hash);
    } else {
      // ERC20 deposit: Check allowance and approve if necessary
      console.log("Signer Address:", signerAddress);
      console.log("Token Address (ERC20):", tokenAddress);

      const vaultAddress = await contract.getVault(tokenAddress);
      console.log("Vault address for token:", vaultAddress);

      let currentAllowance = await getTokenAllowance(tokenAddress, signerAddress, entrypointAddr());
      console.log(`Initial allowance for ${token.symbol} (raw): ${currentAllowance.toString()}`);
      console.log(`Initial allowance for ${token.symbol}: ${ethers.formatUnits(currentAllowance, token.decimals)}`);
      console.log(`Deposit amount (raw): ${decAmount.toString()}`);
      console.log(`Deposit amount: ${ethers.formatUnits(decAmount, token.decimals)}`);

      if (currentAllowance < decAmount) {
        console.log(`Insufficient allowance. Approving ${token.symbol} for Entrypoint...`);
        try {
          const approveTx = await approveToken(tokenAddress, entrypointAddr(), ethers.MaxUint256);
          console.log("Approve tx sent:", approveTx.hash);
          const approveReceipt = await approveTx.wait();
          if (!approveReceipt) throw new Error("Approve receipt is null");
          console.log("Approve tx mined:", approveReceipt.hash);

          currentAllowance = await getTokenAllowance(tokenAddress, signerAddress, entrypointAddr());
          console.log(`Allowance after approval (raw): ${currentAllowance.toString()}`);
          console.log(`Allowance after approval: ${ethers.formatUnits(currentAllowance, token.decimals)}`);

          if (currentAllowance < decAmount) {
            console.error("Allowance still insufficient after approval. This should not happen if approval was successful.");
            throw new Error("Allowance still insufficient after approval. Please check MetaMask for failed approval transactions.");
          }

        } catch (approveErr: unknown) {
          const approveMessage = approveErr instanceof Error ? approveErr.message : String(approveErr);
          console.error("Error during token approval:", approveMessage);
          throw new Error(`Token approval failed: ${approveMessage}`);
        }
      } else {
        console.log("Allowance sufficient. Skipping explicit approval.");
      }

      console.log(`Proceeding with entrypoint.deposit for ${token.symbol}...`);
      const tx = await contract.deposit(tokenAddress, decAmount, commitmentData.precommitment);
      console.log("Deposit tx sent (ERC20):", tx.hash);
      receipt = await tx.wait();
      if (!receipt) throw new Error("Receipt is null after deposit tx");
      console.log("Deposit tx mined (ERC20):", receipt.hash);
    }

    // 3) Parse LeafInserted from MerkleTree logs
    const provider = getProvider();
    if (!provider) throw new Error("Provider not found");

    const entrypointRead = await getEntrypointContract(provider);
    const vaultAddr = await entrypointRead.getVault(tokenAddress);
    console.log("Vault (read):", vaultAddr);

    const vaultContract = new Contract(vaultAddr, vaultAbi, provider);
    const merkleTreeAddress: string = await vaultContract.merkleTree();
    console.log("MerkleTree address:", merkleTreeAddress);

    const LEAF_INSERTED_TOPIC = ethers.id("LeafInserted(uint256,uint256,uint256)");
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const leafLog = receipt.logs.find(
      (l): l is Log =>
        l.address.toLowerCase() === merkleTreeAddress.toLowerCase() &&
        l.topics[0] === LEAF_INSERTED_TOPIC
    );

    if (!leafLog) {
      console.error("All logs from receipt:", receipt.logs);
      throw new Error("'LeafInserted' event log not found in transaction receipt");
    }

    const [, leafBN] = abiCoder.decode(['uint256', 'uint256', 'uint256'], leafLog.data);
    const commitment = leafBN.toString();

    // Write encrypted note under the final commitment key, then remove the temp hint.
    // Temp hint is removed AFTER writeNote succeeds so secrets are never orphaned.
    finalDepositId = `${currentChainId()}-${_token}-${commitment}`;
    try {
      const { writeNote } = await import('./localNoteStore');
      await writeNote(finalDepositId, {
        nullifier:     commitmentData.nullifier,
        secret:        commitmentData.secret,
        commitment,
        precommitment: commitmentData.precommitment,
        nullifierHash: commitmentData.nullifierHash ?? '',
        amount:        _amount,
        spent:         false,
      }, signer);
      localStorage.removeItem(depositId!);
    } catch (e) {
      console.warn('Encrypted localStorage write failed — temp hint preserved for recovery:', e);
      // Don't remove depositId — the pending hint still holds the secrets
    }

    // Save commitment to Supabase (localStorage is fallback)
    try {
      const { postCommitment } = await import('./commitmentStore');
      await postCommitment(
        signer,
        {
          nullifier:     commitmentData.nullifier,
          secret:        commitmentData.secret,
          commitment,
          amount:        _amount,
          chainId:       currentChainId(),
          nullifierHash: commitmentData.nullifierHash ?? '',
          precommitment: commitmentData.precommitment,
        },
        _token,
        'deposit',
      );
    } catch (e) {
      console.warn('Server commitment save failed, localStorage fallback active', e);
    }

    console.log("✅ Deposit successful!");
    invalidateLeafCache();
    console.log("Precommitment:", commitmentData.precommitment);
    console.log("Commitment (from event):", commitment);
    console.log("Transaction hash:", receipt.hash);

    return { success: true, executeTransaction: receipt.hash };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error during deposit:", message);
    // Only remove the temp hint if the tx never mined (finalDepositId not set).
    // If the tx mined but writeNote failed, keep the hint — it holds the secrets for recovery.
    if (depositId && !finalDepositId) {
      const raw = localStorage.getItem(depositId);
      // If hint has no nullifier the tx never sent — safe to remove.
      // If it has nullifier the tx may have mined — keep it for recovery.
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed.nullifier) localStorage.removeItem(depositId);
      } catch {
        localStorage.removeItem(depositId);
      }
    }
    return { success: false, error: message };
  }
}


// --------- Pay Execution Fee Implementation ----------
export async function payExecutionFee(
  _token: string,
  _executionPrice: string,
  _amount: string,
  _stateRoot: string,
  _nullifier: string,
  _newCommitment: string,
  _pA: [string, string],
  _pB: [[string, string], [string, string]],
  _pC: [string, string]
) {
  console.log("💳 payExecutionFee() called", { 
    _token, 
    _executionPrice, 
    _amount,
    _nullifier: _nullifier.substring(0, 20) + "..."
  });

  const signer = getSigner();
  if (!signer) {
    console.error("❌ Wallet not connected");
    return { success: false, error: 'Wallet not connected' };
  }

  const token = TOKEN_MAP[_token.toUpperCase()];
  if (!token) {
    console.error("❌ Token not supported:", _token);
    return { success: false, error: `Token not supported: ${_token.toUpperCase()}` };
  }

  try {
    const tokenAddress = token.symbol === 'ETH' ? NATIVE_TOKEN : token.address;
    const decExecutionPrice = ethers.parseUnits(_executionPrice, token.decimals);
    const decAmount = ethers.parseUnits(_amount, token.decimals);
    
    console.log("📊 Fee payment details:", {
      token: token.symbol,
      executionPrice: _executionPrice,
      executionPriceWei: decExecutionPrice.toString(),
      amount: _amount,
      amountWei: decAmount.toString()
    });

    const contract = await getEntrypointContract(signer);
    const payFeeFn = contract.getFunction('payExecutionFee');

    // Check if fee already paid for this nullifier
    try {
      console.log("🔍 Checking if fee already paid for nullifier...");
      const paidAmount = await contract.feePayments(_nullifier);
      if (paidAmount > 0n) {
        console.error("❌ Fee already paid for this operation:", paidAmount.toString());
        return { 
          success: false, 
          error: `Fee already paid: ${ethers.formatUnits(paidAmount, token.decimals)} ${token.symbol}` 
        };
      }
      console.log("✅ Nullifier not used, proceeding with payment");
    } catch (e) {
      console.warn("⚠️ Could not check fee payment status, continuing:", e);
    }

    // Dry-run with staticCall
    try {
      console.log("🧪 Performing payExecutionFee.staticCall (dry-run)...");
      await payFeeFn.staticCall(
        tokenAddress,
        decExecutionPrice.toString(),
        decAmount.toString(),
        _stateRoot,
        _nullifier,
        _newCommitment,
        _pA,
        _pB,
        _pC,
        { value: token.symbol === 'ETH' ? decExecutionPrice : 0n }
      );
      console.log("✅ payExecutionFee.staticCall succeeded - proof validated (dry-run)");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("❌ payExecutionFee.staticCall reverted:", message);
      return { success: false, error: `Proof validation failed: ${message}` };
    }

    // Send actual fee payment transaction
    try {
      console.log("📤 Sending payExecutionFee transaction...");
      const tx = await payFeeFn(
        tokenAddress,
        decExecutionPrice.toString(),
        decAmount.toString(),
        _stateRoot,
        _nullifier,
        _newCommitment,
        _pA,
        _pB,
        _pC,
        { value: token.symbol === 'ETH' ? decExecutionPrice : 0n }
      ) as TransactionResponse;
      console.log("✅ Fee payment tx sent:", tx.hash);

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Fee payment tx was not mined (receipt null)");
      console.log("✅ Fee payment tx mined:", receipt.hash);

      // Parse ExecutionFeePaid event
      const provider = getProvider();
      if (provider) {
        const entrypointRead = await getEntrypointContract(provider);
        const iface = entrypointRead.interface;
        const feePaidEvent = receipt.logs
          .map(log => {
            try {
              return iface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed): parsed is ethers.LogDescription => 
            parsed?.name === 'ExecutionFeePaid'
          );

        if (feePaidEvent) {
          console.log("💰 ExecutionFeePaid event:", {
            asset: feePaidEvent.args.asset,
            executionPrice: feePaidEvent.args.executionPrice.toString(),
            nullifier: feePaidEvent.args.nullifier.toString(),
            newCommitment: feePaidEvent.args.newCommitment.toString()
          });
        }
      }

      console.log("✅ Fee payment successful!");
      return { success: true, transactionHash: receipt.hash };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("❌ Error during fee payment transaction:", message);
      
      // Parse common errors
      if (message.includes("Fee already paid") || message.includes("FeeAlreadyPaid")) {
        return { success: false, error: "Fee already paid for this operation" };
      }
      if (message.includes("InvalidZKProof") || message.includes("Invalid ZK proof")) {
        return { success: false, error: "Invalid ZK proof - commitment verification failed" };
      }
      if (message.includes("VaultNotFound")) {
        return { success: false, error: "Vault not found for this asset" };
      }
      if (message.includes("NullifierAlreadySpent")) {
        return { success: false, error: "Nullifier already spent - commitment already used" };
      }
      
      return { success: false, error: message };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error during payExecutionFee:", message);
    return { success: false, error: message };
  }
}

// --------- Withdraw Implementation ----------
export async function withdraw(_token: string, _amount: string, _recipient: string) {
  console.log("withdraw() called", { _token, _amount, _recipient });

  const signer = getSigner();
  if (!signer) {
    console.error("Wallet not connected");
    return { success: false, error: 'Wallet not connected' };
  }

  const token = TOKEN_MAP[_token.toUpperCase()];
  if (!token) {
    console.error("Token not supported for withdraw:", _token);
    return { success: false, error: `Token not supported: ${_token}` };
  }

  // Convert to TokenInfo format for zkHandler
  const tokenInfo: TokenInfo = {
    symbol: token.symbol,
    decimals: token.decimals,
    address: token.address
  };

  // Background pool refill — tops up spare precommitments before proof gen starts.
  // Not awaited; claimFromPool inside generateZKData handles an empty pool itself.
  try {
    const { ensurePool } = await import('./sparePool');
    ensurePool(signer);
  } catch { /* best-effort */ }

  // Auto-merge if user has ≥6 unspent notes — the circuit cap is N=6.
  try {
    const { consolidateIfNeeded } = await import('./noteConsolidator');
    const mergeResult = await consolidateIfNeeded(currentChainId(), tokenInfo);
    if ('error' in mergeResult) {
      console.warn('[withdraw] consolidation failed (non-blocking):', mergeResult.error);
    } else if ('merged' in mergeResult && mergeResult.merged) {
      console.log('[withdraw] Auto-merged notes before withdrawal:', mergeResult.key);
    }
  } catch (e) {
    console.warn('[withdraw] consolidation threw (non-blocking):', e);
  }

  try {
    // 1) Generate ZK data using zkHandler
    console.log("Generating ZK data for withdrawal...");
    const zkDataResult = await generateZKData(currentChainId(), tokenInfo, _amount, _recipient);

    if ('error' in zkDataResult) {
      return { success: false, error: zkDataResult.error };
    }

    const zkData = zkDataResult;
    const withdrawalTxData = zkData.withdrawalTxData;

    console.log("ZK data generated successfully");

    const tokenAddress = token.symbol === 'ETH' ? NATIVE_TOKEN : token.address;
    const entrypoint = await getEntrypointContract(signer);
    const withdrawFn = entrypoint.getFunction('withdraw');

    // 2) Dry-run with staticCall using multi-note calldata
    try {
      console.log("Performing withdraw.staticCall (dry-run)...");
      await withdrawFn.staticCall(
        tokenAddress,
        _recipient,
        withdrawalTxData.amount.toString(),
        withdrawalTxData.stateRoot,
        withdrawalTxData.nullifierHashes,
        withdrawalTxData.changeCommitment,
        withdrawalTxData.pA,
        withdrawalTxData.pB,
        withdrawalTxData.pC
      );
      console.log("withdraw.staticCall succeeded - proof validated on-chain (dry-run).");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("withdraw.staticCall reverted:", message);
      return { success: false, error: message };
    }

    // 3) Send actual withdrawal transaction
    try {
      console.log("Sending withdraw transaction...");
      const tx = await withdrawFn(
        tokenAddress,
        _recipient,
        withdrawalTxData.amount.toString(),
        withdrawalTxData.stateRoot,
        withdrawalTxData.nullifierHashes,
        withdrawalTxData.changeCommitment,
        withdrawalTxData.pA,
        withdrawalTxData.pB,
        withdrawalTxData.pC
      ) as TransactionResponse;
      console.log("Withdraw tx sent:", tx.hash);

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Withdrawal tx was not mined (receipt null)");
      console.log("Withdraw tx mined:", receipt.hash);

      // 4) Mark ALL spent notes — localStorage and server commitments table
      try {
        const { markNoteSpent } = await import('./localNoteStore');
        const { markCommitmentSpent } = await import('./commitmentStore');
        for (const key of zkData.spentDepositKeys) {
          markNoteSpent(key);
          const serverId = zkData.serverCommitmentIds[key];
          if (serverId) {
            markCommitmentSpent(signer, serverId, 'true').catch(e =>
              console.warn('Failed to mark server commitment spent:', key, e)
            );
          }
        }
      } catch {
        console.warn("Failed to mark local deposits spent");
      }

      // 5) Save change note only when changeValue > 0.
      // Zero-value change notes are on-chain (circuit always inserts a leaf) but have no
      // spendable value — no point tracking them in localStorage or the commitments table.
      if (zkData.changeValue > 0n) {
        try {
          const { writeNote } = await import('./localNoteStore');
          await writeNote(zkData.newDepositKey, {
            nullifier:     zkData.newDeposit.nullifier,
            secret:        zkData.newDeposit.secret,
            commitment:    zkData.newDeposit.commitment!,
            precommitment: zkData.newDeposit.precommitment,
            nullifierHash: zkData.newDeposit.nullifierHash ?? '',
            amount:        zkData.newDeposit.amount,
            spent:         false,
          }, signer);
        } catch (e) {
          console.warn('Encrypted change note write failed:', e);
        }
        console.log("Saved change commitment locally:", zkData.newDepositKey);

        // Sync change note to Supabase commitments table (best-effort)
        try {
          const { postCommitment } = await import('./commitmentStore');
          await postCommitment(
            signer,
            {
              nullifier:     zkData.newDeposit.nullifier,
              secret:        zkData.newDeposit.secret,
              commitment:    zkData.newDeposit.commitment!,
              amount:        zkData.newDeposit.amount,
              chainId:       currentChainId(),
              nullifierHash: zkData.newDeposit.nullifierHash ?? '',
              precommitment: zkData.newDeposit.precommitment,
            },
            _token,
            'change',
          );
        } catch (e) {
          console.warn('Change note server save failed, localStorage fallback active', e);
        }
      }

      // Resolve the pool precommitment now that the change note is confirmed on-chain.
      if (zkData.changePoolId) {
        try {
          const { resolvePrecommitment } = await import('./precommitmentStore');
          await resolvePrecommitment(signer, zkData.changePoolId);
        } catch (e) {
          console.warn('[pool] Failed to resolve pool precommitment:', e);
        }
        // Refill pool async so the next withdrawal has entries ready.
        try {
          const { ensurePool } = await import('./sparePool');
          ensurePool(signer);
        } catch { /* best-effort */ }
      }

      // Invalidate the leaf cache so the next withdrawal/balance refresh sees the
      // updated tree: spent leaves gone, change leaf added.
      invalidateLeafCache();

      return { success: true, transactionHash: receipt.hash };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error during withdraw transaction:", message);
      // Release pool entry so it can be reused by the next withdrawal attempt.
      if (zkData.changePoolId) {
        try {
          const { releasePrecommitment } = await import('./precommitmentStore');
          await releasePrecommitment(signer, zkData.changePoolId);
        } catch { /* best-effort */ }
      }
      return { success: false, error: message };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error during withdraw:", message);
    return { success: false, error: message };
  }
}