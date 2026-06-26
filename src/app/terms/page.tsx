import Link from "next/link";
import Nav from "@/components/theme/Nav";
import styles from "../legal.module.css";

const EFFECTIVE_DATE = "June 25, 2026";
const ENTITY = "Siphon Protocol Corp.";

export const metadata = {
  title: "Terms of Use | Siphon Protocol",
  description: "Terms of use for Siphon Protocol software and services.",
};

export default function TermsPage() {
  return (
    <div className={styles.legalContainer}>
      <Nav />
      <article className={styles.content}>
        <header className={styles.hero}>
          <h1 className={styles.title}>Terms of Use</h1>
          <p className={styles.updated}>Effective {EFFECTIVE_DATE}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Agreement</h2>
          <p className={styles.paragraph}>
            These Terms of Use (&quot;Terms&quot;) govern access to and use of websites, applications,
            interfaces, smart contracts, documentation, and related software made available by{" "}
            {ENTITY} (&quot;Siphon,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
            (collectively, the &quot;Services&quot;). By accessing or using the Services, you agree to
            these Terms. If you do not agree, do not use the Services.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Experimental software only</h2>
          <p className={styles.paragraph}>
            The Services are provided solely for experimental, research, and demonstration purposes.
            They are not intended for production use, commercial deployment, or reliance in any
            real-world financial, legal, tax, accounting, or investment context. The Services may be
            incomplete, unstable, or withdrawn at any time without notice.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. No professional advice</h2>
          <p className={styles.paragraph}>
            Nothing in the Services constitutes financial, investment, legal, tax, or other
            professional advice. You are solely responsible for evaluating whether any use of the
            Services is appropriate for you and for obtaining independent professional advice.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Assumption of risk</h2>
          <p className={styles.paragraph}>
            You acknowledge and accept that blockchain, cryptocurrency, smart contract, and
            privacy-related technologies involve substantial risk, including but not limited to:
          </p>
          <ul className={styles.list}>
            <li>Total loss of digital assets</li>
            <li>Smart contract bugs, exploits, and irreversible transactions</li>
            <li>Network congestion, forks, outages, and validator failures</li>
            <li>Regulatory actions, sanctions, and loss of access</li>
            <li>User error, lost keys, phishing, and wallet compromise</li>
            <li>Third-party protocol, bridge, oracle, or liquidity failures</li>
          </ul>
          <p className={styles.paragraph}>
            You assume all risks associated with your use of the Services and any on-chain activity
            initiated through them. Siphon does not custody your assets and cannot reverse blockchain
            transactions.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Provided &quot;as is&quot;</h2>
          <p className={`${styles.paragraph} ${styles.caps}`}>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICES ARE PROVIDED ON AN
            &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND,
            WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION ANY
            IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
            NON-INFRINGEMENT, ACCURACY, AVAILABILITY, SECURITY, OR QUIET ENJOYMENT. WE DO NOT
            WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF
            HARMFUL COMPONENTS.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Limitation of liability</h2>
          <p className={`${styles.paragraph} ${styles.caps}`}>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL SIPHON, ITS
            AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AGENTS, OR LICENSORS BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR
            ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR DIGITAL ASSETS, ARISING OUT OF OR
            RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICES, WHETHER BASED IN CONTRACT,
            TORT, STRICT LIABILITY, OR ANY OTHER THEORY, EVEN IF WE HAVE BEEN ADVISED OF THE
            POSSIBILITY OF SUCH DAMAGES. OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF OR
            RELATING TO THE SERVICES SHALL NOT EXCEED ONE HUNDRED U.S. DOLLARS (US$100).
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Indemnification</h2>
          <p className={styles.paragraph}>
            You agree to defend, indemnify, and hold harmless Siphon and its affiliates, officers,
            directors, employees, contractors, and agents from and against any claims, damages,
            losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees)
            arising out of or related to your use of the Services, your violation of these Terms,
            your violation of applicable law, or your on-chain activity.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Third-party services</h2>
          <p className={styles.paragraph}>
            The Services may integrate with or link to third-party wallets, RPC providers, blockchains,
            protocols, and data sources. Siphon does not control and is not responsible for
            third-party services. Your use of third-party services is at your own risk and subject to
            their terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Eligibility &amp; compliance</h2>
          <p className={styles.paragraph}>
            You represent that you are legally permitted to use the Services in your jurisdiction
            and that you will comply with all applicable laws. You may not use the Services if you
            are located in, ordinarily resident in, or a citizen of any jurisdiction where use of the
            Services is prohibited or restricted.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Changes &amp; termination</h2>
          <p className={styles.paragraph}>
            We may modify, suspend, or discontinue the Services or these Terms at any time. Continued
            use after changes become effective constitutes acceptance of the revised Terms. We may
            terminate or restrict access at our sole discretion, with or without notice.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. Governing law</h2>
          <p className={styles.paragraph}>
            These Terms are governed by the laws of the State of Delaware, United States, without
            regard to conflict-of-law principles. You agree that any dispute arising out of or relating
            to these Terms or the Services shall be brought exclusively in the state or federal courts
            located in Delaware, and you consent to personal jurisdiction in those courts.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. Contact</h2>
          <p className={styles.paragraph}>
            Questions regarding these Terms may be directed to{" "}
            <a href="mailto:legal@siphon.money" className={styles.inlineLink}>
              legal@siphon.money
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
