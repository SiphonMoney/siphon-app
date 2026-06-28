// Shared AES-GCM helpers for encrypting sensitive data in localStorage.
// Key is derived from a stable wallet signature that is never transmitted.
// Cached per session so only one MetaMask prompt is needed across all callers.

import { Signer } from 'ethers';
import { deriveEncKey } from './noteAuth';

// Delegate to noteAuth so both callers share one MetaMask prompt and one cache.
export async function deriveLocalKey(signer: Signer): Promise<CryptoKey> {
  return deriveEncKey(signer);
}

export async function encryptLocal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Pack iv (12 bytes) + ciphertext as base64, separated by '.'
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
  return `${ivB64}.${ctB64}`;
}

export async function decryptLocal(key: CryptoKey, blob: string): Promise<string> {
  const [ivB64, ctB64] = blob.split('.');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
