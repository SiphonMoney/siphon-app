import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

function normalizeLocalPath(path: string): string {
  if (path.includes("/public/")) {
    const idx = path.indexOf("/public/");
    return path.slice(idx + "/public".length);
  }
  if (path.startsWith("public/")) {
    return `/${path.slice("public/".length)}`;
  }
  if (path.startsWith("/public/")) {
    return path.slice("/public".length);
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

async function loadLocalIdl(path: string): Promise<Idl> {
  const response = await fetch(normalizeLocalPath(path));
  if (!response.ok) {
    throw new Error(`Failed to load IDL from ${path}`);
  }
  return (await response.json()) as Idl;
}

export async function loadIdl(
  provider: AnchorProvider,
  programId: PublicKey,
  localPath?: string,
): Promise<Idl> {
  if (localPath) {
    try {
      return await loadLocalIdl(localPath);
    } catch (error) {
      console.warn(
        `Local IDL load failed (${localPath}), falling back to chain`,
        error,
      );
    }
  }

  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) {
    throw new Error("IDL not found locally or on chain");
  }
  return idl;
}
