import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";

function u64le(value: bigint | number | BN): Buffer {
  const bigintValue =
    value instanceof BN ? BigInt(value.toString()) : BigInt(value);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(bigintValue);
  return buffer;
}

// matching_engine
export function globalStatePda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_state")],
    programId,
  );
  return pda;
}

export function vaultAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    programId,
  );
  return pda;
}

export function vaultPda(programId: PublicKey, mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), mint.toBuffer()],
    programId,
  );
  return pda;
}

export function userLedgerPda(
  programId: PublicKey,
  user: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_ledger"), user.toBuffer()],
    programId,
  );
  return pda;
}

export function orderTicketPda(
  programId: PublicKey,
  orderIdU64: bigint | number | BN,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("order_ticket"), u64le(orderIdU64)],
    programId,
  );
  return pda;
}

export function orderAccountPda(
  programId: PublicKey,
  orderIdU64: bigint | number | BN,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("order"), u64le(orderIdU64)],
    programId,
  );
  return pda;
}

export function teeGovernancePda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tee_governance")],
    programId,
  );
  return pda;
}

export function matchRecordPda(
  programId: PublicKey,
  matchIdU64: bigint | number | BN,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), u64le(matchIdU64)],
    programId,
  );
  return pda;
}

// per_matching
export function perOrderbookPda(
  perProgramId: PublicKey,
  market: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("orderbook"), market.toBuffer()],
    perProgramId,
  );
  return pda;
}

export function perUserOrderPda(
  perProgramId: PublicKey,
  market: PublicKey,
  user: PublicKey,
  ticketIdU64: bigint | number | BN,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("user_order"),
      market.toBuffer(),
      user.toBuffer(),
      u64le(ticketIdU64),
    ],
    perProgramId,
  );
  return pda;
}

export function perMatchedOrderPda(
  perProgramId: PublicKey,
  market: PublicKey,
  matchIdU64: bigint | number | BN,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("matched_order"), market.toBuffer(), u64le(matchIdU64)],
    perProgramId,
  );
  return pda;
}
