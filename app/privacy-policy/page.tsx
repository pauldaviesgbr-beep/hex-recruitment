'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import HoneycombLogo from '@/components/HoneycombLogo'
import styles from './page.module.css'

const sections = [
  { id: 'data-we-collect', label: 'Data We Collect' },
  { id: 'how-we-use', label: 'How We Use It' },
  { id: 'who-we-share', label: 'Who We Share With' },
  { id: 'job-seeker-visibility', label: 'Job Seeker Visibility' },
  { id: 'storage-security', label: 'Storage & Security' },
  { id: 'data-retention', label: 'Data Retention' },
  { id: 'your-rights', label: 'Your Rights (UK GDPR)' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'children', label: "Children's Privacy" },
  { id: 'international', label: 'International Transfers' },
  { id: 'changes', label: 'Changes to This Policy' },
  { id: 'contact', label: 'Contact Us' },
]

export default function PrivacyPolicyPage() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const top = element.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <main>
      <Header />

      {/* Hero Banner */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <Link href="/" className={styles.backLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Home
          </Link>
          <h1 className={styles.heroTitle}>Privacy Policy</h1>
          <p className={styles.heroDate}>Last updated: February 2026</p>
        </div>
      </section>

      <div className={styles.container}>
        {/* Intro */}
        <div className={styles.intro}>
          <p>
            Hex (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to
            protecting and respecting your privacy. This Privacy Policy explains how we collect, use,
            store, and protect your personal data when you use our website, applications, and services
            (the &quot;Platform&quot;).
          </p>
          <p>
            We operate in accordance with the <strong>UK General Data Protection Regulation (UK GDPR)</strong> and
            the <strong>Data Protection Act 2018</strong>. Hex is the data controller
            responsible for your personal data.
          </p>
        </div>

        {/* Quick Navigation */}
        <nav className={styles.quickNav} aria-label="Table of contents">
          <h2 className={styles.quickNavTitle}>Quick Navigation</h2>
          <div className={styles.quickNavLinks}>
            {sections.map((section, index) => (
              <button
                key={section.id}
                className={styles.quickNavLink}
                onClick={() => scrollToSection(section.id)}
              >
                <span className={styles.quickNavNumber}>{index + 1}</span>
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className={styles.content}>

          {/* 1. Data We Collect */}
          <section id="data-we-collect" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>1</span>
              Data We Collect
            </h2>
            <p>We collect the following types of personal data depending on how you use the Platform:</p>

            <h3 className={styles.subTitle}>Account Information</h3>
            <ul className={styles.list}>
              <li>Full name, email address, phone number</li>
              <li>Password (stored securely using industry-standard hashing)</li>
              <li>Account type (Job Seeker or Employer)</li>
            </ul>

            <h3 className={styles.subTitle}>Job Seeker Profiles</h3>
            <ul className={styles.list}>
              <li>Professional profile information (job title, bio, skills, experience)</li>
              <li>CV/resume uploads</li>
              <li>Work history, certifications, and qualifications</li>
              <li>Location and availability status</li>
              <li>Profile photograph (optional)</li>
            </ul>

            <h3 className={styles.subTitle}>Employer Information</h3>
            <ul className={styles.list}>
              <li>Company name, contact person, and business address</li>
              <li>Company description, industry, and size</li>
              <li>Company logo and website (optional)</li>
              <li>Company registration and VAT number (optional)</li>
            </ul>

            <h3 className={styles.subTitle}>Job Listings</h3>
            <ul className={styles.list}>
              <li>Job titles, descriptions, requirements, and responsibilities</li>
              <li>Salary information and employment type</li>
              <li>Location and work arrangement details</li>
            </ul>

            <h3 className={styles.subTitle}>Usage Data</h3>
            <ul className={styles.list}>
              <li>Pages visited, features used, and time spent on the Platform</li>
              <li>Search queries and filter preferences</li>
              <li>Device information, browser type, and IP address</li>
              <li>Interaction data (applications submitted, messages sent, profiles viewed)</li>
            </ul>

            <h3 className={styles.subTitle}>Payment Data</h3>
            <ul className={styles.list}>
              <li>Billing name and address (for employer subscriptions)</li>
              <li>Payment method details are processed securely by our payment provider (Stripe) and are <strong>never stored on our servers</strong></li>
              <li>Transaction history and subscription status</li>
            </ul>
          </section>

          {/* 2. How We Use Your Data */}
          <section id="how-we-use" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>2</span>
              How We Use Your Data
            </h2>
            <p>We use the data we collect for the following purposes:</p>

            <div className={styles.purposeGrid}>
              <div className={styles.purposeCard}>
                <h3 className={styles.purposeTitle}>Service Delivery</h3>
                <ul className={styles.list}>
                  <li>Creating and managing your account</li>
                  <li>Displaying your profile to relevant users</li>
                  <li>Facilitating job applications and messaging</li>
                  <li>Processing employer subscriptions and billing</li>
                </ul>
              </div>
              <div className={styles.purposeCard}>
                <h3 className={styles.purposeTitle}>Platform Improvement</h3>
                <ul className={styles.list}>
                  <li>Providing personalised job recommendations</li>
                  <li>Improving search results and matching algorithms</li>
                  <li>Analysing usage patterns to enhance features</li>
                  <li>Fixing bugs and improving performance</li>
                </ul>
              </div>
              <div className={styles.purposeCard}>
                <h3 className={styles.purposeTitle}>Communication</h3>
                <ul className={styles.list}>
                  <li>Sending notification emails and alerts</li>
                  <li>Subscription and billing reminders</li>
                  <li>Platform updates and security notices</li>
                  <li>Marketing (only with your consent)</li>
                </ul>
              </div>
              <div className={styles.purposeCard}>
                <h3 className={styles.purposeTitle}>Safety &amp; Legal</h3>
                <ul className={styles.list}>
                  <li>Preventing fraud and abuse</li>
                  <li>Enforcing our Terms of Service</li>
                  <li>Complying with legal obligations</li>
                  <li>Responding to lawful data requests</li>
                </ul>
              </div>
            </div>

            <p>
              Our legal bases for processing under UK GDPR include: contract performance, legitimate
              interests, consent, and legal obligation — depending on the specific processing activity.
            </p>
          </section>

          {/* 3. Who We Share Data With */}
          <section id="who-we-share" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>3</span>
              Who We Share Data With
            </h2>

            <div className={styles.highlightBox}>
              <h3 className={styles.highlightTitle}>We NEVER sell your personal data</h3>
              <p>
                Your data is never sold, rented, or traded to third parties for marketing or any other
                commercial purpose. Period.
              </p>
            </div>

            <p>We share your data only in the following limited circumstances:</p>

            <ul className={styles.list}>
              <li>
                <strong>Subscribed Employers:</strong> Job seeker profiles (including CV, skills,
                experience, and contact details) are visible to registered employers with an active
                paid subscription (from &pound;29.99/month) or during their 14-day free trial. Employers
                must agree to our Terms of Service and comply with UK GDPR when handling your data.
              </li>
              <li>
                <strong>Payment Processors:</strong> We use Stripe to securely process employer
                subscription payments. Stripe operates as an independent data controller for payment
                data. See{' '}
                <a href="https://stripe.com/gb/privacy" className={styles.link} target="_blank" rel="noopener noreferrer">
                  Stripe&apos;s Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Hosting &amp; Infrastructure Providers:</strong> Our Platform is hosted on
                secure cloud infrastructure. These providers process data on our behalf under strict
                data processing agreements.
              </li>
              <li>
                <strong>Legal Requirements:</strong> We may disclose data if required by law, court
                order, or government request, or to protect the rights, safety, or property of Hex
                and our users.
              </li>
            </ul>
          </section>

          {/* 4. Job Seeker Data Visibility */}
          <section id="job-seeker-visibility" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>4</span>
              Job Seeker Data Visibility
            </h2>
            <p>
              As a job seeker, you have control over your profile visibility. You can manage these
              settings at any time from your{' '}
              <Link href="/settings/privacy" className={styles.link}>Privacy Settings</Link> page:
            </p>
            <ul className={styles.list}>
              <li>
                <strong>Profile visibility:</strong> Choose whether your profile is visible to all
                employers, or hidden from search (private mode)
              </li>
              <li>
                <strong>Contact details:</strong> Optionally hide your email and phone number until
                you have connected with an employer
              </li>
              <li>
                <strong>Availability status:</strong> Control whether your availability is shown
                publicly on your profile
              </li>
              <li>
                <strong>Search results:</strong> Opt out of appearing in employer search results
              </li>
              <li>
                <strong>Profile bookmarking:</strong> Choose whether employers can save your profile
                to a shortlist
              </li>
            </ul>
            <p>
              Even with a public profile, your data is only accessible to registered employers with
              verified accounts. Anonymous visitors cannot see your full profile or contact information.
            </p>
          </section>

          {/* 5. Data Storage & Security */}
          <section id="storage-security" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>5</span>
              Data Storage &amp; Security
            </h2>
            <p>
              We take the security of your personal data seriously and implement appropriate technical
              and organisational measures to protect it:
            </p>
            <ul className={styles.list}>
              <li>All data is encrypted in transit using TLS/SSL encryption</li>
              <li>Passwords are securely hashed and never stored in plain text</li>
              <li>Database access is restricted using row-level security policies</li>
              <li>Payment card details are handled exclusively by Stripe and never touch our servers</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access to personal data is limited to authorised personnel only</li>
              <li>Automated backups with encryption at rest</li>
            </ul>
            <p>
              While we strive to protect your data, no method of electronic storage or transmission is
              100% secure. If you become aware of any security breach, please contact us immediately.
            </p>
          </section>

          {/* 6. Data Retention */}
          <section id="data-retention" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>6</span>
              Data Retention
            </h2>
            <p>We retain your personal data in accordance with the following schedule:</p>

            <div className={styles.retentionTable}>
              <div className={styles.retentionRow}>
                <div className={styles.retentionType}>Active accounts</div>
                <div className={styles.retentionPeriod}>Retained for the duration of your account</div>
              </div>
              <div className={styles.retentionRow}>
                <div className={styles.retentionType}>After account deletion</div>
                <div className={styles.retentionPeriod}>
                  <strong>30 days</strong> — data is permanently deleted, unless required for legal purposes
                </div>
              </div>
              <div className={styles.retentionRow}>
                <div className={styles.retentionType}>Financial records</div>
                <div className={styles.retentionPeriod}>
                  <strong>6 years</strong> — as required by HMRC for tax and accounting purposes
                </div>
              </div>
              <div className={styles.retentionRow}>
                <div className={styles.retentionType}>Usage and analytics data</div>
                <div className={styles.retentionPeriod}>
                  <strong>24 months</strong> — then anonymised or deleted
                </div>
              </div>
              <div className={styles.retentionRow}>
                <div className={styles.retentionType}>Support correspondence</div>
                <div className={styles.retentionPeriod}>
                  <strong>12 months</strong> after resolution
                </div>
              </div>
            </div>

            <p>
              You can request earlier deletion of your data at any time (see{' '}
              <button className={styles.inlineLink} onClick={() => scrollToSection('your-rights')}>
                Your Rights
              </button>
              {' '}below), except where we are legally required to retain it.
            </p>
          </section>

          {/* 7. Your Rights Under UK GDPR */}
          <section id="your-rights" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>7</span>
              Your Rights Under UK GDPR
            </h2>
            <p>
              Under the UK General Data Protection Regulation and the Data Protection Act 2018, you
              have the following rights regarding your personal data:
            </p>

            <div className={styles.rightsGrid}>
              <div className={styles.rightCard}>
                <span className={styles.rightIcon}>📄</span>
                <h3 className={styles.rightTitle}>Right to Access</h3>
                <p>Request a copy of all personal data we hold about you</p>
              </div>
              <div className={styles.rightCard}>
                <span className={styles.rightIcon}>✏️</span>
                <h3 className={styles.rightTitle}>Right to Rectify</h3>
                <p>Request correction of any inaccurate or incomplete data</p>
              </div>
              <div className={styles.rightCard}>
                <span className={styles.rightIcon}>🗑️</span>
                <h3 className={styles.rightTitle}>Right to Erase</h3>
                <p>Request deletion of your personal data (&quot;right to be forgotten&quot;)</p>
              </div>
              <div className={styles.rightCard}>
                <span className={styles.rightIcon}>⏸️</span>
                <h3 className={styles.rightTitle}>Right to Restrict</h3>
                <p>Request that we limit how we process your data</p>
              </div>
              <div className={styles.rightCard}>
                <span className={styles.rightIcon}>📦</span>
                <h3 className={styles.rightTitle}>Right to Portability</h3>
                <p>Receive your data in a structured, machine-readable format</p>
              </div>
              <div className={styles.rightCard}>
                <span className={styles.rightIcon}>🚫</span>
                <h3 className={styles.rightTitle}>Right to Object</h3>
                <p>Object to processing based on legitimate interests or for marketing</p>
              </div>
            </div>

            <p>
              You also have the <strong>right to withdraw consent</strong> at any time where we rely on
              consent as the legal basis for processing (e.g., marketing emails). Withdrawal of consent
              does not affect the lawfulness of processing carried out before withdrawal.
            </p>

            <div className={styles.highlightBox}>
              <h3 className={styles.highlightTitle}>How to exercise your rights</h3>
              <p>
                You can manage most settings directly from your{' '}
                <Link href="/settings/privacy" className={styles.link}>Privacy Settings</Link> page, or
                use the{' '}
                <Link href="/settings/privacy" className={styles.link}>Download My Data</Link> feature
                to export your data. For any other requests, email us at{' '}
                <a href="mailto:privacy@hexrecruitment.co.uk" className={styles.link}>
                  privacy@hexrecruitment.co.uk
                </a>
                . We will respond within <strong>30 days</strong>.
              </p>
            </div>

            <p>
              If you are not satisfied with our response, you have the right to lodge a complaint with
              the Information Commissioner&apos;s Office (ICO):
            </p>
            <div className={styles.contactBox}>
              <p><strong>Information Commissioner&apos;s Office (ICO)</strong></p>
              <p>Helpline: <strong>0303 123 1113</strong></p>
              <p>
                Website:{' '}
                <a href="https://ico.org.uk" className={styles.link} target="_blank" rel="noopener noreferrer">
                  ico.org.uk
                </a>
              </p>
            </div>
          </section>

          {/* 8. Cookies */}
          <section id="cookies" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>8</span>
              Cookies
            </h2>
            <p>
              We use cookies and similar technologies to provide, protect, and improve the Platform.
              Cookies are small text files stored on your device when you visit our website.
            </p>

            <h3 className={styles.subTitle}>Essential Cookies</h3>
            <p>
              Required for the Platform to function. These include authentication tokens, session
              management, and security cookies. These cannot be disabled.
            </p>

            <h3 className={styles.subTitle}>Functional Cookies</h3>
            <p>
              Remember your preferences and settings (e.g., search filters, notification preferences).
              These improve your experience but are not strictly necessary.
            </p>

            <h3 className={styles.subTitle}>Analytics Cookies</h3>
            <p>
              Help us understand how users interact with the Platform so we can improve it. These
              collect anonymised data about page visits, features used, and navigation patterns.
            </p>

            <p>
              You can manage cookie preferences through your browser settings. Note that disabling
              essential cookies may affect Platform functionality. We do not use advertising or
              third-party tracking cookies.
            </p>
          </section>

          {/* 9. Children's Privacy */}
          <section id="children" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>9</span>
              Children&apos;s Privacy
            </h2>
            <p>
              Hex is not intended for use by anyone under the age of 16. We do not
              knowingly collect personal data from children under 16 years of age.
            </p>
            <p>
              If we become aware that we have inadvertently collected data from a child under 16, we
              will take steps to delete that data as quickly as possible. If you believe a child under
              16 has provided us with personal data, please contact us immediately at{' '}
              <a href="mailto:privacy@hexrecruitment.co.uk" className={styles.link}>
                privacy@hexrecruitment.co.uk
              </a>
              .
            </p>
          </section>

          {/* 10. International Transfers */}
          <section id="international" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>10</span>
              International Transfers
            </h2>
            <p>
              Your data is primarily stored and processed within the United Kingdom and European
              Economic Area (EEA). Where data is transferred outside the UK/EEA (for example, to
              cloud infrastructure providers), we ensure appropriate safeguards are in place, including:
            </p>
            <ul className={styles.list}>
              <li>
                Standard Contractual Clauses (SCCs) approved by the UK Information Commissioner
              </li>
              <li>
                Transfers to countries with an adequacy decision from the UK Government
              </li>
              <li>
                Binding corporate rules where applicable
              </li>
            </ul>
            <p>
              You can contact us for more information about the specific safeguards applied to
              international transfers of your data.
            </p>
          </section>

          {/* 11. Changes to This Policy */}
          <section id="changes" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>11</span>
              Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices,
              technology, legal requirements, or for other operational reasons.
            </p>
            <p>
              Material changes will be communicated to you via email or Platform notification at least
              <strong> 14 days</strong> before taking effect. We will also update the &quot;Last
              updated&quot; date at the top of this page.
            </p>
            <p>
              We encourage you to review this Privacy Policy periodically. Continued use of the Platform
              after changes take effect constitutes your acknowledgement of the updated policy.
            </p>
          </section>

          {/* 12. Contact Us */}
          <section id="contact" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>12</span>
              Contact Us
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or how we
              handle your personal data, please contact our Data Protection team:
            </p>

            <div className={styles.contactBox}>
              <p><strong>Hex — Data Protection</strong></p>
              <p>
                Email:{' '}
                <a href="mailto:privacy@hexrecruitment.co.uk" className={styles.link}>
                  privacy@hexrecruitment.co.uk
                </a>
              </p>
            </div>

            <p>
              If you wish to make a complaint about how we handle your data, you can also contact the
              Information Commissioner&apos;s Office:
            </p>

            <div className={styles.contactBox}>
              <p><strong>Information Commissioner&apos;s Office (ICO)</strong></p>
              <p>Helpline: <strong>0303 123 1113</strong></p>
              <p>
                Website:{' '}
                <a href="https://ico.org.uk" className={styles.link} target="_blank" rel="noopener noreferrer">
                  ico.org.uk
                </a>
              </p>
            </div>

            <p className={styles.jurisdictionText}>
              This Privacy Policy is governed by and construed in accordance with the laws of England
              and Wales. Any disputes arising from this policy shall be subject to the exclusive
              jurisdiction of the courts of England and Wales.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <span className={styles.footerLogo}><HoneycombLogo size={20} color="currentColor" /> HEX</span>
            <p className={styles.footerTagline}>
              Connecting talent with opportunity
            </p>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLinkActive}>Privacy Policy</Link>
            <button onClick={() => (window as any).__openCookiePreferences?.()} className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Cookie Settings</button>
            <a href="mailto:privacy@hexrecruitment.co.uk" className={styles.footerLink}>Contact</a>
          </div>
          <p className={styles.footerCopyright}>
            &copy; {new Date().getFullYear()} Hex. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}
