"use client";

import Nav from "@/components/theme/Nav";
import ThreeEffect from "@/components/theme/ThreeEffect";
import EcosystemOrbits from "@/components/theme/EcosystemOrbits";
import styles from "./hero.module.css";
import landingStyles from "./landing.module.css";

export default function Home() {
  return (
    <div className={landingStyles.landingPage}>
      <Nav />
      {/* Hero section with ThreeEffect */}
      <div className={landingStyles.heroSection}>
        {/* Hero tagline */}
        <div className={styles.heroContainer}>
          <h1 className={styles.heroTagline}>
            We are the fully encrypted execution layer for the DeFi
          </h1>
          <p className={styles.heroSubtitle}>
           run any DeFi logic privately
          </p>
        </div>
        <ThreeEffect />
      </div>
      
      {/* Scrollable Content Sections */}
      <div className={landingStyles.contentSections}>
        <section className={landingStyles.contentSection}>
          <div className={`${landingStyles.sectionContent} ${landingStyles.alignRight}`}>
            <h2 className={landingStyles.sectionTitle}>On-Demand Strategy</h2>
            <p className={landingStyles.sectionDescription}>
              Run any DeFi strategy on-demand in a fully encrypted manner. Arbitrage, yield farming, liquidity mining, 
              grid trading—all privately. Connect your wallet, select a strategy, 
              execute. No long setups. No complicated configuration.
            </p>
          </div>
        </section>

        <section className={landingStyles.contentSection}>
          <div className={`${landingStyles.sectionContent} ${landingStyles.alignLeft}`}>
            <h2 className={landingStyles.sectionTitle}>Build and Deploy</h2>
            <p className={landingStyles.sectionDescription}>
              Create custom DeFi strategies with our visual flow editor. Chain swaps, deposits, withdrawals, and 
              custom logic into complex workflows. Deploy instantly. Execute privately. Share with the community or keep your strategies sealed.
            </p>
          </div>
        </section>

        <section className={landingStyles.contentSection}>
          <div className={`${landingStyles.sectionContent} ${landingStyles.alignRight}`}>
            <h2 className={landingStyles.sectionTitle}>
              Fully Encrypted
            </h2>
            <p className={landingStyles.sectionDescription}>
              Every strategy execution runs through fully encrypted channels. Your orders execute privately. Your 
              strategy logic stays sealed. Execute your alphas without revealing your intent.
            </p>
          </div>
        </section>
        
        <section className={landingStyles.contentSection}>
          <div className={`${landingStyles.sectionContent} ${landingStyles.alignCenter}`}>
            <EcosystemOrbits 
              chains={['Solana', 'Ethereum', 'Base', 'Bitcoin', 'Polygon', 'Arbitrum']}
              protocols={['Jupiter', 'Uniswap', 'Raydium', 'Orca', '1inch', 'Curve']}
            />
            <h2 className={landingStyles.ecosystemTitle}>An ecosystem of chains and protocols</h2>
          </div>
        </section>

        <footer className={landingStyles.simpleFooter}>
          <div className={landingStyles.footerLeft}>
            <p>Fully Homomorphic Encryption.</p>
            <p>Decentralized.</p>
            <p>Zero-Knowledge Audit Proofs.</p>
          </div>
          
          <div className={landingStyles.footerCenter}>
            <div className={landingStyles.footerCenterIcons}>
              <a href="https://twitter.com/SiphonMoney" target="_blank" rel="noopener noreferrer" aria-label="Twitter">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
                </svg>
              </a>
              <a href="https://discord.gg/siphon" target="_blank" rel="noopener noreferrer" aria-label="Discord">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
              <a href="https://github.com/SiphonMoney" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                </svg>
              </a>
            </div>
            <p className={landingStyles.footerCopyright}>Siphon Protocol © {new Date().getFullYear()}</p>
          </div>
          
          <div className={landingStyles.footerRight}>
            <p>Hyperliquid.</p>
            <p>Untraceable.</p>
            <p>Provable.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
