'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import HoneycombLogo from '@/components/HoneycombLogo'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

function useCountUp(end: number, duration: number = 2000, startCounting: boolean = false) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!startCounting) return
    let startTime: number | null = null
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * end))
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [end, duration, startCounting])

  return count
}

export default function Home() {
  const router = useRouter()
  const statsRef = useRef<HTMLElement>(null)
  const [statsVisible, setStatsVisible] = useState(false)
  const [authRedirecting, setAuthRedirecting] = useState(false)
  const [jobsTarget, setJobsTarget] = useState(500)
  const [candidatesTarget, setCandidatesTarget] = useState(1000)

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

  // Fetch real counts from DB, use fallbacks if too low or on error
  useEffect(() => {
    supabase.from('jobs').select('id', { count: 'exact', head: true }).then(({ count, error }) => {
      if (!error && count && count > 50) setJobsTarget(count)
    })

    supabase.from('candidate_profiles').select('id', { count: 'exact', head: true }).then(({ count, error }) => {
      if (!error && count && count > 50) setCandidatesTarget(count)
    })
  }, [])

  // Observe stats bar
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  // Scroll reveal animations — observe all elements with data-reveal
  useEffect(() => {
    const reveals = document.querySelectorAll('[data-reveal]')
    if (!reveals.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.scrollRevealVisible)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    reveals.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const jobsCount = useCountUp(jobsTarget, 2000, statsVisible)
  const candidatesCount = useCountUp(candidatesTarget, 2000, statsVisible)
  const sectorsCount = useCountUp(20, 1500, statsVisible)

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

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            Where Talent Meets<br />Opportunity
          </h1>
          <p className={styles.heroSubtitle}>
            Connecting UK employers with qualified candidates across every sector.
            From hospitality to healthcare, tech to teaching — find your perfect match.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/jobs" className={styles.ctaPrimary}>
              Find a Job
            </Link>
            <Link href="/subscribe" className={styles.ctaSecondary}>
              Hire Talent
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className={`${styles.statsBar} ${styles.scrollReveal}`} ref={statsRef} data-reveal>
        <div className={styles.statsInner}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{jobsCount.toLocaleString()}+</span>
            <span className={styles.statLabel}>Jobs Posted</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>{candidatesCount.toLocaleString()}+</span>
            <span className={styles.statLabel}>Candidates</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>{sectorsCount}</span>
            <span className={styles.statLabel}>UK Sectors</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>Free</span>
            <span className={styles.statLabel}>For Job Seekers</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={`${styles.howItWorks} ${styles.scrollReveal}`} data-reveal>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <p className={styles.sectionSubtitle}>Get started in minutes — whether you're hiring or looking for work</p>

          <div className={`${styles.stepsGrid} ${styles.staggerChildren}`} data-reveal>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Create Your Profile</h3>
              <p className={styles.stepText}>Sign up as a job seeker or employer. It takes less than 2 minutes.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Search & Filter</h3>
              <p className={styles.stepText}>Browse jobs or candidates by sector, location, and availability.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Connect & Hire</h3>
              <p className={styles.stepText}>Apply to jobs or contact candidates directly. It's that simple.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className={`${styles.benefits} ${styles.scrollReveal}`} data-reveal>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
          <p className={styles.sectionSubtitle}>Choose the plan that works for you</p>
          <div className={`${styles.benefitsGrid} ${styles.staggerChildren}`} data-reveal>
            {/* Free - Job Seekers */}
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Free</h3>
              <p className={styles.benefitSubhead}>For Job Seekers</p>
              <div className={styles.priceTag}>
                <span className={styles.priceAmount}>£0</span>
                <span className={styles.pricePeriod}>/forever</span>
              </div>
              <ul className={styles.benefitList}>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Completely free — no hidden costs</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Browse thousands of UK jobs</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Create a profile and get noticed</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Apply directly with one click</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Track your applications</span>
                </li>
              </ul>
              <Link href="/register/employee" className={styles.benefitBtn}>
                Create Free Profile
              </Link>
            </div>

            {/* Standard - Employers */}
            <div className={`${styles.benefitCard} ${styles.benefitCardHighlight}`}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Standard</h3>
              <p className={styles.benefitSubhead}>For Employers</p>
              <div className={styles.priceTag}>
                <span className={styles.priceAmount}>£29.99</span>
                <span className={styles.pricePeriod}>/month</span>
              </div>
              <ul className={styles.benefitList}>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>14-day free trial — no card required</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Up to 3 active jobs at a time</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Browse and contact candidates</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Manage applications in dashboard</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>1 week cancellation notice</span>
                </li>
              </ul>
              <Link href="/subscribe" className={styles.benefitBtnHighlight}>
                Start Free 14-Day Trial
              </Link>
            </div>

            {/* Professional - Employers */}
            <div className={`${styles.benefitCard} ${styles.benefitCardPro}`}>
              <div className={styles.benefitBadge}>Most Popular</div>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Professional</h3>
              <p className={styles.benefitSubhead}>For Growing Teams</p>
              <div className={styles.priceTag}>
                <span className={styles.priceAmount}>£59.99</span>
                <span className={styles.pricePeriod}>/month</span>
              </div>
              <ul className={styles.benefitList}>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>14-day free trial — no card required</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Unlimited job listings</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Priority candidate access</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Advanced analytics dashboard</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>&#10003;</span>
                  <span>Dedicated account support</span>
                </li>
              </ul>
              <Link href="/subscribe" className={styles.benefitBtnHighlight}>
                Start Free 14-Day Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section className={`${styles.sectors} ${styles.scrollReveal}`} data-reveal>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>All UK Sectors Covered</h2>
          <p className={styles.sectionSubtitle}>From accountancy to transport — we cover every industry</p>
          <div className={styles.sectorPills}>
            {['Accountancy & Finance', 'Business & Management', 'Charity', 'Creative & Design', 'Digital & IT', 'Energy & Utilities', 'Engineering', 'Environment & Agriculture', 'Healthcare', 'Hospitality & Tourism', 'Law & Legal', 'Marketing & PR', 'Media', 'Property & Construction', 'Public Services', 'Recruitment & HR', 'Retail & Sales', 'Science', 'Teaching & Education', 'Transport & Logistics'].map(sector => (
              <Link key={sector} href={`/jobs?sector=${encodeURIComponent(sector)}`} className={styles.sectorPill}>{sector}</Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`${styles.finalCta} ${styles.scrollReveal}`} data-reveal>
        <div className={styles.sectionInner}>
          <h2 className={styles.finalCtaTitle}>Ready to Get Started?</h2>
          <p className={styles.finalCtaText}>
            Join thousands of professionals and employers already using Hex.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/jobs" className={styles.ctaPrimary}>
              Browse Jobs
            </Link>
            <Link href="/subscribe" className={styles.ctaSecondary}>
              Start Hiring
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <HoneycombLogo size={24} color="#FFE500" />
            <div className={styles.footerBrandText}>
              <span className={styles.footerLogo}>Hex</span>
              <span className={styles.footerTagline}>Talent Recruitment</span>
            </div>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
            <button onClick={() => (window as any).__openCookiePreferences?.()} className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Cookie Settings</button>
            <Link href="/jobs" className={styles.footerLink}>Browse Jobs</Link>
            <Link href="/subscribe" className={styles.footerLink}>Employer Plans</Link>
            <a href="mailto:contact@hexrecruitment.co.uk" className={styles.footerLink}>Contact Us</a>
          </div>
          <p className={styles.footerCopy}>&copy; 2026 Hex. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
