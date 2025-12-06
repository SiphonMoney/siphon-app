"use client";

import Nav from "@/components/theme/Nav";
import styles from "./docs.module.css";

export default function DocsPage() {
  return (
    <div className={styles.docsContainer}>
      <Nav />
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1 className={styles.title}>Siphon Protocol Documentation</h1>
          <p className={styles.subtitle}>
           Private, anonymous, and secure DeFi execution.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Our Vision</h2>
          <p className={styles.paragraph}>
            A world where DeFi trading is truly private — where your strategies, positions, 
            and execution remain invisible to front-runners, MEV bots, and surveillance. 
            Where traders can execute large orders without moving markets, and where privacy 
            becomes the default state of decentralized finance.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>The Siphon Protocol Manifesto</h2>
          <p className={styles.paragraph}>
            A statement of intent for how private DeFi execution should emerge: unified, 
            accessible, and broadly usable.
          </p>

          <h3 className={styles.subsectionTitle}>Our mission</h3>
          <p className={styles.paragraph}>
            We are building Siphon Protocol — a unified platform for private, anonymous 
            DeFi execution. Our goal is to make cryptographic privacy as accessible and 
            composable as modern trading infrastructure, creating the global platform where 
            private strategies live, sealed orders flow, and full trading applications can 
            be built without exposing execution to the public.
          </p>
          <p className={styles.paragraph}>
            Today&apos;s DeFi trading is transparent and vulnerable. Every transaction is visible 
            on-chain, every order can be front-run, and every strategy can be copied. Until now, 
            traders had to choose between transparency and privacy, between decentralization 
            and protection. We unify privacy and DeFi into one ecosystem — with a developer 
            experience inspired by modern trading platforms and the security guarantees of 
            cryptographic privacy.
          </p>
          <p className={styles.paragraph}>
            We believe privacy is becoming the new standard for DeFi execution. A world where 
            traders build with privacy like they build with smart contracts, where cryptography 
            becomes invisible, and where sensitive strategies can execute safely anywhere. 
            We want to be the standard library of private DeFi execution and the default place 
            traders go when building privacy-first trading applications.
          </p>
          <p className={styles.paragraph}>
            The future of DeFi isn&apos;t choosing between transparency and privacy — it&apos;s having 
            both. Our platform is that unification.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Background</h2>
          <p className={styles.paragraph}>
            Modern DeFi trading is powerful but exposed. Every swap, every liquidity provision, 
            every strategy execution is visible on-chain. MEV bots extract value from every 
            transaction. Front-runners copy profitable strategies. Surveillance systems track 
            every move. Each vulnerability exposes a different piece of the privacy problem, 
            but until now, they&apos;ve existed without unified solutions.
          </p>
          <p className={styles.paragraph}>
            Developers building privacy-first trading applications face a fragmented landscape: 
            specialized tools for dark pools, separate frameworks for private execution, and 
            emerging research for sealed strategies. Each requires deep cryptographic expertise, 
            custom integrations, and manual assembly. The gap between research and practical 
            application remains immense.
          </p>
          <p className={styles.paragraph}>
            Just as Uniswap unified decentralized exchange, Aave simplified lending, and 
            Curve optimized stablecoin swaps, we&apos;re creating a unified platform for private 
            DeFi execution. We&apos;re building the bridge between the research frontier and traders 
            — making cryptographic privacy as accessible as modern trading infrastructure.
          </p>
          <p className={styles.paragraph}>
            The future of DeFi isn&apos;t choosing one primitive over another — it&apos;s composing them 
            together. Dark pools for private execution, sealed strategies for protected logic, 
            encrypted orders for hidden intent. Our platform enables developers to discover, 
            build, and deploy hybrid privacy architectures without touching cryptography.
          </p>
          <p className={styles.paragraph}>
            This represents a fundamental shift: from privacy as an add-on to privacy as the 
            default state of execution. From fragmented tools to unified platforms. From 
            cryptographic expertise required to simple composition.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Looking forward</h2>
          <p className={styles.paragraph}>
            Today, DeFi privacy is fragmented, difficult, and dependent on specialists. But 
            the world is shifting toward private trading, sealed strategies, secure execution, 
            proprietary algorithm protection, encrypted order flow, and user-sovereign finance. 
            We provide the platform that makes this shift inevitable.
          </p>
          <p className={styles.paragraph}>
            Our platform enables a world where privacy becomes modular, execution becomes 
            unobservable, and developers deploy sealed or encrypted trading apps with the same 
            ease as traditional applications. Where privacy primitives combine smoothly, strategies 
            and logic become shareable without exposure, and organizations protect algorithms, 
            not just data.
          </p>
          <p className={styles.paragraph}>
            We&apos;re building Siphon Protocol as an open, extensible platform that others can build 
            upon. Just as early platforms accelerated DeFi, zero-knowledge systems, and private 
            computation, we plan to accelerate the arrival of unified privacy-powered trading 
            applications.
          </p>
          <p className={styles.paragraph}>
            The era of invisible, composable, private-by-default execution is just beginning. 
            We&apos;re building the foundation that makes it possible.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Our approach</h2>
          <p className={styles.paragraph}>
            We&apos;re building Siphon Protocol in three layers: The Private Execution Layer — a 
            unified registry where traders browse, publish, fork, and deploy dark pools, 
            sealed strategies, and encrypted order types. The Builder Layer — a full-stack 
            development environment with code mode (familiar languages) and flow mode (visual 
            graph editor), combining modern trading ergonomics with privacy composition. 
            The Runtime & Deployment Layer — one-click deployment across cloud, edge, local, 
            enclave, and chain environments, with APIs, sandboxes, and encrypted pipelines.
          </p>
          <p className={styles.paragraph}>
            Our platform abstracts away cryptographic complexity while maintaining security. 
            Developers compose privacy workflows, chain dark pool → sealed strategy → encrypted 
            order steps, and deploy private applications — all without learning math or circuits. 
            The runtime handles private execution, encrypted evaluation, sealed artifact execution, 
            and hybrid pipeline orchestration.
          </p>
          <p className={styles.paragraph}>
            Our goal is not to own the applications built on our platform, but to enable everyone 
            to build them. We&apos;re creating the standard library of private DeFi execution and the 
            default place developers go when building privacy-first trading software.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>The Platform</h2>
          <p className={styles.paragraph}>
            Siphon Protocol is designed as an open, extensible platform that others can build upon. 
            Our work is open where possible, collaborative by default, and constructed to support 
            the entire ecosystem. We&apos;re committed to making privacy execution accessible, not 
            proprietary.
          </p>
          <p className={styles.paragraph}>
            We&apos;re fostering a community of researchers, developers, and traders who believe that 
            unified privacy execution can become a universal good — and who want to help define 
            the standards, practices, and tools that make it real. A community where dark pools, 
            sealed strategies, and encrypted orders come together into one coherent developer 
            experience.
          </p>
          <p className={styles.paragraph}>
            The path ahead requires bridging research and practice, abstracting complexity while 
            maintaining security, and building infrastructure that scales. But we believe deeply 
            that the outcome is worth the effort — a world where privacy is the default state of 
            execution, not an add-on.
          </p>
          <p className={styles.paragraph}>
            If this resonates with you, we invite you to help shape the future of private execution. 
            The era of unified privacy platforms is just beginning.
          </p>
        </div>
      </div>
    </div>
  );
}

