import { getSigner, getProvider, TOKEN_MAP } from './nexus';
import { ethers, Interface, Log, Contract, TransactionResponse, TransactionReceipt, BrowserProvider, Signer} from 'ethers';
import { generateCommitmentData, generateZKData, TokenInfo } from './zkHandler';
import entrypointArtifact from "../../contract/artifacts/src/Entrypoint.sol/Entrypoint.json";
import nativeVaultAbiJson from './abi/NativeVault.json';
import merkleTreeAbiJson from './abi/MerkleTree.json';

// --------- Constants ----------
const VAULT_CHAIN_ID = 11155111; // Sepolia id
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ENTRYPOINT_ADDRESS = '0x046f21d540C438ea830E735540Ae20bc9b32aB28';

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

  try {
    // 1) Generate commitment data using zkHandler
    console.log("Generating commitment data...");
    const commitmentData = await generateCommitmentData(VAULT_CHAIN_ID, tokenInfo, _amount);

    const decAmount = ethers.parseUnits(_amount, token.decimals).toString();
    const tokenAddress = token.symbol === 'ETH' ? NATIVE_TOKEN : token.address;

    // Save secrets locally before transaction (with precommitment as temp key)
    const depositId = `${VAULT_CHAIN_ID}-${_token}-${commitmentData.precommitment}`;
    localStorage.setItem(depositId, JSON.stringify(commitmentData));
    console.log("Stored deposit hint in localStorage:", depositId);

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
      console.log("Deposit tx mined (ETH):", receipt.hash ?? receipt.hash);
    } else {
      console.log(`Approving ${token.symbol} for vault...`);
      const tokenContract = new Contract(
        token.address,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        signer
      );
      const vaultAddress = await contract.getVault(tokenAddress);
      console.log("Vault address for token:", vaultAddress);

      const approveTx = await tokenContract.approve(vaultAddress, decAmount);
      console.log("Approve tx sent:", approveTx.hash);
      const approveReceipt = await approveTx.wait();
      if (!approveReceipt) throw new Error("Approve receipt is null");
      console.log("Approve tx mined:", approveReceipt.hash ?? approveReceipt.transactionHash);

      console.log(`Calling entrypoint.deposit for ${token.symbol}...`);
      const tx = await contract.deposit(tokenAddress, decAmount, commitmentData.precommitment);
      console.log("Deposit tx sent (ERC20):", tx.hash);
      receipt = await tx.wait();
      if (!receipt) throw new Error("Receipt is null after deposit tx");
      console.log("Deposit tx mined (ERC20):", receipt.hash ?? receipt.hash);
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
    const finalDepositId = `${VAULT_CHAIN_ID}-${_token}-${commitment}`;
    localStorage.removeItem(depositId); // Remove temp key
    localStorage.setItem(finalDepositId, JSON.stringify({
      ...commitmentData,
      commitment
    }));

    console.log("✅ Deposit successful!");
    console.log("Precommitment:", commitmentData.precommitment);
    console.log("Commitment (from event):", commitment);
    console.log("Transaction hash:", receipt.hash ?? receipt.hash);

    return { success: true, executeTransaction: receipt.hash ?? receipt.hash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error during deposit:", message);
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
      console.log("Withdraw tx mined:", receipt.hash ?? receipt.hash);

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

      return { success: true, transactionHash: receipt.hash ?? receipt.hash };
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