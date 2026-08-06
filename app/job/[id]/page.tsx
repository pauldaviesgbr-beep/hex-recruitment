'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import CompanyLogo from '@/components/CompanyLogo'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import ApplyNowModal from '@/components/ApplyNowModal'
import { Job } from '@/lib/mockJobs'
import { useJobs } from '@/lib/JobsContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { supabase } from '@/lib/supabase'
import { getTagCategory, WORK_STYLE_TAGS } from '@/lib/jobTags'
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking'
import styles from './page.module.css'

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = params.id as string
  const fromParam = searchParams.get('from')
  const { jobs, loading: jobsLoading } = useJobs()
  const { isSaved: checkSaved, toggleSave } = useSavedJobs()
  const { trackJobView, trackClickEvent } = useAnalyticsTracking()
  const [job, setJob] = useState<Job | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [checkingApplied, setCheckingApplied] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  // Find job from context
  useEffect(() => {
    if (!jobsLoading && jobs.length > 0) {
      const found = jobs.find(j => j.id === jobId)
      if (found) {
        setJob(found)
      } else {
        setNotFound(true)
      }
    }
  }, [jobId, jobs, jobsLoading])

  // Track job view
  useEffect(() => {
    if (job) {
      trackJobView(job.id, 'direct')
    }
  }, [job?.id, trackJobView])

  // Check auth and whether user has already applied
  useEffect(() => {
    if (!job) return
    const checkAuthAndDuplicate = async () => {
      setCheckingApplied(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setCurrentUserRole(session.user.user_metadata?.role || 'employee')
        try {
          const { data } = await supabase
            .from('job_applications')
            .select('id')
            .eq('job_id', job.id)
            .eq('candidate_id', session.user.id)
            .maybeSingle()
          if (data) {
            setHasApplied(true)
          }
        } catch {
          // Supabase query failed
        }
      }
      setCheckingApplied(false)
    }
    checkAuthAndDuplicate()
  }, [job?.id])

  // Auto-open the apply modal when arriving with ?apply=1 — e.g. a candidate
  // who tapped Apply while logged out, then signed up / logged in and was
  // returned here. Only fires once we know they're a logged-in candidate.
  useEffect(() => {
    if (
      searchParams.get('apply') === '1' &&
      currentUserRole === 'employee' &&
      !checkingApplied &&
      !hasApplied
    ) {
      setShowApplyModal(true)
    }
  }, [searchParams, currentUserRole, checkingApplied, hasApplied])

  useEffect(() => {
    if (!showShareMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-share-wrapper]')) setShowShareMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showShareMenu])

  const handleShare = async (method: 'copy' | 'email' | 'whatsapp') => {
    if (!job) return
    trackClickEvent(job.id, 'share_click')
    const jobUrl = `${window.location.origin}/job/${job.id}`
    const jobTitle = `${job.title} at ${job.company}`

    switch (method) {
      case 'copy':
        await navigator.clipboard.writeText(jobUrl)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
        break
      case 'email':
        window.open(`mailto:?subject=${encodeURIComponent(jobTitle)}&body=${encodeURIComponent(`Check out this job: ${jobUrl}`)}`)
        break
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(`${jobTitle}\n${jobUrl}`)}`)
        break
    }
    setShowShareMenu(false)
  }

  const handleApply = () => {
    if (!job) return
    if (!currentUserRole) {
      // Send them through the login/sign-up gate, returning to THIS job with
      // ?apply=1 so the apply modal re-opens automatically once authenticated.
      window.location.href = `/login/employee?redirect=${encodeURIComponent(`/job/${job.id}?apply=1`)}`
      return
    }
    if (currentUserRole === 'employer') {
      alert("You can't apply to jobs as an employer")
      return
    }
    if (hasApplied) return
    trackClickEvent(job.id, 'apply_click')
    setShowApplyModal(true)
  }

  const formatSalary = () => {
    if (!job) return ''
    const single = !job.salaryMax || job.salaryMin === job.salaryMax
    if (job.salaryPeriod === 'hour') {
      return single ? `£${job.salaryMin} per hour` : `£${job.salaryMin} - £${job.salaryMax} per hour`
    }
    return single
      ? `£${job.salaryMin.toLocaleString()} per year`
      : `£${job.salaryMin.toLocaleString()} - £${job.salaryMax.toLocaleString()} per year`
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
        return <h4 key={index} className={styles.descriptionHeading}>{paragraph.slice(2, -2)}</h4>
      }
      if (paragraph.trim() === '') {
        return <br key={index} />
      }
      return <p key={index} className={styles.descriptionParagraph}>{paragraph}</p>
    })
  }

  const getGoogleMapsUrl = () => {
    if (!job) return '#'
    let locationString: string
    if (job.fullLocation?.addressLine1) {
      const parts = [
        job.fullLocation.addressLine1,
        job.fullLocation.addressLine2,
        job.fullLocation.city,
        job.fullLocation.postcode
      ].filter(Boolean)
      locationString = parts.join(', ')
    } else {
      locationString = `${job.location}, ${job.area}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationString)}`
  }

  const similarJobs = useMemo(() => {
    if (!job) return []
    return jobs
      .filter(j => j.id !== job.id && j.status === 'active' && j.category === job.category)
      .slice(0, 4)
  }, [job, jobs])

  // Loading state
  if (jobsLoading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading job details...</p>
        </div>
      </main>
    )
  }

  // Not found
  if (notFound || (!jobsLoading && !job)) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.notFoundState}>
          <h2>Job Not Found</h2>
          <p>This job listing may have been removed or is no longer available.</p>
          <Link href="/jobs" className={styles.backBtn}>Browse All Jobs</Link>
        </div>
      </main>
    )
  }

  if (!job) return null

  return (
    <main className={styles.page}>
      <Header />
      {/* The JobPosting schema is rendered SERVER-SIDE in layout.tsx, which
          is where Google's crawler can actually see it. Rendering it here too
          would put two copies of the same JSON-LD on one page — and the client
          one is the copy that never reached a crawler in the first place. */}

      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbLink} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => {
            if (fromParam === 'applications') router.push('/applications')
            else if (fromParam === 'saved') router.push('/saved-jobs')
            else if (fromParam === 'my-jobs') router.push('/my-jobs')
            else if (currentUserRole === 'employer') router.push('/employer/dashboard')
            else router.push('/jobs')
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {fromParam === 'applications' ? 'Back to My Applications' : fromParam === 'saved' ? 'Back to Saved Jobs' : fromParam === 'my-jobs' ? 'Back to Manage Job Ads' : currentUserRole === 'employer' ? 'Back to Dashboard' : 'Back to Browse Jobs'}
          </button>
        </div>

        {/* Job Header */}
        <div className={styles.jobHeader}>
          {job.companyBanner && (
            <div className={styles.jobBanner}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={job.companyBanner} alt={job.company} />
            </div>
          )}
          <div className={styles.headerContent}>
            <div className={styles.companyLogo}>
              <CompanyLogo src={job.companyLogo} alt={job.company} />
            </div>
            <div className={styles.headerInfo}>
              <h1 className={styles.jobTitle}>{job.title}</h1>
              <p className={styles.companyName}>{job.company}</p>
              {job.companyWebsite && (
                <a
                  href={job.companyWebsite.startsWith('http') ? job.companyWebsite : `https://${job.companyWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.websiteLink}
                >
                  {job.companyWebsite.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>

          <div className={styles.headerDetails}>
            <div className={styles.headerMeta}>
              <a
                href={getGoogleMapsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.locationLink}
              >
                <span className={styles.metaIcon}>📍</span>
                {job.fullLocation?.addressLine1
                  ? `${job.fullLocation.addressLine1}, ${job.fullLocation.city} ${job.fullLocation.postcode}`
                  : `${job.location}, ${job.area}`}
              </a>
              <span className={styles.salary}>{formatSalary()}</span>
            </div>
            <div className={styles.badges}>
              {Array.isArray(job.employmentType)
                ? job.employmentType.map((type, i) => (
                    <span key={i} className={styles.badge}>{type}</span>
                  ))
                : job.employmentType && <span className={styles.badge}>{job.employmentType}</span>
              }
              {job.urgent && <span className={`${styles.badge} ${styles.urgentBadge}`}>Urgent</span>}
              {(job.tags || []).filter(t => WORK_STYLE_TAGS.has(t)).map(t => (
                <span key={t} className={`${styles.badge} ${styles.workStyleBadge}`}>{t}</span>
              ))}
            </div>
            {(job.tags || []).filter(t => !WORK_STYLE_TAGS.has(t)).length > 0 && (
              <div className={styles.jobTags}>
                {(job.tags || []).filter(t => !WORK_STYLE_TAGS.has(t)).map(tag => {
                  const cat = getTagCategory(tag)
                  return (
                    <span key={tag} className={`${styles.jobTag} ${cat ? styles[`jobTag_${cat}`] : ''}`}>
                      {tag}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Content Layout */}
        <div className={styles.contentGrid}>
          {/* Main Content */}
          <div className={styles.mainContent}>
            {/* Job Details */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Job Details</h2>
              <div className={styles.detailsGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Pay</span>
                  <span className={styles.detailValue}>{formatSalary()}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Job type</span>
                  <span className={styles.detailValue}>
                    {Array.isArray(job.employmentType) ? job.employmentType.join(', ') : job.employmentType || 'Not specified'}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Shift & schedule</span>
                  <span className={styles.detailValue}>{job.shiftSchedule || 'Not specified'}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Work location</span>
                  <span className={styles.detailValue}>{job.workLocationType || 'In person'}</span>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Location</h2>
              <a
                href={getGoogleMapsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.locationBlock}
              >
                <span className={styles.locationIcon}>📍</span>
                <div className={styles.locationDetails}>
                  {job.fullLocation?.addressLine1 ? (
                    <>
                      <p>{job.fullLocation.addressLine1}</p>
                      {job.fullLocation.addressLine2 && <p>{job.fullLocation.addressLine2}</p>}
                      <p>{job.fullLocation.city}, {job.fullLocation.postcode}</p>
                    </>
                  ) : (
                    <p>{job.location}, {job.area}</p>
                  )}
                </div>
              </a>
            </div>

            {/* Benefits */}
            {job.benefits && job.benefits.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Benefits</h2>
                <ul className={styles.benefitsList}>
                  {job.benefits.map((benefit, i) => (
                    <li key={i} className={styles.benefitItem}>
                      <span className={styles.checkIcon}>✓</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full Description */}
            {(job.fullDescription || job.description) && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Full Job Description</h2>
                <div className={styles.fullDescription}>
                  {renderDescription(job.fullDescription || job.description)}
                </div>
              </div>
            )}

            {/* Responsibilities */}
            {job.responsibilities && job.responsibilities.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Responsibilities</h2>
                <ul className={styles.requirementsList}>
                  {job.responsibilities.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requirements */}
            {job.requirements && job.requirements.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Requirements</h2>
                <ul className={styles.requirementsList}>
                  {job.requirements.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Skills */}
            {job.skillsRequired && job.skillsRequired.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Skills Required</h2>
                <div className={styles.skillsTags}>
                  {job.skillsRequired.map((skill, i) => (
                    <span key={i} className={styles.skillTag}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Info */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Additional Information</h2>
              <div className={styles.additionalInfo}>
                {job.shiftSchedule && job.shiftSchedule !== 'Flexible' && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Shift Schedule</span>
                    <span className={styles.infoValue}>{job.shiftSchedule}</span>
                  </div>
                )}
                {job.experienceRequired && job.experienceRequired !== 'Not specified' && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Experience Required</span>
                    <span className={styles.infoValue}>{job.experienceRequired}</span>
                  </div>
                )}
                {job.educationRequired && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Education</span>
                    <span className={styles.infoValue}>{job.educationRequired}</span>
                  </div>
                )}
                {job.workLocationType && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Work Location</span>
                    <span className={styles.infoValue}>{job.workLocationType}</span>
                  </div>
                )}
                {job.postedAt && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Posted</span>
                    <span className={styles.infoValue}>{job.postedAt}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Company Info */}
            {job.companyDescription && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>About {job.company}</h2>
                <p className={styles.companyDescription}>{job.companyDescription}</p>
              </div>
            )}

            {/* Similar Jobs */}
            {similarJobs.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Similar Jobs</h2>
                <div className={styles.similarJobsList}>
                  {similarJobs.map(sj => (
                    <Link key={sj.id} href={`/job/${sj.id}`} className={styles.similarJobCard}>
                      <div className={styles.similarJobInfo}>
                        <p className={styles.similarJobTitle}>{sj.title}</p>
                        <p className={styles.similarJobCompany}>{sj.company}</p>
                        <p className={styles.similarJobMeta}>{sj.location} · {sj.salaryPeriod === 'hour' ? `£${sj.salaryMin}-£${sj.salaryMax}/hr` : `£${Math.round(sj.salaryMin/1000)}k-£${Math.round(sj.salaryMax/1000)}k`}</p>
                      </div>
                      <span className={styles.similarJobArrow}>→</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Company Reviews */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Reviews for {job.company}</h2>
              <CompanyReviewsSummary companyName={job.company} />
            </div>

            {/* Footer Info */}
            <div className={styles.jobFooter}>
              <p className={styles.footerText}>
                {job.jobReference && `Job Reference: ${job.jobReference}`}
                {job.jobReference && job.category && ' | '}
                {job.category && `Category: ${job.category}`}
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarSticky}>
              {/* Apply Card */}
              <div className={styles.applyCard}>
                <button
                  className={`${styles.applyBtn} ${hasApplied ? styles.appliedBtn : ''}`}
                  onClick={handleApply}
                  disabled={hasApplied || checkingApplied}
                >
                  {checkingApplied ? 'Checking...' : hasApplied ? 'Applied ✓' : 'Apply Now'}
                </button>

                <div className={styles.actionRow}>
                  <button
                    className={`${styles.actionBtn} ${checkSaved(job.id) ? styles.saved : ''}`}
                    onClick={() => { if (!checkSaved(job.id)) trackClickEvent(job.id, 'save_click'); toggleSave(job.id) }}
                  >
                    {checkSaved(job.id) ? '★ Saved' : '☆ Save Job'}
                  </button>
                  <div className={styles.shareWrapper} data-share-wrapper>
                    <button
                      className={styles.actionBtn}
                      onClick={() => setShowShareMenu(!showShareMenu)}
                    >
                      ⤴ Share
                    </button>
                    {showShareMenu && (
                      <div className={styles.shareMenu}>
                        <button onClick={() => handleShare('copy')}>
                          {copySuccess ? '✓ Copied!' : '🔗 Copy link'}
                        </button>
                        <button onClick={() => handleShare('email')}>
                          📧 Email
                        </button>
                        <button onClick={() => handleShare('whatsapp')}>
                          💬 WhatsApp
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Info */}
              <div className={styles.quickInfo}>
                <h3 className={styles.quickInfoTitle}>Quick Info</h3>
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Salary</span>
                  <span className={styles.quickInfoValue}>{formatSalary()}</span>
                </div>
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Location</span>
                  <span className={styles.quickInfoValue}>{job.location}</span>
                </div>
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Job Type</span>
                  <span className={styles.quickInfoValue}>
                    {Array.isArray(job.employmentType) ? job.employmentType.join(', ') : job.employmentType || 'N/A'}
                  </span>
                </div>
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Posted</span>
                  <span className={styles.quickInfoValue}>{job.postedAt}</span>
                </div>
                {job.applicationCount > 0 && (
                  <div className={styles.quickInfoItem}>
                    <span className={styles.quickInfoLabel}>Applicants</span>
                    <span className={styles.quickInfoValue}>{job.applicationCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Apply Bar */}
      <div className={styles.mobileApplyBar}>
        <button
          className={`${styles.mobileApplyBtn} ${hasApplied ? styles.appliedBtn : ''}`}
          onClick={handleApply}
          disabled={hasApplied || checkingApplied}
        >
          {checkingApplied ? 'Checking...' : hasApplied ? 'Applied ✓' : 'Apply Now'}
        </button>
      </div>

      <ApplyNowModal
        job={job}
        isOpen={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        onSuccess={() => setHasApplied(true)}
      />
    </main>
  )
}
