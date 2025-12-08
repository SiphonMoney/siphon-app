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
        <ThreeEffect />
        {/* Hero tagline */}
        <div className={styles.heroContainer}>
          <h1 className={styles.heroTagline}>
            We are the fully encrypted execution layer for the DeFi
          </h1>
          <p className={styles.heroSubtitle}>
           run any DeFi logic privately
          </p>
        </div>
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

      </div>
      
      <footer className={landingStyles.simpleFooter}>
        <div className={landingStyles.footerLeft}>
          <p>Fully Homomorphic Encryption.</p>
          <p>Multi-Party Computation.</p>
          <p>Zero-Knowledge Audit Proofs.</p>
        </div>
        
        <div className={landingStyles.footerCenter}>
          <a href="/docs">Docs</a>
          <a href="/dapp/darkpool">Services</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
        
        <div className={landingStyles.footerRight}>
          <p>Hyperliquid.</p>
          <p>Untraceable.</p>
          <p>Provable.</p>
        </div>
      </footer>
    </div>
  );
}
