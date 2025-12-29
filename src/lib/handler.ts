import { getSigner, getProvider, TOKEN_MAP, getTokenAllowance, approveToken } from './nexus';
import { ethers, Interface, Log, Contract, TransactionResponse, TransactionReceipt, BrowserProvider, Signer} from 'ethers';
import { generateCommitmentData, generateZKData, TokenInfo } from './zkHandler';
import entrypointArtifact from "../../contract/artifacts/src/Entrypoint.sol/Entrypoint.json";
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';

// --------- Constants ----------
const VAULT_CHAIN_ID = 11155111; // Sepolia id
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ENTRYPOINT_ADDRESS = '0x1565E62bfdAc6b2c6b81cc1C6c76367747D5FAB3';

// --------- ABIs & interface helpers ----------
const entrypointAbi = entrypointArtifact.abi as ethers.InterfaceAbi;
const vaultAbi = nativeVaultAbiJson.abi as ethers.InterfaceAbi;
const merkleTreeAbi = merkleTreeAbiJson.abi as ethers.InterfaceAbi;
const merkleTreeInterface = new Interface(merkleTreeAbi);

// --------- getEntrypointContract ----------
export async function getEntrypointContract(
  signerOrProvider: Signer | BrowserProvider
): Promise<Contract> {

  let actor: Signer | BrowserProvider = signerOrProvider;

  if (actor instanceof BrowserProvider) {
    actor = await actor.getSigner();
  }

  const contract = new Contract(
    ENTRYPOINT_ADDRESS,
    entrypointAbi,
    actor
  );

  return contract;
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
    const commitmentData = await generateCommitmentData(VAULT_CHAIN_ID, tokenInfo, _amount);

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

      let currentAllowance = await getTokenAllowance(tokenAddress, signerAddress, ENTRYPOINT_ADDRESS);
      console.log(`Initial allowance for ${token.symbol} (raw): ${currentAllowance.toString()}`);
      console.log(`Initial allowance for ${token.symbol}: ${ethers.formatUnits(currentAllowance, token.decimals)}`);
      console.log(`Deposit amount (raw): ${decAmount.toString()}`);
      console.log(`Deposit amount: ${ethers.formatUnits(decAmount, token.decimals)}`);

      if (currentAllowance < decAmount) {
        console.log(`Insufficient allowance. Approving ${token.symbol} for Entrypoint...`);
        try {
          const approveTx = await approveToken(tokenAddress, ENTRYPOINT_ADDRESS, ethers.MaxUint256);
          console.log("Approve tx sent:", approveTx.hash);
          const approveReceipt = await approveTx.wait();
          if (!approveReceipt) throw new Error("Approve receipt is null");
          console.log("Approve tx mined:", approveReceipt.hash);

          currentAllowance = await getTokenAllowance(tokenAddress, signerAddress, ENTRYPOINT_ADDRESS);
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
    depositId = `${VAULT_CHAIN_ID}-${_token}-${commitmentData.precommitment}`;
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

    const depositLog = receipt.logs
      .filter((l): l is Log => l.address.toLowerCase() === merkleTreeAddress.toLowerCase())
      .map(l => {
        try {
          return merkleTreeInterface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((pl): pl is ethers.LogDescription => pl?.name === 'LeafInserted');

    if (!depositLog) {
      console.error("All logs from receipt:", receipt.logs);
      throw new Error("'LeafInserted' event log not found in transaction receipt");
    }

    const commitment = depositLog.args._leaf.toString();

    // Update localStorage with commitment (use commitment as final key)
    finalDepositId = `${VAULT_CHAIN_ID}-${_token}-${commitment}`;
    localStorage.removeItem(depositId); // Remove temp key
    localStorage.setItem(finalDepositId, JSON.stringify({
      ...commitmentData,
      commitment
    }));

    console.log("✅ Deposit successful!");
    console.log("Precommitment:", commitmentData.precommitment);
    console.log("Commitment (from event):", commitment);
    console.log("Transaction hash:", receipt.hash);

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
    const zkDataResult = await generateZKData(VAULT_CHAIN_ID, tokenInfo, _amount, _recipient);

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
        withdrawalTxData.stateRoot || "0",
        withdrawalTxData.nullifierHash.toString(),
        withdrawalTxData.newCommitment.toString(),
        withdrawalTxData.proof
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
        withdrawalTxData.stateRoot || "0",
        withdrawalTxData.nullifierHash.toString(),
        withdrawalTxData.newCommitment.toString(),
        withdrawalTxData.proof
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