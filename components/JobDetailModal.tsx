'use client'

import { useState, useEffect, useRef } from 'react'
import { Job } from '@/lib/mockJobs'
import { supabase } from '@/lib/supabase'
import { useSavedJobs } from '@/lib/useSavedJobs'
import CompanyLogo from '@/components/CompanyLogo'
import { resolveJobBanner } from '@/lib/jobBanner'
import BrandedJobFallback from '@/components/BrandedJobFallback'
import BrandedLogoFallback from '@/components/BrandedLogoFallback'
import JobPostingSchema from '@/components/JobPostingSchema'
import { getTagCategory, WORK_STYLE_TAGS } from '@/lib/jobTags'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import { useAnalyticsTracking, ViewSource } from '@/hooks/useAnalyticsTracking'
import ApplyNowModal from '@/components/ApplyNowModal'
import styles from './JobDetailModal.module.css'
import { Ico } from '@/components/icons'

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
    // SINGULAR, AND THIS IS A SHARE URL RATHER THAN A NAVIGATION ONE.
    //
    // /jobs?id=<uuid> works perfectly for a human: the board reads the param
    // and opens this modal. But it is the BOARD's route, so the crawler that
    // builds a link preview gets the board's metadata — og:title "Hospitality
    // Jobs in the UK — Thrive" and the default site image. No role, no salary,
    // no photograph. /job/<uuid> is server-rendered per advert and carries the
    // role's own title, company, location, salary and 1200x630 image.
    //
    // Both forms load. Only one previews, and the difference is invisible
    // until someone pastes it into LinkedIn — which is exactly what a recruiter
    // does all day.
    //
    // The board's own router.push calls further down the codebase KEEP the
    // ?id= form: that is the page's internal selection state, not a link
    // anyone shares, and rewriting those would break the modal.
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
    if (!currentUserRole) {
      // Not logged in — gate at Apply, returning to the job's dedicated page
      // with ?apply=1 so the apply modal re-opens once authenticated.
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
      locationString = [job.location, job.area].filter(Boolean).join(', ')
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
            {(() => {
              // Banner cascade: job/employer banner → sector-matched stock → navy
              // fallback, so the detail header is never bare (incl. existing jobs
              // like the Goldenkeys "Head Chef" that were saved without a banner).
              const detailBanner = resolveJobBanner({ id: job.id, companyBanner: job.companyBanner, company: job.company, category: job.category })
              return (
                <div className={styles.bannerWrapper}>
                  {detailBanner
                    ? <img src={detailBanner} alt="" className={styles.banner} />
                    : job.companyLogo
                      ? <BrandedLogoFallback logoUrl={job.companyLogo} company={job.company} seed={job.id} />
                      : <BrandedJobFallback company={job.company} seed={job.id} />}
                  <div className={styles.bannerOverlay} />
                </div>
              )
            })()}
            <div className={styles.headerContent}>
              <div className={styles.companyLogo}>
                <CompanyLogo src={job.companyLogo} alt={job.company} />
              </div>
              <div className={styles.headerInfo}>
                <h1 className={styles.jobTitle}>{job.title}</h1>
                <p className={styles.companyName}>
                  {job.company}
                  {job.isRecruiterPosting && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#6366f1', background: '#eef2ff', padding: '0.15rem 0.4rem', borderRadius: 4 }}>Posted by recruiter</span>
                  )}
                </p>
                {job.companyWebsite && (
                  <a
                    href={job.companyWebsite.startsWith('http') ? job.companyWebsite : `https://${job.companyWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.websiteLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Ico name="globe" size={16} /> {job.companyWebsite.replace(/^https?:\/\//, '')}
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
                    <span className={styles.metaIcon}><Ico name="map-pin" size={20} /></span>
                    {job.fullLocation?.addressLine1
                      ? `${job.fullLocation.addressLine1}, ${job.fullLocation.city} ${job.fullLocation.postcode}`
                      : [job.location, job.area].filter(Boolean).join(', ')}
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
            {currentUserRole !== 'employer' && (
              <button
                className={`${styles.applyBtn} ${hasApplied ? styles.appliedBtn : ''}`}
                onClick={handleApply}
                disabled={hasApplied || checkingApplied}
              >
                {checkingApplied ? 'Checking...' : hasApplied ? 'Applied \u2713' : 'Apply now'}
              </button>
            )}
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
                    {copySuccess ? '✓ Copied!' : 'Copy link'}
                  </button>
                  <button onClick={() => handleShare('email')}>
                    <Ico name="mail" size={16} /> Email
                  </button>
                  <button onClick={() => handleShare('whatsapp')}>
                    <Ico name="message-square" size={16} /> WhatsApp
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
              <span className={styles.locationIcon}><Ico name="map-pin" size={20} /></span>
              <div className={styles.locationDetails}>
                {/* "London," WITH A TRAILING COMMA AND NOTHING AFTER IT.
                    226 OF THE 247 LIVE ADVERTS, not an edge case, and the
                    reason is that the guilty line is the one nobody would
                    look at. `fullLocation` is SYNTHESISED when the column is
                    null — lib/types.ts:121 returns
                    { addressLine1: row.location, city: '', postcode: '' } —
                    so addressLine1 is truthy for every ordinary advert, the
                    FIRST branch is taken, and it rendered
                    `{city}, {postcode}` with both empty: a paragraph
                    containing a comma and nothing else.

                    The obvious suspect was the else-branch below, which joins
                    location and area. It is barely reached, and "fixing" it
                    would have changed nothing on 226 pages while looking
                    exactly like a fix.

                    Both are guarded now, with the same filter(Boolean).join
                    idiom app/job/[id]/page.tsx already uses in three places —
                    and the empty line is dropped rather than rendered blank.

                    DISPLAY ONLY. The address data underneath is tangled (22
                    Goldenkeys rows with swapped fields, and line 180 writes
                    the synthesised object back) and is deliberately untouched
                    here. */}
                {job.fullLocation?.addressLine1 ? (
                  <>
                    <p>{job.fullLocation.addressLine1}</p>
                    {job.fullLocation.addressLine2 && <p>{job.fullLocation.addressLine2}</p>}
                    {[job.fullLocation.city, job.fullLocation.postcode].filter(Boolean).length > 0 && (
                      <p>{[job.fullLocation.city, job.fullLocation.postcode].filter(Boolean).join(', ')}</p>
                    )}
                  </>
                ) : (
                  <p>{[job.location, job.area].filter(Boolean).join(', ')}</p>
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

          {/* Full Description Section — hidden when empty or when it's the
              legacy auto-generated "Join … Apply now on Thrive." placeholder
              (so existing bare jobs don't show fabricated copy). */}
          {(() => {
            const raw = (job.fullDescription || job.description || '').replace(/<[^>]*>/g, '').trim()
            const isPlaceholder = /^join .+ as an? .+\.\s*apply now on thrive\.?$/i.test(raw)
            if (!raw || isPlaceholder) return null
            return (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Full Job Description</h2>
                <div className={styles.fullDescription}>
                  {renderDescription(job.fullDescription || job.description)}
                </div>
              </div>
            )
          })()}

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
              <Ico name="flag" size={16} /> Report this job
            </button>
          </div>
        </div>

        {/* Mobile Apply Button */}
        {currentUserRole !== 'employer' && (
          <div className={styles.mobileApplyBar}>
            <button
              className={`${styles.mobileApplyBtn} ${hasApplied ? styles.appliedBtn : ''}`}
              onClick={handleApply}
              disabled={hasApplied || checkingApplied}
            >
              {checkingApplied ? 'Checking...' : hasApplied ? 'Applied \u2713' : 'Apply now'}
            </button>
          </div>
        )}
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
