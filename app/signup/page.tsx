'use client'

// WHICH ARE YOU? — the sign-up fork.
//
// THIS IS THE ONLY THING THE HEADER'S "Sign up" BUTTON POINTS AT, which is why
// it exists in the same branch as the header rather than three branches later.
// Before this, the header carried TWO doors — "Hire People" and "Find a Job" —
// and on a job post one of them was secretly the only way to join at all.
//
// IT IS NEVER A REDIRECT DESTINATION. Nothing bounces anybody here: not the
// apply gate, not a signed-out guard, not /register. A person arrives because
// they pressed Sign up. That matters, because a fork shown to somebody who was
// trying to do something else is one more screen between them and the thing —
// which is the fault the whole week has been about.
//
// THE WORDS ARE THE BRIEF'S. "Looking for work" and "Hiring staff" — not "job
// seeker", not "candidate", not "job searching". Those are our words for them,
// not theirs for themselves.

import Link from 'next/link'
import Header from '@/components/Header'
import LiveJobCount from '@/components/LiveJobCount'
import { Ico } from '@/components/icons'
import styles from './page.module.css'

export default function SignupForkPage() {
  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.wrap}>
        <h1 className={styles.title}>Which are you?</h1>
        <p className={styles.subtitle}>One tap. You can change it later by asking us.</p>

        <div className={styles.targets}>
          {/* LOOKING FOR WORK LEADS, and it is the filled one. Every link Paul
              posts is a job advert and every share is a job advert, so the
              overwhelming majority of people who reach any Thrive page at all
              are here to look for work. The employer route is not hidden — it
              is the same size, in the same place, one style lighter. */}
          <Link href="/register/employee" className={`${styles.target} ${styles.targetPrimary}`}>
            <span className={styles.targetIcon} aria-hidden="true">
              <Ico name="user" size={24} />
            </span>
            <span className={styles.targetText}>
              <span className={styles.targetTitle}>Looking for work</span>
              {/* THE COUNT IS LIVE, NEVER TYPED. It read 247 for weeks in
                  three places while the board carried more, and a number that
                  is wrong on the page where somebody decides whether to join
                  is worse than no number. "Free, always" is Paul's decision,
                  23 Aug 2026 — candidates are free and that is the model. */}
              <span className={styles.targetSub}>
                Apply to <LiveJobCount inline /> live roles. Free, always.
              </span>
            </span>
            <span className={styles.targetChevron} aria-hidden="true">
              <Ico name="arrow-right" size={20} />
            </span>
          </Link>

          <Link href="/register/employer-free" className={`${styles.target} ${styles.targetSecondary}`}>
            <span className={styles.targetIcon} aria-hidden="true">
              <Ico name="briefcase" size={24} />
            </span>
            <span className={styles.targetText}>
              <span className={styles.targetTitle}>Hiring staff</span>
              <span className={styles.targetSub}>Post a role. We approve your venue first.</span>
            </span>
            <span className={styles.targetChevron} aria-hidden="true">
              <Ico name="arrow-right" size={20} />
            </span>
          </Link>
        </div>

        <p className={styles.foot}>
          Already with us? <Link href="/login" className={styles.footLink}>Log in</Link>
        </p>
      </div>
    </main>
  )
}
