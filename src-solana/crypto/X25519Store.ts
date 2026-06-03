import { PublicKey } from "@solana/web3.js";
import { getOrDeriveX25519Keys } from "@/lib/keyManagement";

type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

function getDefaultSignMessage(): SignMessageFn {
  if (typeof window === "undefined") {
    throw new Error("Wallet signer not available on server");
  }

  const anyWindow = window as Window & {
    solana?: { signMessage?: SignMessageFn };
  };

  if (!anyWindow.solana?.signMessage) {
    throw new Error("Wallet does not support signMessage");
  }

  return anyWindow.solana.signMessage;
}

export async function getOrCreateUserX25519(
  walletPubkey: string,
  signMessage: SignMessageFn = getDefaultSignMessage(),
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const publicKey = new PublicKey(walletPubkey);
  const keys = await getOrDeriveX25519Keys(publicKey, signMessage);
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

export async function getUserX25519Public(
  walletPubkey: string,
  signMessage?: SignMessageFn,
): Promise<Uint8Array> {
  const keys = await getOrCreateUserX25519(walletPubkey, signMessage);
  return keys.publicKey;
}
