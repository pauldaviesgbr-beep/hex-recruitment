'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import JobDetailModal from '@/components/JobDetailModal'
import CompanyLogo from '@/components/CompanyLogo'
import JobPostingSchema from '@/components/JobPostingSchema'
import { Job } from '@/lib/mockJobs'
import { useJobs } from '@/lib/JobsContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { getTagCategory } from '@/lib/jobTags'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking'
import styles from './page.module.css'

export default function SavedJobsPage() {
  const { jobs, loading: jobsLoading } = useJobs()
  const { savedIds, savedCount, loading: savedLoading, isSaved, toggleSave, markAllSeen } = useSavedJobs()
  const { trackJobView } = useAnalyticsTracking()
  const router = useRouter()
  const listRef = useRef<HTMLDivElement>(null)

  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [savedTimestamps, setSavedTimestamps] = useState<Record<string, string>>({})
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [shortlistedJobIds, setShortlistedJobIds] = useState<Set<string>>(new Set())

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Mark saved jobs as seen when page loads
  useEffect(() => {
    if (!savedLoading) markAllSeen()
  }, [savedLoading, markAllSeen])

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      if (DEV_MODE) {
        const mockUser = getMockUser()
        if (mockUser?.user_metadata?.role === 'employee') {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'employee') {
        setIsAuthenticated(false)
        router.push('/login/employee')
        return
      }
      setIsAuthenticated(true)
      // Load shortlisted job IDs
      const { data: shortlisted } = await supabase
        .from('job_applications')
        .select('job_id')
        .eq('candidate_id', session.user.id)
        .eq('status', 'shortlisted')
      if (shortlisted) {
        setShortlistedJobIds(new Set(shortlisted.map((r: any) => r.job_id)))
      }
    }
    checkAuth()
  }, [router])

  // Fetch saved_at timestamps for display
  useEffect(() => {
    const fetchTimestamps = async () => {
      let userId: string | null = null
      if (DEV_MODE) {
        userId = getMockUser()?.id || null
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        userId = session?.user.id || null
      }
      if (!userId) return

      const { data } = await supabase
        .from('saved_jobs')
        .select('job_id, saved_at')
        .eq('candidate_id', userId)

      if (data) {
        const map: Record<string, string> = {}
        data.forEach(row => { map[row.job_id] = row.saved_at })
        setSavedTimestamps(map)
      }
    }
    if (isAuthenticated) fetchTimestamps()
  }, [isAuthenticated, savedIds])

  // Get saved jobs from jobs context, ordered by saved_at (newest first)
  const savedJobs = jobs
    .filter(j => savedIds.has(j.id))
    .sort((a, b) => {
      const aTime = savedTimestamps[a.id] || ''
      const bTime = savedTimestamps[b.id] || ''
      return bTime.localeCompare(aTime)
    })

  // Auto-select first job on desktop
  useEffect(() => {
    if (!isMobile && !selectedJob && savedJobs.length > 0) {
      setSelectedJob(savedJobs[0])
    }
  }, [isMobile, savedJobs.length])

  // If selected job was unsaved, clear selection
  useEffect(() => {
    if (selectedJob && !savedIds.has(selectedJob.id)) {
      setSelectedJob(savedJobs.length > 0 ? savedJobs[0] : null)
    }
  }, [savedIds])

  const selectJob = (job: Job) => {
    trackJobView(job.id, 'saved')
    if (isMobile) {
      setSelectedJob(job)
    } else {
      setSelectedJob(job)
    }
  }

  const closeJobModal = () => setSelectedJob(null)

  const getCurrentJobIndex = () => {
    if (!selectedJob) return -1
    return savedJobs.findIndex(j => j.id === selectedJob.id)
  }

  const navigateToJob = (direction: 'prev' | 'next') => {
    const idx = getCurrentJobIndex()
    if (direction === 'prev' && idx > 0) setSelectedJob(savedJobs[idx - 1])
    if (direction === 'next' && idx < savedJobs.length - 1) setSelectedJob(savedJobs[idx + 1])
  }

  const formatSalary = (job: Job) => {
    if (job.salaryPeriod === 'hour') return `£${job.salaryMin}-${job.salaryMax}/hr`
    return `£${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}/yr`
  }

  const formatSalaryFull = (job: Job) => {
    if (job.salaryPeriod === 'hour') return `£${job.salaryMin} - £${job.salaryMax} per hour`
    return `£${job.salaryMin.toLocaleString()} - £${job.salaryMax.toLocaleString()} per year`
  }

  const getGoogleMapsUrl = (job: Job) => {
    let locationString: string
    if (job.fullLocation?.addressLine1) {
      const parts = [job.fullLocation.addressLine1, job.fullLocation.addressLine2, job.fullLocation.city, job.fullLocation.postcode].filter(Boolean)
      locationString = parts.join(', ')
    } else {
      locationString = `${job.location}, ${job.area}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationString)}`
  }

  const renderDescription = (text: string) => {
    if (typeof window !== 'undefined' && text.includes('<') && text.includes('>')) {
      const DOMPurify = require('dompurify')
      const clean = DOMPurify.sanitize(text, {
        ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'blockquote'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
      })
      return <div dangerouslySetInnerHTML={{ __html: clean }} />
    }
    return text.split('\n').map((paragraph, index) => {
      if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
        return <h4 key={index}>{paragraph.slice(2, -2)}</h4>
      }
      if (paragraph.trim() === '') return <br key={index} />
      return <p key={index}>{paragraph}</p>
    })
  }

  const formatSavedDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Saved today'
    if (diffDays === 1) return 'Saved yesterday'
    if (diffDays < 7) return `Saved ${diffDays} days ago`
    return `Saved ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  }

  if (isAuthenticated === null || jobsLoading || savedLoading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading saved jobs...</p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />

      {/* Page Header */}
      <section className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <h1 className={styles.pageTitle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Saved Jobs
            {savedCount > 0 && <span className={styles.countBadge}>{savedCount}</span>}
          </h1>
        </div>
      </section>

      <div className={styles.container}>
        {savedJobs.length > 0 ? (
          <div className={styles.splitLayout}>
            {/* LEFT PANEL - Saved Jobs List */}
            <div className={styles.jobListPanel} ref={listRef}>
              {savedJobs.map(job => (
                <div
                  key={job.id}
                  className={`${styles.listCard} ${selectedJob?.id === job.id ? styles.listCardActive : ''}`}
                  onClick={() => selectJob(job)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectJob(job)}
                >
                  <div className={styles.listCardLogo}>
                    <CompanyLogo
                      src={job.companyLogo}
                      alt={job.company}
                      className={styles.listCardLogoImg}
                    />
                  </div>
                  <div className={styles.listCardContent}>
                    <h3 className={styles.listCardTitle}>{job.title}</h3>
                    <p className={styles.listCardCompany}>{job.company}</p>
                    <p className={styles.listCardLocation}>{job.location}{job.area ? `, ${job.area}` : ''}</p>
                    <p className={styles.listCardSalary}>{formatSalary(job)}</p>
                    {savedTimestamps[job.id] && (
                      <p className={styles.listCardSavedAt}>{formatSavedDate(savedTimestamps[job.id])}</p>
                    )}
                  </div>
                  {shortlistedJobIds.has(job.id) && (
                    <span className={styles.listCardStamp}>SHORTLISTED</span>
                  )}
                </div>
              ))}
            </div>

            {/* RIGHT PANEL - Job Detail (desktop only) */}
            {!isMobile && selectedJob && (
              <div className={styles.detailPanel}>
                <JobPostingSchema job={selectedJob} />
                <div className={styles.detailInner}>

                  {/* Banner */}
                  {selectedJob.companyBanner && (
                    <div className={styles.detailBanner}>
                      <img
                        src={selectedJob.companyBanner}
                        alt={selectedJob.company}
                        className={styles.detailBannerImg}
                      />
                    </div>
                  )}

                  {/* Header */}
                  <div className={styles.detailHeader}>
                    <h1 className={styles.detailTitle}>{selectedJob.title}</h1>
                    <p className={styles.detailCompany}>{selectedJob.company}</p>
                    {selectedJob.companyWebsite && (
                      <a
                        href={selectedJob.companyWebsite.startsWith('http') ? selectedJob.companyWebsite : `https://${selectedJob.companyWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.detailWebsite}
                      >
                        {selectedJob.companyWebsite.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    <a
                      href={getGoogleMapsUrl(selectedJob)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.detailLocation}
                    >
                      {selectedJob.fullLocation?.addressLine1
                        ? `${selectedJob.fullLocation.addressLine1}, ${selectedJob.fullLocation.city} ${selectedJob.fullLocation.postcode}`
                        : `${selectedJob.location}, ${selectedJob.area}`}
                    </a>
                    <p className={styles.detailSalary}>{formatSalaryFull(selectedJob)}</p>
                    <div className={styles.detailBadges}>
                      {Array.isArray(selectedJob.employmentType)
                        ? selectedJob.employmentType.map((type, i) => (
                            <span key={i} className={styles.detailBadge}>{type}</span>
                          ))
                        : selectedJob.employmentType && <span className={styles.detailBadge}>{selectedJob.employmentType}</span>
                      }
                      {selectedJob.urgent && <span className={`${styles.detailBadge} ${styles.detailBadgeUrgent}`}>Urgent</span>}
                    </div>
                    {selectedJob.tags && selectedJob.tags.length > 0 && (
                      <div className={styles.detailTags}>
                        {selectedJob.tags.map(tag => {
                          const cat = getTagCategory(tag)
                          return (
                            <span key={tag} className={`${styles.detailTag} ${cat ? styles[`detailTag_${cat}`] : ''}`}>
                              {tag}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={styles.detailActions}>
                    <Link href={`/job/${selectedJob.id}`} className={styles.detailApplyBtn} style={{ textAlign: 'center', textDecoration: 'none' }}>
                      View & Apply
                    </Link>
                    <button
                      className={styles.detailRemoveBtn}
                      onClick={() => toggleSave(selectedJob.id)}
                    >
                      Remove from Saved
                    </button>
                  </div>

                  {/* Details Grid */}
                  <div className={styles.detailSection}>
                    <h2 className={styles.detailSectionTitle}>Job Details</h2>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Pay</span>
                        <span className={styles.detailGridValue}>{formatSalaryFull(selectedJob)}</span>
                      </div>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Job type</span>
                        <span className={styles.detailGridValue}>
                          {Array.isArray(selectedJob.employmentType) ? selectedJob.employmentType.join(', ') : selectedJob.employmentType || 'Not specified'}
                        </span>
                      </div>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Shift & schedule</span>
                        <span className={styles.detailGridValue}>{selectedJob.shiftSchedule || 'Not specified'}</span>
                      </div>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Work location</span>
                        <span className={styles.detailGridValue}>{selectedJob.workLocationType || 'In person'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Benefits */}
                  {selectedJob.benefits && selectedJob.benefits.length > 0 && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Benefits</h2>
                      <ul className={styles.detailBenefits}>
                        {selectedJob.benefits.map((benefit, i) => (
                          <li key={i}>{benefit}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Description */}
                  {(selectedJob.fullDescription || selectedJob.description) && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Full Job Description</h2>
                      <div className={styles.detailDescription}>
                        {renderDescription(selectedJob.fullDescription || selectedJob.description)}
                      </div>
                    </div>
                  )}

                  {/* Requirements */}
                  {selectedJob.requirements && selectedJob.requirements.length > 0 && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Requirements</h2>
                      <ul className={styles.detailList}>
                        {selectedJob.requirements.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Skills */}
                  {selectedJob.skillsRequired && selectedJob.skillsRequired.length > 0 && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Skills Required</h2>
                      <div className={styles.detailSkills}>
                        {selectedJob.skillsRequired.map((skill, i) => (
                          <span key={i} className={styles.detailSkillTag}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Company Reviews */}
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>Reviews for {selectedJob.company}</h3>
                    <CompanyReviewsSummary companyName={selectedJob.company} />
                  </div>

                  {/* Footer */}
                  <div className={styles.detailFooter}>
                    <p>Posted {selectedJob.postedAt}</p>
                    {selectedJob.applicationCount > 0 && <p>{selectedJob.applicationCount} applicants</p>}
                    {selectedJob.category && <p>Category: {selectedJob.category}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>No saved jobs yet</h2>
            <p className={styles.emptyText}>Start browsing and save jobs you&apos;re interested in. They&apos;ll appear here for easy access.</p>
            <Link href="/jobs" className={styles.browseBtn}>
              Browse Jobs
            </Link>
          </div>
        )}
      </div>

      {/* Job Detail Modal - mobile only */}
      {isMobile && selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={closeJobModal}
          onPrevious={() => navigateToJob('prev')}
          onNext={() => navigateToJob('next')}
          hasPrevious={getCurrentJobIndex() > 0}
          hasNext={getCurrentJobIndex() < savedJobs.length - 1}
          viewSource="saved"
        />
      )}
    </main>
  )
}
