// arciumHelpers.ts - Arcium MPC integration utilities
// Based on new_inmp.md specification

import { PublicKey } from "@solana/web3.js";
import { anchor} from "@coral-xyz/anchor";
import { getMXEPublicKey } from "@arcium-hq/client";

/**
 * NOTE: These imports from @arcium-hq/client should work once the package is installed
 * If not available, these are placeholder implementations
 */

// Try to import from @arcium-hq/client, fallback to placeholders
// let arciumClient: Record<string, unknown> | null = null;
// try {
//   // Use require for compatibility (needed for @arcium-hq/client package)
//   // eslint-disable-next-line @typescript-eslint/no-require-imports
//   arciumClient = require("@arcium-hq/client") as Record<string, unknown>;
// } catch {
//   console.warn(
//     "⚠️  @arcium-hq/client not installed, using placeholder implementations",
//   );
//   arciumClient = null;
// }


export async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}
// ===== MPC Account Derivations =====

// const FALLBACK_ARCIUM_PROGRAM_ID = new PublicKey(
//   "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ",
// );

// export function getMXEAccAddress(programId: PublicKey): PublicKey {
//   if (
//     arciumClient?.getMXEAccAddress &&
//     typeof arciumClient.getMXEAccAddress === "function"
//   ) {
//     return (
//       arciumClient.getMXEAccAddress as (programId: PublicKey) => PublicKey
//     )(programId);
//   }
//   // Placeholder implementation
//   const [mxePDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("mxe_account")],
//     programId,
//   );
//   return mxePDA;
// }

// export function getMempoolAccAddress(
//   clusterOrProgramId: number | PublicKey,
// ): PublicKey {
//   if (
//     arciumClient?.getMempoolAccAddress &&
//     typeof arciumClient.getMempoolAccAddress === "function"
//   ) {
//     return (
//       arciumClient.getMempoolAccAddress as (clusterOffset: number) => PublicKey
//     )(typeof clusterOrProgramId === "number" ? clusterOrProgramId : 0);
//   }
//   const programId =
//     typeof clusterOrProgramId === "number"
//       ? FALLBACK_ARCIUM_PROGRAM_ID
//       : clusterOrProgramId;
//   const [mempoolPDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("mempool")],
//     programId,
//   );
//   return mempoolPDA;
// }

// export function getExecutingPoolAccAddress(
//   clusterOrProgramId: number | PublicKey,
// ): PublicKey {
//   if (
//     arciumClient?.getExecutingPoolAccAddress &&
//     typeof arciumClient.getExecutingPoolAccAddress === "function"
//   ) {
//     return (
//       arciumClient.getExecutingPoolAccAddress as (
//         clusterOffset: number,
//       ) => PublicKey
//     )(typeof clusterOrProgramId === "number" ? clusterOrProgramId : 0);
//   }
//   const programId =
//     typeof clusterOrProgramId === "number"
//       ? FALLBACK_ARCIUM_PROGRAM_ID
//       : clusterOrProgramId;
//   const [executingPoolPDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("executing_pool")],
//     programId,
//   );
//   return executingPoolPDA;
// }

// export function getComputationAccAddress(
//   clusterOrProgramId: number | PublicKey,
//   offset: BN,
// ): PublicKey {
//   if (
//     arciumClient?.getComputationAccAddress &&
//     typeof arciumClient.getComputationAccAddress === "function"
//   ) {
//     return (
//       arciumClient.getComputationAccAddress as (
//         clusterOffset: number,
//         offset: BN,
//       ) => PublicKey
//     )(typeof clusterOrProgramId === "number" ? clusterOrProgramId : 0, offset);
//   }
//   const programId =
//     typeof clusterOrProgramId === "number"
//       ? FALLBACK_ARCIUM_PROGRAM_ID
//       : clusterOrProgramId;
//   const [computationPDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("computation"), offset.toArrayLike(Buffer, "le", 8)],
//     programId,
//   );
//   return computationPDA;
// }

// export function getCompDefAccAddress(
//   programId: PublicKey,
//   offset: number,
// ): PublicKey {
//   if (
//     arciumClient?.getCompDefAccAddress &&
//     typeof arciumClient.getCompDefAccAddress === "function"
//   ) {
//     return (
//       arciumClient.getCompDefAccAddress as (
//         programId: PublicKey,
//         offset: number,
//       ) => PublicKey
//     )(programId, offset);
//   }
//   // Placeholder implementation
//   const offsetBuffer = Buffer.alloc(4);
//   offsetBuffer.writeUInt32LE(offset);
//   const [compDefPDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("comp_def"), offsetBuffer],
//     programId,
//   );
//   return compDefPDA;
// }

// export function getClusterAccAddress(clusterOffset: number): PublicKey {
//   if (
//     arciumClient?.getClusterAccAddress &&
//     typeof arciumClient.getClusterAccAddress === "function"
//   ) {
//     return (
//       arciumClient.getClusterAccAddress as (clusterOffset: number) => PublicKey
//     )(clusterOffset);
//   }
//   // Placeholder implementation - uses known devnet program id
//   const ARCIUM_PROGRAM_ID = FALLBACK_ARCIUM_PROGRAM_ID;
//   const offsetBuffer = Buffer.alloc(4);
//   offsetBuffer.writeUInt32LE(clusterOffset);
//   const [clusterPDA] = PublicKey.findProgramAddressSync(
//     [Buffer.from("cluster"), offsetBuffer],
//     ARCIUM_PROGRAM_ID,
//   );
//   return clusterPDA;
// }

