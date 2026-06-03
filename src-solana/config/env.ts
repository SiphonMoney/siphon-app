import { PublicKey } from "@solana/web3.js";

function getEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  if (!value) {
    if (fallback) {
      return fallback;
    }
    console.warn(`Missing env var: ${name}`);
    return "";
  }
  return value;
}

function getEnvPublicKey(name: string, fallback?: string): PublicKey {
  const value = getEnv(name, fallback ?? "");
  try {
    return new PublicKey(value);
  } catch {
    const defaultKey = new PublicKey("11111111111111111111111111111111");
    console.warn(`Invalid public key for ${name}, using default`);
    return defaultKey;
  }
}

export const L1_RPC_URL = getEnv(
  "NEXT_PUBLIC_L1_RPC_URL",
  getEnv("NEXT_PUBLIC_SOLANA_RPC", "https://api.devnet.solana.com"),
);
export const PER_BASE_URL = getEnv("NEXT_PUBLIC_PER_BASE_URL");
export const PER_WS_URL = getEnv("NEXT_PUBLIC_PER_WS_URL");
export const BACKEND_API_URL = getEnv(
  "NEXT_PUBLIC_BACKEND_API_URL",
  getEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3000"),
);
export const MATCHING_ENGINE_IDL_PATH = getEnv(
  "NEXT_PUBLIC_MATCHING_ENGINE_IDL_PATH",
  "/idl/matching_engine.json",
);
export const PER_MATCHING_IDL_PATH = getEnv(
  "NEXT_PUBLIC_PER_MATCHING_IDL_PATH",
  "/idl/per_matching.json",
);

export const MATCHING_ENGINE_PROGRAM_ID = getEnvPublicKey(
  "NEXT_PUBLIC_MATCHING_ENGINE_PROGRAM_ID",
  getEnv("NEXT_PUBLIC_PROGRAM_ID"),
);
export const PER_MATCHING_PROGRAM_ID = getEnvPublicKey(
  "NEXT_PUBLIC_PER_MATCHING_PROGRAM_ID",
);
export const ER_VALIDATOR = getEnvPublicKey("NEXT_PUBLIC_ER_VALIDATOR");
export const MARKET_PUBKEY = getEnvPublicKey("NEXT_PUBLIC_MARKET_PUBKEY");
export const PER_RELAYER_PUBKEY = getEnvPublicKey(
  "NEXT_PUBLIC_PER_RELAYER_PUBKEY",
);

export const ARCIUM_CLUSTER_OFFSET =
  Number(getEnv("NEXT_PUBLIC_ARCIUM_CLUSTER_OFFSET", "0")) || 0;
