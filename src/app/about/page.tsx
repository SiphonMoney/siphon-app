"use client";

import Nav from "@/components/theme/Nav";
import AppFooter from "@/components/theme/AppFooter";
import WaterCanvas from "@/components/theme/WaterCanvas";
import styles from "../hero.module.css";

export default function AboutPage() {
  return (
    <div>
      <Nav />
      
      {/* Hero logo in background */}
      <div className={styles.heroContainer}>
        <svg 
          className={styles.logo}
          viewBox="0 0 97.34 80" 
          style={{ opacity: 0.15 }}
        >
          <path 
            d="M70.66,35.93a11.66,11.66,0,0,1,1,.83c1.84,1.89,3.69,3.78,5.5,5.7,2.24,2.35,2.14,1.66-.06,3.9-4.47,4.53-9,9-13.49,13.49-1,1-1,1.09-.16,1.95q7.47,7.5,15,15c.85.85,1,.85,1.83,0q7.5-7.47,15-15c.84-.85.83-1,0-1.84-1.58-1.61-3.2-3.2-4.8-4.8l-9.72-9.73c-1.05-1-1-1.07,0-2.14.07-.08.15-.15.23-.23L92.22,32c1.5-1.47,3-2.94,4.49-4.43.86-.87.84-.9,0-1.81-.14-.16-.3-.3-.46-.46L81.59,10.63Q76.67,5.71,71.75.8c-1.07-1.07-1.09-1.07-2.17,0L64.82,5.66,37.45,33.19q-5.19,5.22-10.38,10.43c-.88.88-.9.87-1.77,0S23.83,42,23.08,41.26c-1.46-1.5-2.95-3-4.41-4.5-1.05-1.1-1-1.11,0-2.16l.23-.23Q25.94,27.28,33,20.19c1.08-1.08,1.09-1.08,0-2.16q-4.27-4.31-8.56-8.59c-2.06-2.06-4.11-4.13-6.18-6.17-.94-.93-1-.91-1.95,0-.2.18-.39.37-.58.56q-6.52,6.53-13,13c-.46.46-.92.91-1.36,1.38-.74.81-.73.88,0,1.73.18.2.37.38.56.57l8.81,8.81c1.83,1.83,3.64,3.67,5.49,5.49.54.52.62.95,0,1.46-.33.28-.62.61-.92.91L.85,51.75a3.65,3.65,0,0,0-.76.82,1.43,1.43,0,0,0,0,1c.1.28.42.48.64.71q12,12.45,24.05,24.89c1.1,1.14,1.11,1.14,2.28,0l29.48-29.3,13.2-13.1C70,36.47,70.3,36.24,70.66,35.93Z" 
            fill="#ffffff" 
          />
        </svg>
      </div>
      
      {/* Black overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />
      
      {/* About Content */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '100px 2rem 2rem 2rem'
      }}>
        <div style={{
          maxWidth: '800px',
          background: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '3rem',
          backdropFilter: 'blur(10px)',
          color: 'white',
          fontFamily: 'var(--font-source-code), monospace'
        }}>
          <h1 style={{
            fontSize: '48px',
            fontWeight: '700',
            marginBottom: '1.5rem',
            textTransform: 'uppercase',
            letterSpacing: '2px'
          }}>
            About Siphon
          </h1>
          
          <div style={{
            fontSize: '16px',
            lineHeight: '1.8',
            color: 'rgba(255, 255, 255, 0.85)'
          }}>
            <p style={{ marginBottom: '1rem', fontSize: '18px', color: '#51cf66' }}>
              <strong>Trade in the Shadows, Verify in the Light</strong>
            </p>
            <p style={{ marginBottom: '1.5rem' }}>
              Siphon is the first truly private DEX where you can see your balances but others cannot. 
              Built with Multi-Party Computation (MPC) on Solana, we solve the fundamental privacy paradox: 
              traditional DEXs are completely transparent, while privacy mixers are completely opaque.
            </p>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2.5rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#667eea'
            }}>
              The Innovation
            </h2>
            <p style={{ marginBottom: '1.5rem' }}>
              We created <strong>user-decryptable encrypted balances</strong>. Your balances are encrypted on-chain 
              using x25519 key exchange between your private key and the MPC&apos;s public key. Only you can decrypt 
              your balance, while the MPC can validate operations without revealing data to anyone else.
            </p>
            
            <div style={{
              padding: '1.25rem',
              background: 'rgba(102, 126, 234, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              marginBottom: '1.5rem'
            }}>
              <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic' }}>
                <strong>Example:</strong> You deposit 100 SOL. It&apos;s encrypted on-chain with RescueCipher. 
                You can instantly decrypt and see "100 SOL" in your UI. Other users? They see encrypted bytes. 
                MPC can verify you have sufficient balance for trades without revealing the amount.
              </p>
            </div>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2.5rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#667eea'
            }}>
              Dark Pool Trading
            </h2>
            <p style={{ marginBottom: '1.5rem' }}>
              Execute large orders without moving the market. Our dark pool matches orders privately using MPC, 
              ensuring that order sizes, prices, and counterparties remain confidential until execution. 
              Perfect for institutional traders, whales, and anyone who values privacy.
            </p>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2.5rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#667eea'
            }}>
              Key Features
            </h2>
            <ul style={{ 
              marginBottom: '1.5rem',
              paddingLeft: '0',
              listStyle: 'none'
            }}>
              <li style={{ marginBottom: '1rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ 
                  position: 'absolute',
                  left: 0,
                  color: '#51cf66', 
                  fontSize: '20px'
                }}>🔒</span>
                <strong>Encrypted Balances</strong><br/>
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  See your balances, nobody else can. Powered by x25519 + RescueCipher encryption.
                </span>
              </li>
              <li style={{ marginBottom: '1rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ 
                  position: 'absolute',
                  left: 0,
                  color: '#51cf66', 
                  fontSize: '20px'
                }}>🤐</span>
                <strong>Private Order Matching</strong><br/>
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Orders encrypted end-to-end. MPC matches orders without revealing details to anyone.
                </span>
              </li>
              <li style={{ marginBottom: '1rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ 
                  position: 'absolute',
                  left: 0,
                  color: '#51cf66', 
                  fontSize: '20px'
                }}>⚡</span>
                <strong>Solana Speed</strong><br/>
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  5-10 second MPC computations. Instant UI updates after decryption. No compromises.
                </span>
              </li>
              <li style={{ marginBottom: '1rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ 
                  position: 'absolute',
                  left: 0,
                  color: '#51cf66', 
                  fontSize: '20px'
                }}>🛡️</span>
                <strong>Self-Custodial</strong><br/>
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Your keys, your funds. We never hold custody. MPC only validates operations.
                </span>
              </li>
              <li style={{ marginBottom: '1rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ 
                  position: 'absolute',
                  left: 0,
                  color: '#51cf66', 
                  fontSize: '20px'
                }}>🔍</span>
                <strong>Verifiable Privacy</strong><br/>
                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  All operations are cryptographically provable. Privacy without sacrificing verifiability.
                </span>
              </li>
            </ul>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2.5rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#667eea'
            }}>
              How It Works
            </h2>
            <div style={{ 
              marginBottom: '1.5rem',
              padding: '1.5rem',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li style={{ marginBottom: '0.75rem' }}>
                  <strong>Initialize:</strong> Generate your x25519 keypair, encrypted with wallet signature in localStorage
                </li>
                <li style={{ marginBottom: '0.75rem' }}>
                  <strong>Deposit:</strong> Transfer tokens to vault → MPC encrypts your balance → You decrypt and see it
                </li>
                <li style={{ marginBottom: '0.75rem' }}>
                  <strong>Trade:</strong> Submit encrypted orders → MPC matches privately → Settlement on-chain
                </li>
                <li style={{ marginBottom: '0.75rem' }}>
                  <strong>Withdraw:</strong> MPC verifies encrypted balance → Backend executes transfer → Tokens to wallet
                </li>
              </ol>
            </div>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2.5rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#667eea'
            }}>
              Built With
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '0.5rem' }}>⚡</div>
                <strong>Solana</strong><br/>
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  High-performance L1
                </span>
              </div>
              <div style={{
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '0.5rem' }}>🔐</div>
                <strong>Arcium MPC</strong><br/>
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  Confidential compute
                </span>
              </div>
              <div style={{
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '0.5rem' }}>🔑</div>
                <strong>x25519</strong><br/>
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  Key exchange
                </span>
              </div>
              <div style={{
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '0.5rem' }}>🔒</div>
                <strong>Rescue</strong><br/>
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  Hash & cipher
                </span>
              </div>
            </div>
            
            <div style={{
              marginTop: '2.5rem',
              padding: '2rem',
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))',
              borderRadius: '12px',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              textAlign: 'center'
            }}>
              <p style={{ 
                margin: '0 0 1rem 0',
                fontSize: '20px',
                fontWeight: '600',
                color: '#ffffff'
              }}>
                Ready to Trade Privately?
              </p>
              <p style={{ 
                margin: '0 0 1.5rem 0',
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                Connect your wallet and start trading without revealing your positions.
              </p>
              <a 
                href="/dapp/darkpool" 
                style={{
                  display: 'inline-block',
                  padding: '12px 32px',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '16px',
                  transition: 'transform 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Launch Dark Pool →
              </a>
            </div>
            
            <div style={{
              marginTop: '2rem',
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.5)',
              textAlign: 'center'
            }}>
              {/* <strong>Tagline:</strong> Trade without a trace. Your privacy is our protocol. */}
            </div>
          </div>
        </div>
      </div>
      
      <AppFooter />
      <WaterCanvas />
    </div>
  );
}