// export function getArciumProgramId(): PublicKey {
//   if (
//     arciumClient?.getArciumProgramId &&
//     typeof arciumClient.getArciumProgramId === "function"
//   ) {
//     return (arciumClient.getArciumProgramId as () => PublicKey)();
//   }
//   // Placeholder - replace with actual Arcium program ID
//   return FALLBACK_ARCIUM_PROGRAM_ID;
// }

// // ===== Computation Definition Offsets =====

// export function getCompDefAccOffset(computationType: string): Uint8Array {
//   if (
//     arciumClient?.getCompDefAccOffset &&
//     typeof arciumClient.getCompDefAccOffset === "function"
//   ) {
//     return (
//       arciumClient.getCompDefAccOffset as (
//         computationType: string,
//       ) => Uint8Array
//     )(computationType);
//   }

//   // Placeholder implementation - these should be actual offsets from the program
//   const offsets: Record<string, number> = {
//     init_user_ledger: 1,
//     update_ledger_deposit: 2,
//     submit_order_check: 3,
//     submit_order: 4,
//     update_ledger_withdraw_verify: 5,
//     trigger_matching: 6,
//   };

//   const offset = offsets[computationType] || 0;
//   const buffer = Buffer.alloc(4);
//   buffer.writeUInt32LE(offset);
//   return new Uint8Array(buffer);
// }

// // ===== MPC Utilities =====

// export async function getMXEPublicKey(
//   provider: AnchorProvider,
//   programId: PublicKey,
// ): Promise<Uint8Array> {
//   if (
//     arciumClient?.getMXEPublicKey &&
//     typeof arciumClient.getMXEPublicKey === "function"
//   ) {
//     return (
//       arciumClient.getMXEPublicKey as (
//         provider: AnchorProvider,
//         programId: PublicKey,
//       ) => Promise<Uint8Array>
//     )(provider, programId);
//   }

//   // Placeholder implementation
//   console.warn("⚠️  Using placeholder MXE public key");
//   return new Uint8Array(32).fill(1);
// }

// export async function getMXEPublicKeyWithRetry(
//   provider: anchor.AnchorProvider,
//   programId: PublicKey,
//   maxRetries: number = 10,
//   retryDelayMs: number = 500
// ): Promise<Uint8Array> {
//   for (let attempt = 1; attempt <= maxRetries; attempt++) {
//     try {
//       const mxePublicKey = await getMXEPublicKey(provider, programId);
//       if (mxePublicKey) {
//         return mxePublicKey;
//       }
//     } catch (error) {
//       console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
//     }

//     if (attempt < maxRetries) {
//       console.log(
//         `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
//       );
//       await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
//     }
//   }

//   throw new Error(
//     `Failed to fetch MXE public key after ${maxRetries} attempts`
//   );
// }

// export async function awaitComputationFinalization(
//   provider: AnchorProvider,
//   computationOffset: BN,
//   programId: PublicKey,
//   commitment: "processed" | "confirmed" | "finalized" = "confirmed",
// ): Promise<void> {
//   if (
//     arciumClient?.awaitComputationFinalization &&
//     typeof arciumClient.awaitComputationFinalization === "function"
//   ) {
//     return (
//       arciumClient.awaitComputationFinalization as (
//         provider: AnchorProvider,
//         computationOffset: BN,
//         programId: PublicKey,
//         commitment: "processed" | "confirmed" | "finalized",
//       ) => Promise<void>
//     )(provider, computationOffset, programId, commitment);
//   }

//   // Placeholder implementation - poll for computation account
//   console.log("⏳ Waiting for computation finalization (placeholder)...");
//   const computationAddress = getComputationAccAddress(
//     programId,
//     computationOffset,
//   );
//   const connection = provider.connection;

//   const maxAttempts = 60; // 60 seconds timeout
//   for (let i = 0; i < maxAttempts; i++) {
//     try {
//       const accountInfo = await connection.getAccountInfo(
//         computationAddress,
//         commitment,
//       );
//       if (accountInfo) {
//         console.log("✅ Computation finalized");
//         return;
//       }
//     } catch {
//       // Continue polling
//     }
//     await new Promise((resolve) => setTimeout(resolve, 1000));
//   }

//   throw new Error("Computation finalization timeout");
// }

// export function getArciumEnv(): string {
//   if (
//     arciumClient?.getArciumEnv &&
//     typeof arciumClient.getArciumEnv === "function"
//   ) {
//     return (arciumClient.getArciumEnv as () => string)();
//   }
//   return process.env.NEXT_PUBLIC_ARCIUM_ENV || "devnet";
// }

// // ===== Serialization Utilities =====

// export function serializeLE(value: BN | bigint): Uint8Array {
//   if (
//     arciumClient?.serializeLE &&
//     typeof arciumClient.serializeLE === "function"
//   ) {
//     return (arciumClient.serializeLE as (value: BN | bigint) => Uint8Array)(
//       value,
//     );
//   }

//   const bn = value instanceof BN ? value : new BN(value.toString());
//   return new Uint8Array(bn.toArrayLike(Buffer, "le", 8));
// }

// export function deserializeLE(bytes: Uint8Array): bigint {
//   if (
//     arciumClient?.deserializeLE &&
//     typeof arciumClient.deserializeLE === "function"
//   ) {
//     return (arciumClient.deserializeLE as (bytes: Uint8Array) => bigint)(bytes);
//   }

//   const buffer = bytes.slice(0, 16); // Support up to 16 bytes
//   let result = 0n;
//   for (let i = 0; i < buffer.length; i++) {
//     result += BigInt(buffer[i]) * 256n ** BigInt(i);
//   }
//   return result;
// }

// ===== Encryption Utilities (Re-exported) =====

// export type { RescueCipher, x25519 } from "./encryption";
