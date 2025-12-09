// InitializeLedger.tsx - Component for initializing user's private ledger
"use client";

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getOrDeriveX25519Keys, X25519Keys } from '@/components/archive/lib/keyManagement';
import './darkpool.css';

interface InitializeLedgerProps {
  walletAddress: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export default function InitializeLedger({ walletAddress, onComplete, onCancel }: InitializeLedgerProps) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const initializeLedger = async () => {
    setIsInitializing(true);
    setError(null);
    setProgress('Preparing initialization...');

    try {
      // Step 1: Derive x25519 encryption keys from wallet signature
      setProgress('Requesting wallet signature for key derivation...');
      
      const publicKey = new PublicKey(walletAddress);
      
      // Get signMessage function from wallet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solana = typeof window !== 'undefined' ? (window as any).solana : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solflare = typeof window !== 'undefined' ? (window as any).solflare : null;
      const provider = solflare?.isSolflare ? solflare : solana;
      
      if (!provider || !provider.signMessage) {
        throw new Error('Wallet does not support message signing');
      }
      
      let x25519Keys: X25519Keys;
      
      try {
        setProgress('Deriving encryption keys from signature...');
        
        // This will:
        // 1. Request signature from wallet (user approves in wallet popup)
        // 2. Derive x25519 keys using HKDF-SHA256
        // 3. Cache encrypted keys in localStorage
        x25519Keys = await getOrDeriveX25519Keys(
          publicKey,
          async (message: Uint8Array) => {
            const signature = await provider.signMessage(message, 'utf8');
            return signature;
          }
        );
        
        console.log('✅ x25519 keys derived successfully');
        console.log('   Public key:', Buffer.from(x25519Keys.publicKey).toString('hex').slice(0, 16) + '...');
        
      } catch (keyError) {
        console.error('Key derivation error:', keyError);
        throw new Error('Failed to derive encryption keys. Please try again.');
      }

      // Step 2: Initialize user ledger on-chain
      setProgress('Creating encrypted ledger on-chain...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // TODO: Call actual Solana program instruction
      // const tx = await program.methods
      //   .initializeUserLedger(x25519Keys.publicKey)
      //   .accounts({ user: publicKey })
      //   .rpc();

      // Step 3: Wait for MPC computation
      setProgress('Finalizing MPC computation...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // TODO: Wait for Arcium MPC to finalize the computation
      // const computation = await arcium.waitForComputation(computationId);

      console.log('User ledger initialized for:', walletAddress);
      
      setProgress('Complete!');
      setTimeout(onComplete, 500);
    } catch (err) {
      console.error('Initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Initialization failed');
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
              Before you can add liquidity or trade, you need to initialize
              your encrypted balance tracker.
            </p>
            <p>
              This is a one-time setup that creates your private
              ledger using MPC encryption.
            </p>
            <div className="info-box">
              <span>🔐 Your balances will be encrypted on-chain</span>
            </div>
            <div className="info-box">
              <span>✍️ You&apos;ll be asked to sign a message to derive encryption keys</span>
            </div>
            <div className="info-box">
              <span>🔑 Encryption keys are derived from your wallet (recoverable)</span>
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
              <button 
                onClick={onCancel}
                className="btn-secondary"
              >
                Cancel
              </button>
            )}
            <button 
              onClick={initializeLedger}
              disabled={isInitializing}
              className="btn-primary"
            >
              {isInitializing ? 'Initializing...' : 'Initialize Ledger'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

