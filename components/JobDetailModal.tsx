'use client'

import { useState, useEffect, useRef } from 'react'
import { Job } from '@/lib/mockJobs'
import { supabase } from '@/lib/supabase'
import { useSavedJobs } from '@/lib/useSavedJobs'
import CompanyLogo from '@/components/CompanyLogo'
import JobPostingSchema from '@/components/JobPostingSchema'
import { getTagCategory, WORK_STYLE_TAGS } from '@/lib/jobTags'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import { useAnalyticsTracking, ViewSource } from '@/hooks/useAnalyticsTracking'
import ApplyNowModal from '@/components/ApplyNowModal'
import styles from './JobDetailModal.module.css'

interface JobDetailModalProps {
  job: Job
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  viewSource?: ViewSource
}

export default function JobDetailModal({
  job,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  viewSource = 'direct',
}: JobDetailModalProps) {
  const { isSaved: checkSaved, toggleSave } = useSavedJobs()
  const { trackJobView, trackClickEvent } = useAnalyticsTracking()
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [checkingApplied, setCheckingApplied] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showApplyModal) {
          setShowApplyModal(false)
        } else {
          onClose()
        }
      }
      if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        onPrevious()
      }
      if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext, showApplyModal])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  // Scroll to top when job changes
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [job.id])

  // Track job view when modal opens or job changes
  useEffect(() => {
    trackJobView(job.id, viewSource)
  }, [job.id, viewSource, trackJobView])

  // Check auth status and whether user has already applied
  useEffect(() => {
    const checkAuthAndDuplicate = async () => {
      setCheckingApplied(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setCurrentUserRole(session.user.user_metadata?.role || 'employee')
        // Check for existing application in Supabase
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
          // Supabase query failed — assume not applied
        }
      }
      setCheckingApplied(false)
    }
    checkAuthAndDuplicate()
  }, [job.id])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleShare = async (method: 'copy' | 'email' | 'whatsapp') => {
    trackClickEvent(job.id, 'share_click')
    const jobUrl = `${window.location.origin}/jobs?id=${job.id}`
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
    if (!currentUserRole) {
      // Not logged in — redirect to login
      window.location.href = `/login/employee?redirect=${encodeURIComponent(`/jobs?id=${job.id}`)}`
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
    if (job.salaryPeriod === 'hour') {
      return `£${job.salaryMin} - £${job.salaryMax} per hour`
    }
    return `£${job.salaryMin.toLocaleString()} - £${job.salaryMax.toLocaleString()} per year`
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

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <JobPostingSchema job={job} />
      <div className={styles.modal} ref={modalRef}>
        {/* Navigation Arrows */}
        {hasPrevious && (
          <button
            className={`${styles.navArrow} ${styles.navPrev}`}
            onClick={onPrevious}
            aria-label="Previous job"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            className={`${styles.navArrow} ${styles.navNext}`}
            onClick={onNext}
            aria-label="Next job"
          >
            ›
          </button>
        )}

        {/* Close Button */}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          ×
        </button>

        {/* Content */}
        <div className={styles.content} ref={contentRef}>
          {/* Header with Banner */}
          <div className={styles.header}>
            {job.companyBanner && (
              <div className={styles.bannerWrapper}>
                <img src={job.companyBanner} alt="" className={styles.banner} />
                <div className={styles.bannerOverlay} />
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    🌐 {job.companyWebsite.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <div className={styles.headerMeta}>
                  <a
                    href={getGoogleMapsUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.metaItem} ${styles.locationLink}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className={styles.metaIcon}>📍</span>
                    {job.fullLocation?.addressLine1
                      ? `${job.fullLocation.addressLine1}, ${job.fullLocation.city} ${job.fullLocation.postcode}`
                      : `${job.location}, ${job.area}`}
                  </a>
                  <span className={styles.salary}>{formatSalary()}</span>
                </div>
                <div className={styles.employmentBadges}>
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
          </div>

          {/* Action Buttons */}
          <div className={styles.actions}>
            <button
              className={`${styles.applyBtn} ${hasApplied ? styles.appliedBtn : ''}`}
              onClick={handleApply}
              disabled={hasApplied || checkingApplied}
            >
              {checkingApplied ? 'Checking...' : hasApplied ? 'Applied \u2713' : 'Apply now'}
            </button>
            <button
              className={`${styles.actionBtn} ${checkSaved(job.id) ? styles.saved : ''}`}
              onClick={() => { if (!checkSaved(job.id)) trackClickEvent(job.id, 'save_click'); toggleSave(job.id) }}
              title={checkSaved(job.id) ? 'Remove from saved' : 'Save job'}
            >
              {checkSaved(job.id) ? '★' : '☆'}
            </button>
            <div className={styles.shareWrapper}>
              <button
                className={styles.actionBtn}
                onClick={() => setShowShareMenu(!showShareMenu)}
                title="Share job"
              >
                ⤴
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

          {/* Job Details Section */}
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

          {/* Location Section */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Location</h2>
            <a
              href={getGoogleMapsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.locationInfo} ${styles.locationLink}`}
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

          {/* Benefits Section */}
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

          {/* Full Description Section */}
          {(job.fullDescription || job.description) && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Full Job Description</h2>
              <div className={styles.fullDescription}>
                {renderDescription(job.fullDescription || job.description)}
              </div>
            </div>
          )}

          {/* Responsibilities Section */}
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

          {/* Requirements Section */}
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

          {/* Skills Section */}
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

          {/* Company Reviews */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Reviews for {job.company}</h2>
            <CompanyReviewsSummary companyName={job.company} />
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <p className={styles.footerText}>
              {job.jobReference && `Job Reference: ${job.jobReference}`}
              {job.jobReference && job.category && ' | '}
              {job.category && `Category: ${job.category}`}
            </p>
            <button className={styles.reportBtn}>
              🚩 Report this job
            </button>
          </div>
        </div>

        {/* Mobile Apply Button */}
        <div className={styles.mobileApplyBar}>
          <button
            className={`${styles.mobileApplyBtn} ${hasApplied ? styles.appliedBtn : ''}`}
            onClick={handleApply}
            disabled={hasApplied || checkingApplied}
          >
            {checkingApplied ? 'Checking...' : hasApplied ? 'Applied \u2713' : 'Apply now'}
          </button>
        </div>
      </div>

      <ApplyNowModal
        job={job}
        isOpen={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        onSuccess={() => setHasApplied(true)}
      />
    </div>
  )
}
