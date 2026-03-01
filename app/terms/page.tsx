'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import HoneycombLogo from '@/components/HoneycombLogo'
import styles from './page.module.css'

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'accounts', label: 'User Accounts' },
  { id: 'employer-terms', label: 'Employer Terms' },
  { id: 'job-seeker-terms', label: 'Job Seeker Terms' },
  { id: 'subscriptions', label: 'Subscriptions & Billing' },
  { id: 'acceptable-use', label: 'Acceptable Use' },
  { id: 'ip', label: 'Intellectual Property' },
  { id: 'liability', label: 'Limitation of Liability' },
  { id: 'termination', label: 'Termination' },
  { id: 'privacy', label: 'Privacy & Data' },
  { id: 'changes', label: 'Changes to Terms' },
  { id: 'contact', label: 'Contact Us' },
]

export default function TermsPage() {
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
          <h1 className={styles.heroTitle}>Terms of Service</h1>
          <p className={styles.heroDate}>Last updated: February 2026</p>
        </div>
      </section>

      <div className={styles.container}>
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

          {/* 1. Overview */}
          <section id="overview" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>1</span>
              Overview
            </h2>
            <p>
              Hex (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is a UK-based online recruitment
              platform connecting employers and job seekers across all industries. These Terms of
              Service (&quot;Terms&quot;) govern your access to and use of the Hex website,
              applications, and services (collectively, the &quot;Service&quot; or &quot;Platform&quot;).
            </p>
            <p>
              By creating an account, accessing, or using the Service, you agree to be bound by these
              Terms. If you do not agree with these Terms, please do not use the Service.
            </p>
          </section>

          {/* 2. Eligibility */}
          <section id="eligibility" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>2</span>
              Eligibility
            </h2>
            <p>To use the Service, you must:</p>
            <ul className={styles.list}>
              <li>Be at least 16 years of age</li>
              <li>Have the legal capacity to enter into a binding agreement</li>
              <li>Not have been previously suspended or removed from the Platform</li>
              <li>Be a resident of, or authorised to work in, the United Kingdom</li>
            </ul>
            <p>
              By using the Service, you represent and warrant that you meet all of the above
              eligibility requirements.
            </p>
          </section>

          {/* 3. User Accounts */}
          <section id="accounts" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>3</span>
              User Accounts
            </h2>
            <p>Hex offers two types of accounts:</p>

            <div className={styles.cardGroup}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Job Seeker Account</h3>
                <ul className={styles.list}>
                  <li>Free to create and use</li>
                  <li>Create a professional profile</li>
                  <li>Upload your CV</li>
                  <li>Browse and apply for jobs</li>
                </ul>
              </div>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Employer Account</h3>
                <ul className={styles.list}>
                  <li>Requires paid subscription after free trial</li>
                  <li>Post job listings</li>
                  <li>Browse candidate profiles</li>
                  <li>Contact job seekers directly</li>
                </ul>
              </div>
            </div>

            <p>
              You are responsible for maintaining the security of your account and password. You must
              notify us immediately at{' '}
              <a href="mailto:support@hexrecruitment.co.uk" className={styles.link}>
                support@hexrecruitment.co.uk
              </a>{' '}
              if you become aware of any unauthorised access to your account.
            </p>
          </section>

          {/* 4. Employer Terms */}
          <section id="employer-terms" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>4</span>
              Employer Terms
            </h2>
            <p>As an employer using the Platform, you agree that:</p>
            <ul className={styles.list}>
              <li>
                All job listings must be accurate, lawful, and not misleading
              </li>
              <li>
                You must comply with all applicable UK employment laws, including the Equality Act 2010
              </li>
              <li>
                You must not discriminate based on age, disability, gender reassignment, marriage and
                civil partnership, pregnancy and maternity, race, religion or belief, sex, or sexual
                orientation
              </li>
              <li>You must provide genuine employment opportunities only</li>
              <li>You must respond to applicants in a professional and timely manner</li>
              <li>You must not misuse candidate data or contact information</li>
              <li>You must comply with UK GDPR when handling applicant data</li>
              <li>You must not post misleading salary information</li>
            </ul>
            <p>
              We reserve the right to verify employer details and may suspend or remove accounts found
              to be fraudulent or in violation of these Terms.
            </p>
          </section>

          {/* 5. Job Seeker Terms */}
          <section id="job-seeker-terms" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>5</span>
              Job Seeker Terms
            </h2>
            <p>As a job seeker using the Platform, you agree that:</p>
            <ul className={styles.list}>
              <li>
                All information you provide in your profile, CV, and applications must be accurate and
                truthful
              </li>
              <li>
                By uploading your CV, you grant Hex permission to store and display your
                information to registered employers with active subscriptions, in accordance with our
                Privacy Policy
              </li>
              <li>
                You may delete your profile and all associated data at any time through your account
                settings
              </li>
              <li>You must only apply for positions you are genuinely interested in</li>
            </ul>
            <p className={styles.warningText}>
              Spam applications, misuse of the messaging system, or other abusive behaviour will result
              in account suspension.
            </p>
          </section>

          {/* 6. Subscriptions & Billing */}
          <section id="subscriptions" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>6</span>
              Subscriptions &amp; Billing
            </h2>

            <div className={styles.highlightBox}>
              <h3 className={styles.highlightTitle}>Free Trial</h3>
              <p>
                New employer accounts receive a <strong>14-day free trial</strong> with full access to
                all Platform features. No payment details are required during the trial period.
              </p>
            </div>

            <p>After the trial period, employer access requires a paid subscription:</p>
            <ul className={styles.list}>
              <li>
                <strong>Monthly subscription:</strong> From &pound;29.99 per month (GBP, inclusive of VAT)
              </li>
              <li>Subscriptions renew automatically each month</li>
              <li>
                Cancellation requires a minimum of 1 week&apos;s (7 days&apos;) written notice via your
                account settings. Access continues until the end of the notice period
              </li>
              <li>Refunds are not provided for partial months</li>
            </ul>
            <p>
              We reserve the right to change subscription pricing with at least 30 days&apos; written
              notice to existing subscribers.
            </p>
          </section>

          {/* 7. Acceptable Use */}
          <section id="acceptable-use" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>7</span>
              Acceptable Use
            </h2>
            <p>When using the Platform, you must not:</p>
            <ul className={styles.list}>
              <li>Post false, misleading, or fraudulent content</li>
              <li>Spam other users or send unsolicited messages</li>
              <li>Harass, abuse, or threaten other users</li>
              <li>Scrape, crawl, or data-mine the Platform</li>
              <li>Attempt to gain unauthorised access to our systems</li>
              <li>Use the Platform for any unlawful purpose</li>
              <li>Impersonate another person or entity</li>
              <li>Upload malicious software or code</li>
              <li>Circumvent security features or access controls</li>
            </ul>
            <p>
              Violation of this policy may result in immediate account suspension or termination without
              notice.
            </p>
          </section>

          {/* 8. Intellectual Property */}
          <section id="ip" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>8</span>
              Intellectual Property
            </h2>
            <p>
              All content, design, logos, and software on Hex are owned by us or our
              licensors and are protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p>
              Users retain ownership of the content they upload (including CVs, job listings, and
              profile information). However, by uploading content to the Platform, you grant us a
              non-exclusive, worldwide, royalty-free licence to use, display, and distribute your
              content solely for the purpose of operating and providing the Service.
            </p>
            <p>
              You must not copy, modify, or distribute our proprietary content without our prior
              written permission.
            </p>
          </section>

          {/* 9. Limitation of Liability */}
          <section id="liability" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>9</span>
              Limitation of Liability
            </h2>
            <p>
              The Platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties
              of any kind, whether express or implied.
            </p>
            <ul className={styles.list}>
              <li>
                We do not guarantee that the Platform will be uninterrupted, error-free, or that all
                jobs posted are legitimate
              </li>
              <li>
                We are not responsible for employment decisions, outcomes, or disputes between employers
                and job seekers
              </li>
              <li>
                Our total liability shall not exceed the amount paid by you to us in the 12 months
                preceding any claim
              </li>
              <li>
                We are not liable for any indirect, incidental, special, or consequential damages
                arising from your use of the Platform
              </li>
            </ul>
          </section>

          {/* 10. Termination */}
          <section id="termination" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>10</span>
              Termination
            </h2>
            <p>We may suspend or terminate your account at our discretion if you:</p>
            <ul className={styles.list}>
              <li>Violate these Terms of Service</li>
              <li>Engage in fraudulent activity</li>
              <li>Fail to pay applicable subscription fees</li>
              <li>For any other reason, with reasonable notice provided</li>
            </ul>
            <p>
              You may delete your account at any time through your account settings. Upon termination
              or deletion, your right to access the Service ceases immediately, and we may delete your
              data in accordance with our Privacy Policy.
            </p>
          </section>

          {/* 11. Privacy & Data */}
          <section id="privacy" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>11</span>
              Privacy &amp; Data
            </h2>
            <p>
              We are committed to protecting your personal data in accordance with the UK General Data
              Protection Regulation (UK GDPR) and the Data Protection Act 2018. For full details on how
              we collect, use, store, and protect your data, please refer to our{' '}
              <Link href="/privacy-policy" className={styles.link}>
                Privacy Policy
              </Link>
              .
            </p>
            <p>You have the right to:</p>
            <ul className={styles.list}>
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Port your data to another service</li>
            </ul>
            <p>
              <strong>Data retention:</strong> We keep your data for as long as your account is active,
              plus a reasonable period afterwards for legal and administrative purposes, unless you
              request earlier deletion.
            </p>
          </section>

          {/* 12. Changes to Terms */}
          <section id="changes" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>12</span>
              Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be
              communicated to you via email or Platform notification at least 14 days before taking
              effect.
            </p>
            <p>
              Continued use of the Service after changes take effect constitutes your acceptance of the
              updated Terms. If you do not agree with the changes, you should stop using the Service
              and delete your account.
            </p>
          </section>

          {/* 13. Contact Us */}
          <section id="contact" className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>13</span>
              Contact Us
            </h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <div className={styles.contactBox}>
              <p>
                <strong>Email:</strong>{' '}
                <a href="mailto:support@hexrecruitment.co.uk" className={styles.link}>
                  support@hexrecruitment.co.uk
                </a>
              </p>
            </div>
            <p className={styles.jurisdictionText}>
              These Terms are governed by and construed in accordance with the laws of England and
              Wales. Any disputes arising from or relating to these Terms or your use of the Service
              shall be subject to the exclusive jurisdiction of the courts of England and Wales.
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
            <Link href="/terms" className={styles.footerLinkActive}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
            <button onClick={() => (window as any).__openCookiePreferences?.()} className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Cookie Settings</button>
            <a href="mailto:support@hexrecruitment.co.uk" className={styles.footerLink}>Contact</a>
          </div>
          <p className={styles.footerCopyright}>
            &copy; {new Date().getFullYear()} Hex. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}
