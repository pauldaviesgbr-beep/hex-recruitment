'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import CompanyLogo from '@/components/CompanyLogo'
import JobPostingSchema from '@/components/JobPostingSchema'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import { Job } from '@/lib/mockJobs'
import { useJobs } from '@/lib/JobsContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { useMessages } from '@/lib/MessagesContext'
import type { Conversation } from '@/lib/mockMessages'
import { supabase } from '@/lib/supabase'
import { getTagCategory } from '@/lib/jobTags'
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking'
import styles from './page.module.css'

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.id as string
  const { jobs, loading: jobsLoading } = useJobs()
  const { isSaved: checkSaved, toggleSave } = useSavedJobs()
  const { trackJobView, trackClickEvent } = useAnalyticsTracking()
  const { addConversation, refreshConversations } = useMessages()

  const [job, setJob] = useState<Job | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [applicationSubmitted, setApplicationSubmitted] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [checkingApplied, setCheckingApplied] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
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
        setCurrentUserId(session.user.id)
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
      window.location.href = `/login/employee?redirect=${encodeURIComponent(`/job/${job.id}`)}`
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

  const submitApplication = async () => {
    if (!job) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const candidateName = session.user.user_metadata?.full_name || 'Candidate'

      const { error: insertError } = await supabase
        .from('job_applications')
        .insert({
          job_id: job.id,
          candidate_id: session.user.id,
          status: 'pending',
          cover_letter: coverLetter || null,
          job_title: job.title,
          company: job.company,
        })
      if (insertError) {
        console.warn('Supabase insert warning:', insertError.message)
      }

      if (job.employerId) {
        try {
          await supabase.from('notifications').insert({
            user_id: job.employerId,
            type: 'new_application',
            title: 'New application received',
            message: `${candidateName} applied for ${job.title}`,
            link: '/my-jobs',
            related_id: job.id,
            related_type: 'application',
          })
        } catch {
          // Non-blocking
        }
      }

      fetch('/api/send-application-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          employerId: job.employerId,
          candidateName,
          candidateEmail: session.user.email,
          coverLetter: coverLetter || '',
        }),
      }).catch(() => console.warn('Failed to send application email'))

      const autoMessage = `Hi, I've just applied for the ${job.title} position at ${job.company}. I'm very interested in this opportunity and would love to discuss it further. Please feel free to review my profile and CV. Thank you!`

      if (job.employerId) {
        try {
          const { data: employerProfile } = await supabase
            .from('employer_profiles')
            .select('company_name')
            .eq('user_id', job.employerId)
            .maybeSingle()

          const employerName = employerProfile?.company_name || job.company

          const { data: convData, error: convError } = await supabase
            .from('conversations')
            .insert({
              participant_1: session.user.id,
              participant_2: job.employerId,
              participant_1_name: candidateName,
              participant_1_role: 'candidate',
              participant_2_name: employerName,
              participant_2_role: 'employer',
              participant_2_company: job.company,
              related_job_id: job.id,
              related_job_title: job.title,
              last_message: autoMessage,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (convError) {
            console.warn('Failed to create conversation:', convError.message)
          }

          if (convData) {
            await supabase
              .from('messages')
              .insert({
                conversation_id: convData.id,
                sender_id: session.user.id,
                sender_name: candidateName,
                sender_role: 'candidate',
                content: autoMessage,
                is_read: false,
              })

            const newConv: Conversation = {
              id: convData.id,
              connectionId: convData.id,
              participantId: job.employerId,
              participantName: employerName,
              participantRole: 'employer',
              participantCompany: job.company,
              participantProfilePicture: job.companyLogo || null,
              lastMessage: autoMessage,
              lastMessageAt: new Date().toISOString(),
              unreadCount: 0,
              isOnline: false,
              participantJobTitle: job.title,
            }
            addConversation(newConv)
          }
        } catch (convErr) {
          console.warn('Auto-message failed (non-blocking):', convErr)
        }
      }

      setHasApplied(true)
      setApplicationSubmitted(true)
    } catch (err) {
      console.error('Application error:', err)
      alert('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatSalary = () => {
    if (!job) return ''
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
      <JobPostingSchema job={job} />

      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/jobs" className={styles.breadcrumbLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Jobs
          </Link>
        </div>

        {/* Job Header */}
        <div className={styles.jobHeader}>
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
              </div>
              {job.tags && job.tags.length > 0 && (
                <div className={styles.jobTags}>
                  {job.tags.map(tag => {
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
                  <div className={styles.shareWrapper}>
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

      {/* Apply Modal */}
      {showApplyModal && (
        <div className={styles.applyOverlay} onClick={(e) => e.target === e.currentTarget && setShowApplyModal(false)}>
          <div className={styles.applyModal}>
            {!applicationSubmitted ? (
              <>
                <div className={styles.applyHeader}>
                  <h2>Apply to {job.company}</h2>
                  <button className={styles.applyClose} onClick={() => setShowApplyModal(false)}>×</button>
                </div>
                <div className={styles.applyBody}>
                  <div className={styles.applyJobInfo}>
                    <h3>{job.title}</h3>
                    <p>{job.location} • {formatSalary()}</p>
                  </div>
                  <div className={styles.applyField}>
                    <label>Cover Letter (optional)</label>
                    <textarea
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder="Tell the employer why you're a great fit for this role..."
                      rows={6}
                    />
                  </div>
                  <div className={styles.applyCvSection}>
                    <p className={styles.cvNote}>
                      Your profile CV will be attached automatically. Make sure it&apos;s up to date!
                    </p>
                    <Link href="/cv-builder" className={styles.updateCvLink}>
                      Update your CV →
                    </Link>
                  </div>
                </div>
                <div className={styles.applyFooter}>
                  <button
                    className={styles.submitBtn}
                    onClick={submitApplication}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.applySuccess}>
                <div className={styles.successIcon}>✓</div>
                <h2>Application Submitted!</h2>
                <p>Your application has been sent to {job.company}.</p>
                <p className={styles.successNote}>They will contact you if they&apos;re interested.</p>
                <button className={styles.successBtn} onClick={() => setShowApplyModal(false)}>
                  Continue Browsing
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
