'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams, notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import CompanyLogo from '@/components/CompanyLogo'
import JobDetailModal from '@/components/JobDetailModal'
import JobPostingSchema from '@/components/JobPostingSchema'
import { Job } from '@/lib/mockJobs'
import { useJobs } from '@/lib/JobsContext'
import { SEO_SECTORS } from '@/lib/seo'
import styles from './page.module.css'
import { formatJobLocation } from '@/lib/jobCard'

export default function SectorJobsPage() {
  const params = useParams()
  const sectorSlug = params.sector as string
  const sectorInfo = SEO_SECTORS[sectorSlug]
  const { jobs, loading, error, refreshJobs } = useJobs()
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const filteredJobs = useMemo(() => {
    if (!sectorInfo) return []
    const sectorName = sectorInfo.name.toLowerCase()
    return jobs.filter(job => {
      const category = (job.category || '').toLowerCase()
      return category.includes(sectorName) || sectorName.includes(category)
    })
  }, [jobs, sectorInfo])

  useEffect(() => {
    if (filteredJobs.length > 0 && !selectedJob) {
      setSelectedJob(filteredJobs[0])
    }
  }, [filteredJobs, selectedJob])

  const formatSalary = (job: Job) => {
    if (job.salaryPeriod === 'hour') return `£${job.salaryMin}-${job.salaryMax}/hr`
    return `£${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k/year`
  }

  if (!sectorInfo) {
    return notFound()
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading {sectorInfo.name} jobs...</p>
        </div>
      </main>
    )
  }

  // THE FETCH FAILED, AND THIS PAGE MUST NOT CLAIM THE TOWN OR THE SECTOR
  // IS EMPTY. Falling through to the empty state below would print "No jobs
  // in X right now. New jobs are added daily" — a confident statement about
  // a whole place, on a page people arrive at from Google, when all that
  // happened is that OUR request failed.
  //
  // GUARDED ON jobs.length === 0 as well, so a failed background refresh
  // never replaces a page that is already showing roles.
  //
  // The words are the same as /jobs deliberately: the same thing failed and
  // the reader is looking at the same kind of object, a list of roles. The
  // icon is not the magnifying glass the empty state uses — a candidate who
  // genuinely has no matches and one whose request failed must not read
  // alike, and that has to hold at a glance, not only in the words.
  if (error && jobs.length === 0) {
    return (
      <main>
        <Header />
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5" />
              <path d="M12 16.5h.01" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>We couldn&apos;t load the roles</h2>
          <p className={styles.emptyText}>Something went wrong at our end. Try again in a moment.</p>
          <button className={styles.browseBtn} onClick={() => refreshJobs()}>Try again</button>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>{sectorInfo.name} Jobs</h1>
          <p className={styles.heroSubtitle}>
            Browse {filteredJobs.length} {sectorInfo.name.toLowerCase()} job{filteredJobs.length !== 1 ? 's' : ''} across the UK. Find your next role today.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/jobs" className={styles.ctaSecondary}>Browse All Jobs</Link>
            <Link href="/register/employee" className={styles.ctaPrimary}>Create Free Profile</Link>
          </div>
        </div>
      </section>

      <div className={styles.container}>
        <p className={styles.jobCount}>
          <span className={styles.jobCountHighlight}>{filteredJobs.length}</span> {sectorInfo.name.toLowerCase()} jobs
        </p>

        {filteredJobs.length > 0 ? (
          <div className={styles.splitLayout}>
            <div className={styles.jobListPanel}>
              {filteredJobs.map(job => (
                <div
                  key={job.id}
                  className={`${styles.listCard} ${selectedJob?.id === job.id ? styles.listCardActive : ''}`}
                  onClick={() => setSelectedJob(job)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedJob(job)}
                >
                  <div className={styles.listCardLogo}>
                    <CompanyLogo src={job.companyLogo} alt={job.company} className={styles.listCardLogoImg} />
                  </div>
                  <div className={styles.listCardContent}>
                    <h3 className={styles.listCardTitle}>{job.title}</h3>
                    <p className={styles.listCardCompany}>{job.company}</p>
                    <p className={styles.listCardLocation}>{formatJobLocation(job)}</p>
                    <p className={styles.listCardSalary}>{formatSalary(job)}</p>
                  </div>
                </div>
              ))}
            </div>

            {!isMobile && selectedJob && (
              <div className={styles.detailPanel}>
                <JobPostingSchema job={selectedJob} />
                <div className={styles.detailInner}>
                  <div className={styles.detailHeader}>
                    <h2 className={styles.detailTitle}>{selectedJob.title}</h2>
                    <p className={styles.detailCompany}>{selectedJob.company}</p>
                    <p className={styles.detailLocation}>{formatJobLocation(selectedJob)}</p>
                    <p className={styles.detailSalary}>{formatSalary(selectedJob)}</p>
                    <div className={styles.detailBadges}>
                      {selectedJob.employmentType.map(t => (
                        <span key={t} className={styles.detailBadge}>{t}</span>
                      ))}
                      {selectedJob.urgent && <span className={`${styles.detailBadge} ${styles.detailBadgeUrgent}`}>Urgent</span>}
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>Description</h3>
                    <div className={styles.detailDescription} dangerouslySetInnerHTML={{ __html: (() => { const DOMPurify = require('dompurify'); return DOMPurify.sanitize(selectedJob.fullDescription || selectedJob.description, { ALLOWED_TAGS: ['h2','h3','h4','p','br','strong','em','u','ul','ol','li','a','blockquote'] }) })() }} />
                  </div>
                  {selectedJob.requirements?.length > 0 && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>Requirements</h3>
                      <ul className={styles.detailList}>
                        {selectedJob.requirements.map((req, i) => <li key={i}>{req}</li>)}
                      </ul>
                    </div>
                  )}
                  {selectedJob.benefits?.length > 0 && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>Benefits</h3>
                      <ul className={styles.detailBenefits}>
                        {selectedJob.benefits.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>No {sectorInfo.name.toLowerCase()} jobs right now</h2>
            <p className={styles.emptyText}>New jobs are added daily. Browse all available jobs or check back soon.</p>
            <Link href="/jobs" className={styles.browseBtn}>Browse All Jobs</Link>
          </div>
        )}
      </div>

      {isMobile && selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </main>
  )
}
