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
            <p style={{ marginBottom: '1.5rem' }}>
              Siphon Protocol is a privacy-first decentralized exchange designed for traders who value discretion and security above all else.
            </p>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Our Mission
            </h2>
            <p style={{ marginBottom: '1.5rem' }}>
              To provide institutional-grade trading infrastructure with zero-knowledge privacy guarantees, enabling users to trade without revealing their positions, strategies, or identity.
            </p>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Key Features
            </h2>
            <ul style={{ 
              marginBottom: '1.5rem',
              paddingLeft: '1.5rem',
              listStyle: 'none'
            }}>
              <li style={{ marginBottom: '0.75rem' }}>
                <span style={{ color: '#51cf66', marginRight: '0.5rem' }}>▸</span>
                Dark Pool Trading - Execute large orders without market impact
              </li>
              <li style={{ marginBottom: '0.75rem' }}>
                <span style={{ color: '#51cf66', marginRight: '0.5rem' }}>▸</span>
                Privacy-Preserving Order Matching - Your trades remain confidential
              </li>
              <li style={{ marginBottom: '0.75rem' }}>
                <span style={{ color: '#51cf66', marginRight: '0.5rem' }}>▸</span>
                Multi-Chain Liquidity Aggregation - Access deep liquidity across chains
              </li>
              <li style={{ marginBottom: '0.75rem' }}>
                <span style={{ color: '#51cf66', marginRight: '0.5rem' }}>▸</span>
                Zero-Knowledge Proof Verification - Trustless and transparent
              </li>
            </ul>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              marginTop: '2rem',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Technology
            </h2>
            <p style={{ marginBottom: '1.5rem' }}>
              Built on cutting-edge cryptographic protocols and powered by Solana's high-performance blockchain, Siphon combines the speed of centralized exchanges with the security and transparency of decentralized systems.
            </p>
            
            <div style={{
              marginTop: '2.5rem',
              padding: '1.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <p style={{ 
                margin: 0,
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.7)',
                textAlign: 'center'
              }}>
                Trade without a trace. Your privacy is our protocol.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <AppFooter />
      <WaterCanvas />
    </div>
  );
}

