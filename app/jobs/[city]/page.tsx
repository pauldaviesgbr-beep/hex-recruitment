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
import { SEO_CITIES } from '@/lib/seo'
import styles from './page.module.css'

export default function CityJobsPage() {
  const params = useParams()
  const citySlug = params.city as string
  const cityInfo = SEO_CITIES[citySlug]
  const { jobs, loading } = useJobs()
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const filteredJobs = useMemo(() => {
    if (!cityInfo) return []
    const cityName = cityInfo.name.toLowerCase()
    return jobs.filter(job => {
      const loc = job.location.toLowerCase()
      const area = (job.area || '').toLowerCase()
      const city = (job.fullLocation?.city || '').toLowerCase()
      return loc.includes(cityName) || area.includes(cityName) || city.includes(cityName)
    })
  }, [jobs, cityInfo])

  useEffect(() => {
    if (filteredJobs.length > 0 && !selectedJob) {
      setSelectedJob(filteredJobs[0])
    }
  }, [filteredJobs, selectedJob])

  const formatSalary = (job: Job) => {
    if (job.salaryPeriod === 'hour') return `£${job.salaryMin}-${job.salaryMax}/hr`
    return `£${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k/year`
  }

  if (!cityInfo) {
    return notFound()
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading jobs in {cityInfo.name}...</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>Jobs in {cityInfo.name}</h1>
          <p className={styles.heroSubtitle}>
            Browse {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} available in {cityInfo.name}, {cityInfo.region}. Find your next role today.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/jobs" className={styles.ctaSecondary}>Browse All Jobs</Link>
            <Link href="/register/employee" className={styles.ctaPrimary}>Create Free Profile</Link>
          </div>
        </div>
      </section>

      <div className={styles.container}>
        <p className={styles.jobCount}>
          <span className={styles.jobCountHighlight}>{filteredJobs.length}</span> jobs in {cityInfo.name}
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
                    <p className={styles.listCardLocation}>{job.location}{job.area ? `, ${job.area}` : ''}</p>
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
                    <p className={styles.detailLocation}>{selectedJob.location}{selectedJob.area ? `, ${selectedJob.area}` : ''}</p>
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
                    <div className={styles.detailDescription} dangerouslySetInnerHTML={{ __html: selectedJob.fullDescription || selectedJob.description }} />
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
            <h2 className={styles.emptyTitle}>No jobs in {cityInfo.name} right now</h2>
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
