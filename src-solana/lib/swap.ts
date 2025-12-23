import { ethers } from 'ethers';
import { getSigner, TOKEN_MAP } from './nexus';
import { generateZKData, encodeProof, TokenInfo } from './zkHandler';
import { getEntrypointContract } from './handler';
import { TransactionResponse } from 'ethers';

// --------- Constants ----------
const VAULT_CHAIN_ID = 11155111; // Vault contract is located in ETH Sepolia
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ENTRYPOINT_ADDRESS = '0x046f21d540C438ea830E735540Ae20bc9b32aB28';
const FEE = 3000;
const MIN_AMOUNT_OUT = 0;

export async function instantSwap(
  _srcToken: string,
  _dstToken: string,
  _amount: string,
  _recipient: string
) {
  console.log("instantSwap() called", { _srcToken, _dstToken, _amount, _recipient });

  const signer = getSigner();
  if (!signer) {
    console.error("Wallet not connected");
    return { success: false, error: 'Wallet not connected' };
  }

  // Get token data from TOKEN_MAP
  const srcToken = TOKEN_MAP[_srcToken.toUpperCase()];
  const dstToken = TOKEN_MAP[_dstToken.toUpperCase()];

  if (!srcToken || !dstToken) {
    console.error("Token not supported for swap:", { _srcToken, _dstToken });
    return { success: false, error: "Token not supported" };
  }

  // Convert to TokenInfo format for zkHandler
  const srcTokenInfo: TokenInfo = {
    symbol: srcToken.symbol,
    decimals: srcToken.decimals,
    address: srcToken.address
  };

  const dstTokenInfo: TokenInfo = {
    symbol: dstToken.symbol,
    decimals: dstToken.decimals,
    address: dstToken.address
  };

  // Process parameter data
  const srcTokenAddress = srcToken.symbol === 'ETH' ? NATIVE_TOKEN : srcToken.address;
  const dstTokenAddress = dstToken.symbol === 'ETH' ? NATIVE_TOKEN : dstToken.address;
  const srcAmount = BigInt(
    ethers.parseUnits(_amount, srcToken.decimals).toString()
  ).toString();

  console.log(`Swap - Chain: ${VAULT_CHAIN_ID}, From ${srcAmount} ${srcToken.symbol} to ${dstToken.symbol}`);

  try {
    // 1) Generate ZK Data using zkHandler
    console.log("Generating ZK data for swap...");
    const zkDataResult = await generateZKData(VAULT_CHAIN_ID, srcTokenInfo, _amount, _recipient);

    if ('error' in zkDataResult) {
      return { success: false, error: zkDataResult.error };
    }

    const zkData = zkDataResult;
    const withdrawalTxData = zkData.withdrawalTxData;

    console.log("ZK data generated successfully for swap");
    console.log("Token Address (src):", srcTokenAddress);
    console.log("Token Address (dst):", dstTokenAddress);
    console.log("Amount:", srcAmount);
    console.log("Nullifier:", withdrawalTxData.nullifierHash.toString());
    console.log("newCommitment:", withdrawalTxData.newCommitment.toString());
    console.log("Proof length:", Array.isArray(withdrawalTxData.proof) ? withdrawalTxData.proof.length : 'invalid');

    // 2) Get entrypoint contract
    const entrypoint = await getEntrypointContract(signer);

    // 3) Execute swap transaction
    console.log("Sending swap transaction...");
    const tx: TransactionResponse = await (entrypoint as any).swap(
      srcTokenAddress,
      dstTokenAddress,
      _recipient,
      srcAmount,
      MIN_AMOUNT_OUT,
      FEE,
      withdrawalTxData.nullifierHash.toString(),
      withdrawalTxData.newCommitment.toString(),
      encodeProof(withdrawalTxData.proof)
    );

    console.log("Swap tx sent:", tx.hash);

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Swap tx was not mined (receipt null)");
    }

    console.log("Swap tx mined:", receipt.hash ?? receipt.hash);

    // 4) Update localStorage
    // Store new commitment if remaining_balance > 0
    if (zkData.changeValue > 0n) {
      localStorage.setItem(zkData.newDepositKey, JSON.stringify(zkData.newDeposit));
      console.log("Saved change commitment after swap:", zkData.newDepositKey);
    }

    // Mark spent deposit
    if (zkData.spentDepositKey) {
      localStorage.setItem(
        zkData.spentDepositKey,
        JSON.stringify({ ...zkData.spentDeposit, spent: true })
      );
      console.log("Marked deposit as spent after swap:", zkData.spentDepositKey);
    }

    return { success: true, data: receipt.hash ?? receipt.hash };
  } catch (error: unknown) {
    console.error("Error during swap:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during swap'
    };
  }
}