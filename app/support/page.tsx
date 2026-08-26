'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import ThriveMark from '@/components/ThriveMark'
import styles from './page.module.css'

// ── THE SUPPORT PAGE EXISTS BECAUSE A MAILTO IS NOT A URL. ────────────────
//
// The App Store listing requires a Support URL. There was no /support,
// /contact or /help route anywhere in this product — only mailto: links on
// /terms and /privacy-policy. That is a hard requirement, not a nicety.
//
// EVERY PROMISE ON THIS PAGE HAS TO BE ONE PAUL CAN KEEP. This project has
// already published a support route that went nowhere: privacy@ appeared four
// times on the Privacy Policy and the mailbox had never been created, so every
// message to it vanished with no bounce. A support page is the same shape of
// risk, concentrated.
//
// So, deliberately, this page contains:
//   · NO phone number — there isn't one
//   · NO response-time promise — nobody has committed to one
//   · NO postal address — the registered address is on the Terms, not invented here
//   · NO "support team" — it is one person, and saying otherwise is a lie
//   · NO opening hours
//
// The only address given is support@thrivecareer.co.uk, which is PROVEN to
// arrive: on 8 Aug 2026 a real employer emailed it asking how to remove a job
// ad, it landed in the inbox, and it was answered. It is also the address
// already published in 26 places across the product, so this page agrees with
// the rest rather than introducing a second one.
//
// COPY IS A PROPOSAL. Paul writes the final wording, as with the Privacy
// Policy. Nothing here should be treated as signed off.

export default function SupportPage() {
  return (
    <main>
      <Header />

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <Link href="/" className={styles.backLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Home
          </Link>
          <h1 className={styles.heroTitle}>Support</h1>
          <p className={styles.heroSub}>Something not working, or not sure where to look? Start here.</p>
        </div>
      </section>

      <div className={styles.container}>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Email us</h2>
          <p className={styles.body}>
            <a href="mailto:support@thrivecareer.co.uk" className={styles.emailLink}>
              support@thrivecareer.co.uk
            </a>
          </p>
          <p className={styles.body}>
            A real person reads it. If you are writing about a job advert or an application,
            including the job title and the company name will get you a faster answer.
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Ask Thrive</h2>
          <p className={styles.body}>
            There is a help button in the bottom corner of every page. It can answer the
            common questions straight away &mdash; how to post a job, how to apply, how
            matching works &mdash; without waiting for a reply.
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Common things</h2>

          <h3 className={styles.subTitle}>You cannot get into your account</h3>
          <p className={styles.body}>
            Go to <Link href="/login" className={styles.inlineLink}>the login page</Link> and use
            &ldquo;Forgot it?&rdquo;. Open the link in the <strong>newest</strong> email we send you
            &mdash; if you ask for a second link, the first one stops working.
          </p>

          <h3 className={styles.subTitle}>You want your data, or you want it deleted</h3>
          <p className={styles.body}>
            Both are in{' '}
            <Link href="/settings/privacy" className={styles.inlineLink}>Settings &rarr; Privacy</Link>.
            You can download what we hold, and you can delete your account yourself &mdash;
            it happens immediately, and{' '}
            <Link href="/privacy-policy" className={styles.inlineLink}>the Privacy Policy</Link>{' '}
            explains exactly what is removed and what is kept.
          </p>

          <h3 className={styles.subTitle}>You want to report something on the site</h3>
          <p className={styles.body}>
            Email the address above and tell us what you saw and where. If it is a job advert,
            the link to it is the most useful thing you can send.
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>The legal pages</h2>
          <p className={styles.body}>
            <Link href="/terms" className={styles.inlineLink}>Terms of Service</Link>
            {' · '}
            <Link href="/privacy-policy" className={styles.inlineLink}>Privacy Policy</Link>
          </p>
        </section>

      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.footerLogo}><ThriveMark size={20} /> THRIVE</span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
            <Link href="/support" className={styles.footerLinkActive}>Support</Link>
          </div>
          <p className={styles.footerCopyright}>
            &copy; {new Date().getFullYear()} Thrive. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}
