// InitializeLedger.tsx - Component for initializing user's private ledger
"use client";

import { useState } from "react";
import { L1_RPC_URL, MATCHING_ENGINE_PROGRAM_ID } from "@/config/env";
import { MatchingEngineClient } from "@/solana/matchingEngineClient";
import { getBrowserWalletAdapter } from "@/lib/solanaWallet";
import { getOrDeriveX25519Keys } from "@/lib/keyManagement";
import { userLedgerPda } from "@/solana/pdas";
import "./darkpool.css";

interface InitializeLedgerProps {
  walletAddress: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onComplete: () => void;
  onCancel?: () => void;
}

export default function InitializeLedger({
  walletAddress,
  signMessage,
  onComplete,
  onCancel,
}: InitializeLedgerProps) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDerivingKeys, setIsDerivingKeys] = useState(false);
  const [keysReady, setKeysReady] = useState(false);
  const [cachedEncPubkey, setCachedEncPubkey] = useState<Uint8Array | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const deriveKeysAndCheckLedger = async () => {
    setIsDerivingKeys(true);
    setError(null);
    setProgress("Requesting wallet signature for key derivation...");

    try {
      const walletAdapter = getBrowserWalletAdapter(signMessage);
      if (walletAdapter.publicKey.toBase58() !== walletAddress) {
        throw new Error(
          "Wallet address mismatch. Please reconnect your wallet.",
        );
      }
      if (!walletAdapter.signMessage) {
        throw new Error("Wallet does not support message signing");
      }

      const keys = await getOrDeriveX25519Keys(
        walletAdapter.publicKey,
        walletAdapter.signMessage,
      );
      setCachedEncPubkey(keys.publicKey);
      setKeysReady(true);
      setProgress("Encryption keys ready. Checking ledger...");

      const connection = new (await import("@solana/web3.js")).Connection(
        L1_RPC_URL,
        "confirmed",
      );
      const ledger = userLedgerPda(
        MATCHING_ENGINE_PROGRAM_ID,
        walletAdapter.publicKey,
      );
      const exists = await connection.getAccountInfo(ledger);
      if (exists) {
        setProgress("Ledger already initialized.");
        setTimeout(onComplete, 400);
        return;
      }

      setProgress("Ledger not initialized. You can initialize now.");
    } catch (err) {
      console.error("Key derivation failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to derive encryption keys",
      );
      setKeysReady(false);
    } finally {
      setIsDerivingKeys(false);
    }
  };

  const initializeLedger = async () => {
    setIsInitializing(true);
    setError(null);
    setProgress("Preparing initialization...");

    try {
      const walletAdapter = getBrowserWalletAdapter(signMessage);
      if (walletAdapter.publicKey.toBase58() !== walletAddress) {
        throw new Error(
          "Wallet address mismatch. Please reconnect your wallet.",
        );
      }
      if (!walletAdapter.signMessage || !walletAdapter.signTransaction) {
        throw new Error("Wallet must support signMessage and signTransaction");
      }
      if (!keysReady) {
        throw new Error(
          "Generate encryption keypair before initializing ledger",
        );
      }
      if (!cachedEncPubkey) {
        throw new Error(
          "Encryption keypair missing. Please generate keys again.",
        );
      }

      // Step 2: Initialize user ledger on-chain
      setProgress("Creating encrypted ledger on-chain...");
      const connection = new (await import("@solana/web3.js")).Connection(
        L1_RPC_URL,
        "confirmed",
      );
      const client = await MatchingEngineClient.create(
        connection,
        walletAdapter,
      );
      await client.ensureUserLedger(cachedEncPubkey);

      // Step 3: Wait for MPC computation
      setProgress("Finalizing MPC computation...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log("User ledger initialized for:", walletAddress);

      setProgress("Complete!");
      setTimeout(onComplete, 500);
    } catch (err) {
      console.error("Initialization failed:", err);
      setError(err instanceof Error ? err.message : "Initialization failed");
      setIsInitializing(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container darkpool-modal">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Initialize Your Private Ledger</h2>
          </div>

          <div className="info-section">
            <p>
              Before you can add liquidity or trade, you need to initialize your
              encrypted balance tracker.
            </p>
            <p>
              This is a one-time setup that creates your private ledger using
              MPC encryption.
            </p>
            <div className="info-box">
              <span>🔐 Your balances will be encrypted on-chain</span>
            </div>
            <div className="info-box">
              <span>
                ✍️ You&apos;ll be asked to sign a message to derive encryption
                keys
              </span>
            </div>
            <div className="info-box">
              <span>
                🔑 Encryption keys are derived from your wallet (recoverable)
              </span>
            </div>
            <div className="info-box">
              <span>⏱️ Takes approximately 10-15 seconds</span>
            </div>
          </div>

          {error && (
            <div className="error-box">
              <span>{error}</span>
            </div>
          )}

          {progress && (
            <div className="progress-box">
              <div className="spinner-small"></div>
              <span>{progress}</span>
            </div>
          )}

          <div className="button-group">
            {onCancel && !isInitializing && (
              <button onClick={onCancel} className="btn-secondary">
                Cancel
              </button>
            )}
            <button
              onClick={deriveKeysAndCheckLedger}
              disabled={isDerivingKeys || keysReady}
              className="btn-secondary"
            >
              {keysReady
                ? "Encryption Keypair Ready"
                : isDerivingKeys
                  ? "Generating..."
                  : "Generate Encryption Keypair"}
            </button>
            <button
              onClick={initializeLedger}
              disabled={isInitializing || !keysReady}
              className="btn-primary"
            >
              {isInitializing ? "Initializing..." : "Initialize Ledger"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
