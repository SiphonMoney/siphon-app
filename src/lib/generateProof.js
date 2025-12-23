// prepareWithdrawalTransaction function orchestrates the entire process, generating the proof > converting it to calldata, and packaging it with recipient, amount and hashes for submission to the contract

import { buildPoseidon } from "circomlibjs";
const WASM_PATH = '/zk/main.wasm';
const ZKEY_PATH = '/zk/circuit.zkey';
const snarkjs = require('snarkjs');


/**
* Generate ZK proof for withdrawal
* @param {Object} withdrawalData - all withdrawal parameters
* @param {string} withdrawalData.existingValue - Original deposited value
* @param {string} withdrawalData.existingNullifier - Original nullifier
* @param {string} withdrawalData.existingSecret - Original secret
* @param {string} withdrawalData.withdrawnValue - Amount to withdraw
* @param {string} withdrawalData.newNullifier - New nullifier for remaining balance
* @param {string} withdrawalData.newSecret - New secret for remaining balance
* @param {Array} withdrawalData.pathElements - Merkle proof path elements
* @param {Array} withdrawalData.pathIndices - Merkle proof path indices
* @returns {Promise<import("./types").IZKProofResult>} { proof, publicSignals, nullifierHash, newCommitment }
*/


export async function generateWithdrawalProof(withdrawalData) {
try {
   console.log("Initializing Poseidon hash...");
   const poseidon = await buildPoseidon();
   const F = poseidon.F;

   // compute all required values
   const existingValue = BigInt(withdrawalData.existingValue);
   const existingNullifier = BigInt(withdrawalData.existingNullifier);
   const existingSecret = BigInt(withdrawalData.existingSecret);
   const withdrawnValue = BigInt(withdrawalData.withdrawnValue);
   const newNullifier = BigInt(withdrawalData.newNullifier);
   const newSecret = BigInt(withdrawalData.newSecret);
   const stateRoot = withdrawalData.stateRoot;

   // Client-side check for valid withdrawal amount
   if (existingValue < withdrawnValue) {
     throw new Error("Withdrawal amount exceeds existing value.");
   }

   console.log("Computing commitments (to match circuit)...");
  
   const nullifierHash = F.toString(poseidon([existingNullifier]));
   const existingPrecommitment = F.toString(poseidon([existingNullifier, existingSecret]));
   const existingCommitment = F.toString(poseidon([existingValue, existingPrecommitment]));
   const remainingValue = existingValue - withdrawnValue;
   const newPrecommitment = F.toString(poseidon([newNullifier, newSecret]));
   const newCommitment = F.toString(poseidon([remainingValue, newPrecommitment]));

const input = {
     withdrawnValue: withdrawnValue.toString(),
     stateRoot: stateRoot.toString(),
     newCommitment: newCommitment,
     nullifierHash: nullifierHash,
    
     // Private inputs
     existingValue: existingValue.toString(),
     existingNullifier: existingNullifier.toString(),
     existingSecret: existingSecret.toString(),
     newNullifier: newNullifier.toString(),
     newSecret: newSecret.toString(),
     pathElements: withdrawalData.pathElements.map(el => el.toString()),
     pathIndices: withdrawalData.pathIndices
   };
   console.log("Circuit inputs prepared:", input);

  // Generate witness
   console.log("Generating witness...");
   const { proof, publicSignals } = await snarkjs.plonk.fullProve(
     input,
     WASM_PATH,
     ZKEY_PATH
   );
   console.log("Proof generated successfully!");
   console.log("Public signals:", publicSignals);

   return {
     proof,
     publicSignals,
     nullifierHash,
     newCommitment,
     stateRoot
   };
   
 } catch (error) {
   console.error("Error generating proof:", error);
   throw error;
 }
}

/**
* Convert proof to Solidity calldata format
* @param {Object} proof - The proof object from snarkjs
* @returns {Array<string>} Array of 24 uint256 strings for Solidity
*/
export function proofToCalldata(proof) {
 // The verifier expects a proof uint256[24] array
 // snarkjs returns proof components as bigint or string, need ot convert all to decimal strings
 const proofArray = [
   proof.A[0], proof.A[1],
   proof.B[0], proof.B[1],
   proof.C[0], proof.C[1],
   proof.Z[0], proof.Z[1],
   proof.T1[0], proof.T1[1],
   proof.T2[0], proof.T2[1],
   proof.T3[0], proof.T3[1],
   proof.Wxi[0], proof.Wxi[1],
   proof.Wxiw[0], proof.Wxiw[1],
   proof.eval_a,
   proof.eval_b,
   proof.eval_c,
   proof.eval_s1,
   proof.eval_s2,
   proof.eval_zw
 ];
 
 // Convert all elements to BigInt, then to string to ensure proper formatting
 return proofArray.map(x => {
   if (typeof x === 'bigint') return x.toString();
   if (typeof x === 'number') return BigInt(x).toString();
   if (typeof x === 'string') return BigInt(x).toString();
   return x.toString();
 });
}

/**
* Verify proof locally before submitting (optional but recommended)
* @param {Object} proof - The proof object
* @param {Array} publicSignals - The public signals
* @returns {Promise<boolean>} True if valid
*/
export async function verifyProofLocally(proof, publicSignals) {
 try {
   // Load verification key
   const vKey = await fetch('/zk/verification_key.json').then(r => r.json());
   const isValid = await snarkjs.plonk.verify(vKey, publicSignals, proof);
   console.log("Local verification:", isValid ? "✅ Valid" : "❌ Invalid");
  
   return isValid;
 } catch (error) {
   console.error("Local verification error:", error);
   return false;
 }
}

/**
* @param {Object} params - Withdrawal parameters
* @returns {Promise<Object>} - Transaction data ready for contract call
*/
export async function prepareWithdrawalTransaction(params) {
const {
   existingValue,
   existingNullifier,
   existingSecret,
   withdrawnValue,
   newNullifier,
   newSecret,
   pathElements,
   pathIndices,
   recipient,
   stateRoot
 } = params;

   // proof generation
   const { proof, publicSignals, nullifierHash, newCommitment } =
     await generateWithdrawalProof({
       existingValue,
       existingNullifier,
       existingSecret,
       withdrawnValue,
       newNullifier,
       newSecret,
       pathElements,
       pathIndices,
       stateRoot
     });

   // Convert proof to calldata
   const proofBytes = proofToCalldata(proof);
   
   return {
     recipient,
     amount: withdrawnValue,
     nullifierHash,
     newCommitment,
     proof: proofBytes,
     publicSignals,
     stateRoot
   };
}
