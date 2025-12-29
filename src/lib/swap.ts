import { ethers } from 'ethers';
import { generateZKData } from './zkHandler'; // Removed encodeProof as it's not needed
import entrypointArtifact from "../../contract/artifacts/src/Entrypoint.sol/Entrypoint.json";

const SEPOLIA_CHAIN_ID = 11155111;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const ENTRYPOINT_ADDRESS = '0x1565E62bfdAc6b2c6b81cc1C6c76367747D5FAB3';
const FEE = 3000;
const MIN_AMOUNT_OUT = 0;

// Token configuration
const TOKENS = {
    ETH: {
        symbol: 'ETH',
        address: NATIVE_TOKEN,
        decimals: 18
    },
    USDC: {
        symbol: 'USDC',
        address: USDC_ADDRESS,
        decimals: 6
    }
};

const ENTRYPOINT_ABI = entrypointArtifact.abi as ethers.InterfaceAbi;

export async function instantSwap(
    _pool: string, // New parameter
    _srcToken: string,
    _dstToken: string,
    _amount: string,
    _recipient: string,
    provider: ethers.Provider,
    signer: ethers.Signer
) {
    try {
        const srcTokenUpper = _srcToken.toUpperCase();
        const dstTokenUpper = _dstToken.toUpperCase();

        if (!['ETH', 'USDC'].includes(srcTokenUpper) || !['ETH', 'USDC'].includes(dstTokenUpper)) {
            return { success: false, error: "Only ETH and USDC are supported for now" };
        }
        if (srcTokenUpper === dstTokenUpper) {
            return { success: false, error: "source and destination tokens must be different" };
        }

        const srcToken = TOKENS[srcTokenUpper as keyof typeof TOKENS];
        const dstToken = TOKENS[dstTokenUpper as keyof typeof TOKENS];
        const srcAmount = ethers.parseUnits(_amount, srcToken.decimals);
        
        console.log(`Swap - Chain: ${SEPOLIA_CHAIN_ID}, From ${srcAmount.toString()} ${srcToken.symbol} to ${dstToken.symbol}`);
        // Generate ZK data
        const zkData = await generateZKData(
            SEPOLIA_CHAIN_ID,
            { symbol: srcToken.symbol, decimals: srcToken.decimals, address: srcToken.address},
            _amount,
            _recipient
        );

        if ('error' in zkData) {
            return { success: false, error: zkData.error };
        }

        const withdrawalTxData = zkData.withdrawalTxData as {
            recipient: string;
            amount: string;
            nullifierHash: string;
            newCommitment: string;
            proof: (string | bigint)[]; // proof can be string[] or bigint[]
            publicSignals: string[];
            stateRoot: string; // stateRoot is now part of withdrawalTxData
        };

        const zkProofStruct = {
            stateRoot: withdrawalTxData.stateRoot,
            nullifier: withdrawalTxData.nullifierHash,
            newCommitment: withdrawalTxData.newCommitment,
            // Ensure proof elements are BigInts for ethers
            proof: withdrawalTxData.proof.map(p => typeof p === 'string' ? BigInt(p) : p)
        };


        const contract = new ethers.Contract(ENTRYPOINT_ADDRESS, ENTRYPOINT_ABI, signer);
        // Corrected txParams for the new Entrypoint.swap signature
        const txParams = [
            _pool,
            srcToken.address,
            dstToken.address,
            _recipient,
            srcAmount,
            MIN_AMOUNT_OUT,
            FEE,
            zkProofStruct // Pass the ZKProof struct
        ];

        // swap transaction
        const tx = await contract.swap(...txParams, {
            ...(srcTokenUpper === 'ETH' ? { value: srcAmount } : {})
        });
        console.log("Transaction submitted:", tx.hash);

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        if (receipt && receipt.status === 1) {
            // Store new commitment if remaining balance > 0
            if (zkData.changeValue > 0n) {
                localStorage.setItem(zkData.newDepositKey, JSON.stringify(zkData.newDeposit));
            }
            if (zkData.spentDepositKey) {
                localStorage.setItem(zkData.spentDepositKey, JSON.stringify({
                    ...zkData.spentDeposit,
                    spent: true
                }));
            }
            return {
                success: true,
                data: receipt.hash,
                transactionHash: receipt.hash,
                blockNumber: receipt.blockNumber
            };
        }
        return { success: false, error: "Transaction failed" };
    } catch (error: unknown) {
        console.error("Error during swap:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
    }
}

// Helper to get provider and signer
export async function getEthersProviderAndSigner() {
    if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error("MetaMask or Web3 provider not found");
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Check if we're on Sepolia
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
        throw new Error(`Please switch to Sepolia network. Current network: ${network.chainId}`);
    }

    return { provider, signer };
}

export async function executeSwap(
    _pool: string, // New parameter
    srcToken: string,
    dstToken: string,
    amount: string,
    recipient: string
) {
    try {
        const { provider, signer } = await getEthersProviderAndSigner();
        // Pass _pool to instantSwap
        const result = await instantSwap(_pool, srcToken, dstToken, amount, recipient, provider, signer);
        return result;
    } catch (error) {
        console.error("Error executing swap:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}