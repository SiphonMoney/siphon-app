import { getSigner, getProvider, TOKEN_MAP, getTokenAllowance, approveToken } from './nexus';
import { ethers, Interface, Log, Contract, TransactionResponse, TransactionReceipt, BrowserProvider, Signer} from 'ethers';
import { generateCommitmentData, generateZKData, TokenInfo, invalidateLeafCache } from './zkHandler';
import entrypointArtifact from "./abi/Entrypoint.json";
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';
import { getNetwork, getSelectedChainId, NATIVE_TOKEN as NATIVE } from './networks';
import { appendUserActivity } from './userActivityLog';

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

  let depositId: string | null = null; // Initialize depositId
  let finalDepositId: string | null = null; // Initialize finalDepositId

  try {
    // 1) Generate commitment data using zkHandler
    console.log("Generating commitment data...");
    const commitmentData = await generateCommitmentData(currentChainId(), tokenInfo, _amount);

    const decAmount = ethers.parseUnits(_amount, token.decimals);
    const tokenAddress = token.symbol === 'ETH' ? NATIVE_TOKEN : token.address;
    const signerAddress = await signer.getAddress();

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

    // Now that the transaction is successful, store the deposit hint locally
    depositId = `${currentChainId()}-${_token}-${commitmentData.precommitment}`;
    localStorage.setItem(depositId, JSON.stringify(commitmentData));
    console.log("Stored deposit hint in localStorage:", depositId);

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

    // Update localStorage with commitment (use commitment as final key)
    finalDepositId = `${currentChainId()}-${_token}-${commitment}`;
    localStorage.removeItem(depositId); // Remove temp key
    localStorage.setItem(finalDepositId, JSON.stringify({
      ...commitmentData,
      commitment
    }));

    // Save note to server (keep localStorage as fallback)
    try {
      const { postNote } = await import('./noteStore');
      await postNote(
        signer,
        { nullifier: commitmentData.nullifier, secret: commitmentData.secret, amount: _amount },
        commitment,
        commitmentData.nullifierHash ?? '',
        _token,
        currentChainId()
      );
    } catch (e) {
      console.warn('Server note save failed, localStorage fallback active', e);
    }

    console.log("✅ Deposit successful!");
    invalidateLeafCache();
    console.log("Precommitment:", commitmentData.precommitment);
    console.log("Commitment (from event):", commitment);
    console.log("Transaction hash:", receipt.hash);

    try {
      appendUserActivity(signerAddress, {
        kind: "deposit",
        chainId: currentChainId(),
        token: _token.toUpperCase(),
        amount: _amount,
        txHash: receipt.hash,
        status: "confirmed",
        label: `Deposit ${_amount} ${_token.toUpperCase()}`,
      });
    } catch {
      /* activity log is best-effort */
    }

    return { success: true, executeTransaction: receipt.hash };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error during deposit:", message);
    // If an error occurred, and depositId was set, remove it from localStorage
    if (depositId && !finalDepositId) {
      localStorage.removeItem(depositId);
      console.log("Removed temporary deposit hint from localStorage due to error:", depositId);
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

    // 2) Check if nullifier is already spent
    try {
      if (entrypoint.isNullifierSpent) {
        const spent = await entrypoint.isNullifierSpent(withdrawalTxData.nullifierHash.toString());
        console.log("isNullifierSpent:", spent);
        if (spent) {
          return { success: false, error: "Nullifier already spent" };
        }
      } else if (entrypoint.nullifiers) {
        try {
          const spent = await entrypoint.nullifiers(withdrawalTxData.nullifierHash.toString());
          console.log("nullifiers mapping lookup:", spent);
          if (spent) return { success: false, error: "Nullifier already spent" };
        } catch {
          console.log("nullifiers lookup not readable, continuing.");
        }
      } else {
        console.log("No nullifier-check API available; continuing.");
      }
    } catch (e) {
      console.warn("Error checking nullifier spent status:", e);
    }

    // 3) Dry-run with staticCall
    try {
      console.log("Performing withdraw.staticCall (dry-run)...");

      await withdrawFn.staticCall(
        tokenAddress,
        _recipient,
        withdrawalTxData.amount.toString(),
        withdrawalTxData.stateRoot,
        withdrawalTxData.nullifierHash.toString(),
        withdrawalTxData.newCommitment.toString(),
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

    // 4) Send actual withdrawal transaction
    try {
      console.log("Sending withdraw transaction...");
      const tx = await withdrawFn(
        tokenAddress,
        _recipient,
        withdrawalTxData.amount.toString(),
        withdrawalTxData.stateRoot,
        withdrawalTxData.nullifierHash.toString(),
        withdrawalTxData.newCommitment.toString(),
        withdrawalTxData.pA,
        withdrawalTxData.pB,
        withdrawalTxData.pC
      ) as TransactionResponse;
      console.log("Withdraw tx sent:", tx.hash);

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Withdrawal tx was not mined (receipt null)");
      console.log("Withdraw tx mined:", receipt.hash);

      // 5) Update localStorage
      // Mark spent deposit
      if (zkData.spentDepositKey) {
        try {
          localStorage.setItem(zkData.spentDepositKey, JSON.stringify({
            ...zkData.spentDeposit,
            spent: true
          }));
          console.log("Marked local deposit as spent:", zkData.spentDepositKey);
        } catch {
          console.warn("Failed to mark local deposit spent:");
        }
      }

      // Save change commitment if changeValue > 0
      if (zkData.changeValue > 0n) {
        localStorage.setItem(zkData.newDepositKey, JSON.stringify(zkData.newDeposit));
        console.log("Saved change commitment locally:", zkData.newDepositKey);
      }

      invalidateLeafCache();

      try {
        const wallet = await signer.getAddress();
        appendUserActivity(wallet, {
          kind: "withdraw",
          chainId: currentChainId(),
          token: _token.toUpperCase(),
          amount: _amount,
          txHash: receipt.hash,
          status: "confirmed",
          label: `Withdraw ${_amount} ${_token.toUpperCase()}`,
        });
      } catch {
        /* activity log is best-effort */
      }

      return { success: true, transactionHash: receipt.hash };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error during withdraw transaction:", message);
      return { success: false, error: message };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error during withdraw:", message);
    return { success: false, error: message };
  }
}