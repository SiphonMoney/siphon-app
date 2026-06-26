import Link from "next/link";
import Nav from "@/components/theme/Nav";
import styles from "../legal.module.css";

const EFFECTIVE_DATE = "June 25, 2026";
const ENTITY = "Siphon Protocol Corp.";

export const metadata = {
  title: "Privacy Policy | Siphon Protocol",
  description: "Privacy policy for Siphon Protocol software and services.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.legalContainer}>
      <Nav />
      <article className={styles.content}>
        <header className={styles.hero}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.updated}>Effective {EFFECTIVE_DATE}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Overview</h2>
          <p className={styles.paragraph}>
            This Privacy Policy describes how {ENTITY} (&quot;Siphon,&quot; &quot;we,&quot;
            &quot;us,&quot; or &quot;our&quot;) handles information in connection with our websites,
            applications, and related experimental software (the &quot;Services&quot;). The Services
            are not intended for production use. By using the Services, you acknowledge this Policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Self-custody &amp; public blockchains</h2>
          <p className={styles.paragraph}>
            Siphon does not operate a custodial wallet service. When you connect a wallet, you
            interact directly with blockchain networks. Blockchain transactions are public by design
            and may be permanently visible, indexed, and analyzed by third parties. We are not
            responsible for the privacy characteristics of public blockchains or third-party indexers.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Information we may process</h2>
          <p className={styles.paragraph}>
            We aim to minimize collection. Depending on how you use the Services, we or our
            infrastructure providers may process:
          </p>
          <ul className={styles.list}>
            <li>Wallet addresses you connect or submit in the interface</li>
            <li>Transaction and interaction data already public on-chain</li>
            <li>Basic technical logs (e.g., IP address, browser type, timestamps, errors)</li>
            <li>Local browser storage preferences (e.g., layout settings, connected wallet cache)</li>
            <li>Communications you send to us voluntarily (e.g., support or legal inquiries)</li>
          </ul>
          <p className={styles.paragraph}>
            We do not require account registration, legal name, email, or government identification to
            use the core experimental interface.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. How information is used</h2>
          <p className={styles.paragraph}>We may use information to:</p>
          <ul className={styles.list}>
            <li>Operate, maintain, and improve the Services</li>
            <li>Route RPC, pricing, and other technical requests</li>
            <li>Monitor security, abuse, and system performance</li>
            <li>Comply with applicable law and enforce our Terms</li>
            <li>Respond to inquiries you initiate</li>
          </ul>
          <p className={styles.paragraph}>
            We do not sell your personal information. We do not use the Services to offer targeted
            advertising based on cross-site profiling.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Third-party providers</h2>
          <p className={styles.paragraph}>
            The Services may rely on third parties such as RPC nodes, analytics hosts, cloud
            infrastructure, wallet extensions, and blockchain networks. Those parties may process
            information according to their own policies. Siphon is not responsible for third-party
            privacy practices.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Cookies &amp; local storage</h2>
          <p className={styles.paragraph}>
            We may use strictly necessary browser storage to remember interface preferences and
            improve usability. You can clear site data through your browser settings. Disabling
            storage may limit functionality.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Retention</h2>
          <p className={styles.paragraph}>
            We retain information only as long as reasonably necessary for the purposes described
            above, unless a longer period is required by law. On-chain data cannot be deleted by
            Siphon once published to a blockchain.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Security disclaimer</h2>
          <p className={styles.paragraph}>
            No method of transmission or storage is completely secure. We implement reasonable
            measures appropriate for experimental software but cannot guarantee absolute security.
            You use the Services at your own risk.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. International users</h2>
          <p className={styles.paragraph}>
            The Services may be operated from the United States. If you access the Services from
            other regions, you understand that information may be processed in jurisdictions that may
            not provide the same level of data protection as your home country.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Children</h2>
          <p className={styles.paragraph}>
            The Services are not directed to individuals under 18. We do not knowingly collect
            information from children. If you believe a child has provided information to us, contact
            us and we will take reasonable steps to delete it where permitted.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Changes</h2>
          <p className={styles.paragraph}>
            We may update this Policy at any time. The &quot;Effective&quot; date above will reflect
            the latest revision. Continued use after changes constitutes acceptance.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Contact</h2>
          <p className={styles.paragraph}>
            Privacy questions may be directed to{" "}
            <a href="mailto:privacy@siphon.money" className={styles.inlineLink}>
              privacy@siphon.money
            </a>
            .
          </p>
        </section>

        <Link href="/dapp" className={styles.backLink}>
          ← Back to app
        </Link>
      </article>
    </div>
  );
}
