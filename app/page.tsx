'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ThriveMark from '@/components/ThriveMark'
import FeaturedJobs from '@/components/FeaturedJobs'
import { supabase } from '@/lib/supabase'
import { supabaseJobToJob } from '@/lib/types'
import type { Job } from '@/lib/mockJobs'
import { formatJobSalary, formatJobLocation } from '@/lib/jobCard'
import { Ico } from '@/components/icons'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/constants/brand'
import { foundingPhraseShort } from '@/lib/trialUtils'
import styles from './page.module.css'

// Product demo clips (muted screen-captures) hosted in Supabase storage.
const DEMO_BASE = 'https://aaljufxcniacfggqiuls.supabase.co/storage/v1/object/public/job-banners/site'

export default function Home() {
  const router = useRouter()
  const [authRedirecting, setAuthRedirecting] = useState(false)
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null)
  const [liveJobs, setLiveJobs] = useState<number | null>(null)
  const [rolesWithSalary, setRolesWithSalary] = useState<number | null>(null)
  const [newestRoles, setNewestRoles] = useState<Job[]>([])
  const [searchWhat, setSearchWhat] = useState('')
  const [searchWhere, setSearchWhere] = useState('')

  // Redirect logged-in users to their dashboard (non-blocking — page renders immediately)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthRedirecting(true)
        const role = session.user.user_metadata?.role
        router.replace(role === 'employer' ? '/employer/dashboard' : '/dashboard')
      }
    }).catch(() => {
      // Supabase unreachable — just show landing page
    })
  }, [router])

  // Live founding-cohort counter. /api/check-spots counts rows with
  // subscription_tier='free' (the founding marker) and returns
  // spotsRemaining = EMPLOYER_COHORT_CAP - claimed. Fail-soft: on error
  // the hero falls back to the static "First N employers" copy.
  useEffect(() => {
    fetch('/api/check-spots')
      .then(r => r.json())
      .then(d => {
        if (typeof d?.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining)
      })
      .catch(() => {})
  }, [])

  // Live inventory proof — count of active roles on the board. Active jobs are
  // publicly readable, so the anon client can count them. Fail-soft (hidden on error).
  useEffect(() => {
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active')
      .then(({ count }) => { if (typeof count === 'number') setLiveJobs(count) })
  }, [])

  // HOW MANY LIVE ROLES ACTUALLY CARRY A FIGURE. `salary_max is not null` is
  // the wrong test and would have passed: two imported Goldenkeys rows store a
  // literal 0 in both salary columns. Above zero is the question, and there are
  // no rows with a min but no max, so this one filter is exact.
  //
  // Fail-soft in the honest direction: if this never answers, rolesWithSalary
  // stays null and the salary clause simply is not said. A claim we cannot
  // support has to fall out of the sentence, not default into it.
  useEffect(() => {
    supabase.from('jobs').select('*', { count: 'exact', head: true })
      .eq('status', 'active').gt('salary_max', 0)
      .then(({ count }) => { if (typeof count === 'number') setRolesWithSalary(count) })
  }, [])

  // The newest live roles, for the cards under the search.
  //
  // select('*') deliberately — a widened select is a change to a query and a
  // query is not type-checked. Naming a column that does not exist makes
  // PostgREST reject the WHOLE request, and the page would fall into its
  // no-roles branch and look like an empty board rather than an error. The
  // mapper takes the whole row anyway.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('posted_at', { ascending: false })
        .limit(4)
      if (!alive) return
      setNewestRoles((data || []).map(supabaseJobToJob))
    })()
    return () => { alive = false }
  }, [])

  // THE LABEL FOLLOWS THE DATA. "NEWEST TODAY" is a claim about today, and
  // nothing has been posted today — the newest live role is two days old, and
  // only 4 of 251 were posted in the last week. A hard-coded label would have
  // been false on the day it shipped.
  const newestPosted = newestRoles[0] ? new Date(newestRoles[0].postedDate || newestRoles[0].postedAt) : null
  const daysSinceNewest = newestPosted && !isNaN(newestPosted.getTime())
    ? Math.floor((Date.now() - newestPosted.getTime()) / 86400000)
    : null
  const newestLabel = daysSinceNewest === null ? 'NEWEST ON THRIVE'
    : daysSinceNewest <= 0 ? 'NEWEST TODAY'
    : daysSinceNewest <= 7 ? 'NEWEST THIS WEEK'
    : 'NEWEST ON THRIVE'

  // If a logged-in session was found, show minimal UI while redirecting
  if (authRedirecting) {
    return (
      <main>
        <Header />
        <div style={{ minHeight: '80vh' }} />
      </main>
    )
  }

  return (
    <main>
      <Header />

      {/* ── THE HERO IS THE JOB SEARCH ─────────────────────────────────────
          It used to be "From job ad to signed offer, in one place." with four
          employer proof cards and a "Hire on Thrive" primary. A stranger who
          taps a job post and lands here is looking for WORK, and the page they
          arrived on argued for the product to somebody else. Candidate signups
          were down ~50% and this is the top of that funnel.

          The employer story is not deleted — it is everything below this
          section, which is where it belongs.

          EVERY NUMBER AND CLAIM HERE COMES FROM THE ROWS. The design specified
          "251 roles live now, with the salary on every one" and 251 was right
          on the day it was written — but a figure typed into a page is a
          figure that goes stale silently, and the salary half is a CLAIM, not
          a count. Both are computed below. */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            Hospitality jobs worth{' '}
            <br className={styles.heroTitleBreak} />
            leaving your shift for.
          </h1>

          <form
            className={styles.heroSearch}
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              const params = new URLSearchParams()
              if (searchWhat.trim()) params.set('search', searchWhat.trim())
              if (searchWhere.trim()) params.set('city', searchWhere.trim())
              // Empty is not a dead end: with no terms this is "Browse all
              // jobs", which is exactly what the button says it is.
              router.push(params.toString() ? `/jobs?${params}` : '/jobs')
            }}
          >
            <div className={styles.heroField}>
              <Ico name="search" size={20} />
              <input
                type="search"
                className={styles.heroInput}
                value={searchWhat}
                onChange={(e) => setSearchWhat(e.target.value)}
                placeholder="Chef, bartender, manager…"
                aria-label="Job title or keyword"
              />
            </div>
            <span className={styles.heroFieldRule} aria-hidden="true" />
            <div className={styles.heroField}>
              <Ico name="map-pin" size={20} />
              <input
                type="text"
                className={styles.heroInput}
                value={searchWhere}
                onChange={(e) => setSearchWhere(e.target.value)}
                placeholder="Town or postcode"
                aria-label="Town or postcode"
              />
            </div>
            <button type="submit" className={styles.heroSearchBtn}>
              Browse all jobs
            </button>
          </form>

          {/* THE SALARY HALF IS A CLAIM AND IT IS FALSE TODAY FOR TWO ROWS.
              Two imported Goldenkeys listings carry salary_min = 0 AND
              salary_max = 0, so "the salary on every one" would be a sentence
              the board does not support. It is rendered only when the count of
              live roles with a real figure equals the count of live roles.
              Note that `salary_max is not null` is NOT the test — both those
              rows pass it. The value has to be above zero. */}
          {liveJobs !== null && liveJobs > 0 && (
            <p className={styles.heroUnderline}>
              <strong>{liveJobs.toLocaleString()}</strong> roles live now
              {rolesWithSalary !== null && rolesWithSalary === liveJobs && ', with the salary on every one'}
              . No account needed to look.
            </p>
          )}

        </div>
      </section>

      {/* THE NEWEST ROLES SIT BELOW THE NAVY, NOT INSIDE IT. The design frame
          closes the hero block after the roles-live line and puts the cards in
          their own section on the page background — white cards on navy read as
          part of the search, and they are not: they are the board starting. */}
      <section className={styles.heroRolesSection}>
        <div className={styles.heroRolesInner}>
        {/* "NEWEST TODAY" IS A CLAIM ABOUT TODAY. Nothing was posted today —
            the newest live role is from 21 Aug — so a hard-coded label would
            be false on the day it shipped, and false again on most days: only
            4 of the 251 live roles were posted in the last week. The label
            follows the data. */}
        {newestRoles.length > 0 && (
          <>
            <p className={styles.heroRolesEyebrow}>{newestLabel}</p>
            <div className={styles.heroRoles}>
              {newestRoles.map((job, i) => (
                <Link
                  key={job.id}
                  href={`/job/${job.id}`}
                  className={`${styles.heroRoleCard} ${i > 1 ? styles.heroRoleCardWide : ''}`}
                >
                  <span className={styles.heroRoleEmployer}>{job.company}</span>
                  {/* THE FULL TITLE, NOT TRUNCATED AT THE EN DASH. Cutting
                      there is right in admin and destroys the board: 40 live
                      listings collapse to "Chef De Partie", all from one
                      employer, and the phrase after the dash is the only
                      thing telling them apart. It wraps instead. */}
                  <span className={styles.heroRoleTitle}>{job.title}</span>
                  <span className={styles.heroRoleMeta}>
                    {formatJobSalary(job)} · {formatJobLocation(job)}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
        </div>
      </section>

      {/* The founding-cohort offer. It was inside the hero, arguing to
          employers on a screen that now belongs to candidates. It is the one
          money claim we are allowed to make, so it moves rather than goes. */}
      <p className={styles.foundingStrip}>
        {spotsRemaining !== null
          ? `${spotsRemaining} of ${EMPLOYER_COHORT_CAP} founding spots left · ${foundingPhraseShort()} · no card needed`
          : `First ${EMPLOYER_COHORT_CAP} employers get ${foundingPhraseShort()} · no card needed · free for candidates to apply`}
      </p>


      {/* Live roles strip — candidate funnel + proof of real inventory */}
      <FeaturedJobs />

      {/* See it in action — real product demos (pipeline + offer signing) */}
      <section className={styles.seeItSection}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>See Thrive in action</h2>
          <p className={styles.sectionSubtitle}>From job ad to signed offer without leaving the page — no spreadsheets, no CV black holes, no per-post fees.</p>
          <div className={styles.demoRows}>
            <div className={styles.demoRow}>
              <div className={styles.demoVideoWrap}>
                <video className={styles.demoVideo} src={`${DEMO_BASE}/pipeline.mp4`} poster={`${DEMO_BASE}/pipeline-poster.jpg`} autoPlay muted loop playsInline preload="metadata" />
              </div>
              <div className={styles.demoText}>
                <h3 className={styles.demoTitle}>Manage every applicant</h3>
                <p className={styles.demoBody}>Drag candidates through your pipeline and book interviews in a click. Every application tracked from CV to offer — no spreadsheets, no black holes.</p>
              </div>
            </div>
            <div className={styles.demoRow}>
              <div className={styles.demoVideoWrap}>
                <video className={styles.demoVideo} src={`${DEMO_BASE}/offer.mp4`} poster={`${DEMO_BASE}/offer-poster.jpg`} autoPlay muted loop playsInline preload="metadata" />
              </div>
              <div className={styles.demoText}>
                <h3 className={styles.demoTitle}>Make an offer in seconds</h3>
                <p className={styles.demoBody}>Generate a branded offer letter and sign it in-platform — signed both sides, no printing, scanning or chasing.</p>
              </div>
            </div>
            <div className={styles.demoRow}>
              <div className={styles.demoVideoWrap}>
                <video className={styles.demoVideo} src={`${DEMO_BASE}/ai-questions.mp4`} poster={`${DEMO_BASE}/ai-questions-poster.jpg`} autoPlay muted loop playsInline preload="metadata" />
              </div>
              <div className={styles.demoText}>
                <h3 className={styles.demoTitle}>AI interview questions</h3>
                <p className={styles.demoBody}>Thrive reads the CV and the role and suggests sharp, tailored questions — so you walk into every interview prepared.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You Get — free launch offer */}
      <section className={`${styles.benefits}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Everything you need to hire — completely free</h2>
          <p className={styles.sectionSubtitle}>The first {EMPLOYER_COHORT_CAP} employers get {foundingPhraseShort()}. No card. No catch.</p>
          <div className={`${styles.benefitsGrid}`}>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Post unlimited jobs</h3>
              <p className={styles.stepText}>Post unlimited jobs. Reach hospitality candidates actively searching in your area.</p>
            </div>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Search candidates directly</h3>
              <p className={styles.stepText}>Browse profiles by skills, location, and availability. Message candidates before they even apply.</p>
            </div>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Easy onboarding</h3>
              <p className={styles.stepText}>Send us your live roles and we&apos;ll build your account and load them for you — in minutes. Optional premium job imagery, free.</p>
            </div>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Analytics that show what works</h3>
              <p className={styles.stepText}>See which jobs get views, where candidates come from, and how your hiring funnel performs.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`${styles.finalCta}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.finalCtaTitle}>Ready to get started?</h2>
          <p className={styles.finalCtaText}>
            Join free today. No credit card required.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/register/employer-free" className={styles.ctaPrimary}>
              Hire on Thrive →
            </Link>
            <Link href="/register/employee" className={styles.ctaSecondary}>
              Find a job
            </Link>
          </div>
        </div>
      </section>

      {/* Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: BRAND_NAME,
              url: 'https://thrivecareer.co.uk',
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://thrivecareer.co.uk/jobs?search={search_term_string}',
                },
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: BRAND_NAME,
              url: 'https://thrivecareer.co.uk',
              logo: 'https://thrivecareer.co.uk/icon.svg',
              sameAs: ['https://www.linkedin.com/company/thrivecareers'],
            },
          ]),
        }}
      />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <ThriveMark size={24} />
            <div className={styles.footerBrandText}>
              <span className={styles.footerLogo}>Thrive</span>
              <span className={styles.footerTagline}>{BRAND_TAGLINE}</span>
            </div>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
            <button onClick={() => (window as any).__openCookiePreferences?.()} className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Cookie Settings</button>
            <Link href="/jobs" className={styles.footerLink}>Browse Jobs</Link>
            <a href="mailto:contact@thrivecareer.co.uk" className={styles.footerLink}>Contact Us</a>
          </div>
          <p className={styles.footerCopy}>&copy; 2026 Thrive. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
