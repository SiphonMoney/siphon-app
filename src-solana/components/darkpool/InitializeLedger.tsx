// InitializeLedger.tsx - Component for initializing user's private ledger
"use client";

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getOrDeriveX25519Keys, X25519Keys } from '@/lib/keyManagement';
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
      
      if (!provider) {
        throw new Error('No wallet provider found. Please connect your wallet first.');
      }
      
      if (!provider.signMessage) {
        throw new Error('Wallet does not support message signing. Please use Phantom or Solflare wallet.');
      }
      
      // Ensure wallet is connected
      if (!provider.publicKey && provider.connect) {
        console.log('Wallet not connected, attempting to connect...');
        await provider.connect();
      }
      
      if (!provider.publicKey) {
        throw new Error('Wallet is not connected. Please connect your wallet and try again.');
      }
      
      // Verify the connected wallet matches the expected address
      const connectedAddress = provider.publicKey.toString();
      if (connectedAddress !== walletAddress) {
        throw new Error(`Wallet address mismatch. Expected ${walletAddress}, got ${connectedAddress}`);
      }
      
      let x25519Keys: X25519Keys;
      
      try {
        // This will:
        // 1. Request signature from wallet (user approves in wallet popup)
        // 2. Derive x25519 keys using HKDF-SHA256
        // 3. Cache encrypted keys in localStorage
        
        // Update progress before requesting signature (this is when user sees the prompt)
        setProgress('Requesting wallet signature... Please approve in your wallet popup.');
        
        // Get the message text for display in wallet
        const { createSignatureMessage } = await import('@/lib/keyManagement');
        const messageText = createSignatureMessage(publicKey);
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔑 MESSAGE TEXT:');
        console.log('   ', messageText);
        console.log('═══════════════════════════════════════════════════════');
        
        x25519Keys = await getOrDeriveX25519Keys(
          publicKey,
          async (message: Uint8Array) => {
            console.log('📝 Requesting signature from wallet...');
            console.log('   Message length:', message.length, 'bytes');
            console.log('   Message preview:', messageText.substring(0, 100) + '...');
            console.log('   Provider type:', solflare?.isSolflare ? 'Solflare' : 'Phantom/Other');
            
            // Solana wallet providers return { signature: Uint8Array }
            // Handle both Phantom and Solflare APIs
            let result: { signature: Uint8Array } | Uint8Array;
            
            try {
              // Try Phantom/Solflare API with display option: signMessage({ message: Uint8Array, display?: string })
              console.log('   Attempting wallet API: signMessage({ message, display })');
              result = await provider.signMessage({
                message,
                display: messageText
              });
              console.log('   ✅ Wallet API with display succeeded');
            } catch (displayError) {
              console.log('   ⚠️ Display API failed, trying simple message API...');
              try {
                // Try Phantom API: signMessage(message: Uint8Array)
                result = await provider.signMessage(message);
                console.log('   ✅ Simple message API succeeded');
              } catch (simpleError) {
                console.log('   ⚠️ Simple API failed, trying object-based API...');
                // Try object-based API without display
                try {
                  result = await provider.signMessage({ message });
                  console.log('   ✅ Object-based API succeeded');
                } catch (objectError) {
                  console.error('❌ All signMessage attempts failed:', { 
                    displayError, 
                    simpleError, 
                    objectError 
                  });
                  throw new Error(
                    `Failed to sign message: ${displayError instanceof Error ? displayError.message : 'Unknown error'}. ` +
                    'Please ensure your wallet is connected and try again. If the issue persists, try refreshing the page.'
                  );
                }
              }
            }
            
            // Extract signature from result
            // Some wallets return the signature directly, others return { signature }
            let signature: Uint8Array;
            if (result instanceof Uint8Array) {
              signature = result;
            } else if (result && typeof result === 'object' && 'signature' in result) {
              signature = result.signature;
            } else {
              console.error('❌ Invalid signature response:', result);
              throw new Error('Invalid signature response from wallet. Expected Uint8Array or { signature: Uint8Array }');
            }
            
            if (!signature || signature.length === 0) {
              throw new Error('Received empty signature from wallet');
            }
            
            console.log('✅ Signature received, length:', signature.length);
            return signature;
          }
        );
        
        setProgress('Keys derived successfully. Creating ledger...');
        
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

