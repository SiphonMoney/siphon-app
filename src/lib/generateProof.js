import { buildPoseidon } from "circomlibjs";
import * as snarkjs from 'snarkjs';

const WASM_PATH = '/zk/main.wasm';
const ZKEY_PATH = '/zk/circuit.zkey';

/**
 * Generate Groth16 ZK proof for withdrawal.
 * Public signals order (matches circuit):
 *   [withdrawnValue, stateRoot, newCommitment, nullifierHash, recipient, pool, dstToken, fee, minAmountOut]
 * For plain withdraw / fee payment, set pool, dstToken, fee, minAmountOut to 0.
 */
export async function generateWithdrawalProof(withdrawalData) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const existingValue     = BigInt(withdrawalData.existingValue);
  const existingNullifier = BigInt(withdrawalData.existingNullifier);
  const existingSecret    = BigInt(withdrawalData.existingSecret);
  const withdrawnValue    = BigInt(withdrawalData.withdrawnValue);
  const newNullifier      = BigInt(withdrawalData.newNullifier);
  const newSecret         = BigInt(withdrawalData.newSecret);
  const stateRoot         = withdrawalData.stateRoot;
  const recipient         = withdrawalData.recipient;
  const pool              = withdrawalData.pool ?? 0;
  const dstToken          = withdrawalData.dstToken ?? 0;
  const fee               = withdrawalData.fee ?? 0;
  const minAmountOut      = withdrawalData.minAmountOut ?? 0;

  if (existingValue < withdrawnValue) {
    throw new Error("Withdrawal amount exceeds existing value.");
  }

  const nullifierHash    = F.toString(poseidon([existingNullifier]));
  const remainingValue   = existingValue - withdrawnValue;
  const newPrecommitment = F.toString(poseidon([newNullifier, newSecret]));
  const newCommitment    = F.toString(poseidon([remainingValue, newPrecommitment]));

  // recipient as uint160 decimal string (matches circuit `recipient` signal)
  const recipientField = BigInt(recipient).toString();

  const input = {
    // Public inputs (must match circuit signal order)
    withdrawnValue:    withdrawnValue.toString(),
    stateRoot:         stateRoot.toString(),
    newCommitment:     newCommitment,
    nullifierHash:     nullifierHash,
    recipient:         recipientField,
    pool:              BigInt(pool).toString(),
    dstToken:          BigInt(dstToken).toString(),
    fee:               BigInt(fee).toString(),
    minAmountOut:      BigInt(minAmountOut).toString(),
    // Private inputs
    existingValue:     existingValue.toString(),
    existingNullifier: existingNullifier.toString(),
    existingSecret:    existingSecret.toString(),
    newNullifier:      newNullifier.toString(),
    newSecret:         newSecret.toString(),
    pathElements:      withdrawalData.pathElements.map(el => el.toString()),
    pathIndices:       withdrawalData.pathIndices,
  };

  console.log("[generateProof] Running Groth16 fullProve...");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
  console.log(`[generateProof] Proof generated in ${Date.now() - t0}ms`);

  return { proof, publicSignals, nullifierHash, newCommitment, stateRoot };
}

/**
 * Convert Groth16 proof to Solidity pA / pB / pC calldata format.
 * snarkjs groth16 proof fields: pi_a, pi_b, pi_c
 * BN254 G2 points: snarkjs gives [x[0], x[1]] as [c0, c1]; Solidity verifier expects [c1, c0].
 */
export function proofToCalldata(proof) {
  const str = v => BigInt(v).toString();

  return {
    pA: [str(proof.pi_a[0]), str(proof.pi_a[1])],
    pB: [
      [str(proof.pi_b[0][1]), str(proof.pi_b[0][0])],
      [str(proof.pi_b[1][1]), str(proof.pi_b[1][0])],
    ],
    pC: [str(proof.pi_c[0]), str(proof.pi_c[1])],
  };
}

/**
 * Verify proof locally against the verification key before submitting on-chain.
 */
export async function verifyProofLocally(proof, publicSignals) {
  try {
    const vKey = await fetch('/zk/verification_key.json').then(r => r.json());
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    console.log("[generateProof] Local verification:", isValid ? "✅ Valid" : "❌ Invalid");
    return isValid;
  } catch (err) {
    console.error("[generateProof] Local verification error:", err);
    return false;
  }
}

/**
 * Full pipeline: generate Groth16 proof and return everything handler.ts needs
 * to call withdraw() on-chain.
 */
export async function prepareWithdrawalTransaction(params) {
  const {
    existingValue, existingNullifier, existingSecret,
    withdrawnValue, newNullifier, newSecret,
    pathElements, pathIndices,
    recipient, stateRoot,
  } = params;

  const { proof, publicSignals, nullifierHash, newCommitment } =
    await generateWithdrawalProof({
      existingValue, existingNullifier, existingSecret,
      withdrawnValue, newNullifier, newSecret,
      pathElements, pathIndices,
      recipient, stateRoot,
    });

  const { pA, pB, pC } = proofToCalldata(proof);

  return {
    recipient,
    amount:       withdrawnValue,
    nullifierHash,
    newCommitment,
    stateRoot,
    pA,
    pB,
    pC,
    publicSignals,
  };
}
