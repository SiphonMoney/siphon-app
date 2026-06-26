import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { getMXEPublicKeyWithRetry as fetchMxePublicKey } from "@/lib/arciumHelpers";
import { RescueCipher, x25519 } from "@/lib/encryption";

function u64le(value: bigint): Uint8Array {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return new Uint8Array(buffer);
}

export async function getMxePublicKeyWithRetry(
  provider: AnchorProvider,
  matchingEngineProgramId: PublicKey,
): Promise<Uint8Array> {
  return fetchMxePublicKey(provider, matchingEngineProgramId);
}

export function cipherForUser(
  userX25519Priv: Uint8Array,
  mxePubkey: Uint8Array,
): RescueCipher {
  const sharedSecret = x25519.getSharedSecret(userX25519Priv, mxePubkey);
  return new RescueCipher(sharedSecret);
}

export function encryptOrder(
  cipher: RescueCipher,
  amountU64: bigint,
  priceU64: bigint,
  nonce16: Uint8Array,
): { amountCt32: Uint8Array; priceCt32: Uint8Array } {
  const encrypted = cipher.encrypt([amountU64, priceU64], nonce16);
  return {
    amountCt32: new Uint8Array(encrypted[0]),
    priceCt32: new Uint8Array(encrypted[1]),
  };
}

export async function computeOrderCommitment(
  amountU64: bigint,
  priceU64: bigint,
  sideU8: number,
  salt32: Uint8Array,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(8 + 8 + 1 + 32);
  buffer.set(u64le(amountU64), 0);
  buffer.set(u64le(priceU64), 8);
  buffer.set([sideU8], 16);
  buffer.set(salt32, 17);

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(digest);
}

export function u64ToBn(value: bigint): BN {
  return new BN(value.toString());
}
