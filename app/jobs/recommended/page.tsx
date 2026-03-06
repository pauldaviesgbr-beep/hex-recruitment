'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import JobDetailModal from '@/components/JobDetailModal'
import CompanyLogo from '@/components/CompanyLogo'
import JobPostingSchema from '@/components/JobPostingSchema'
import { Job } from '@/lib/mockJobs'
import { Candidate } from '@/lib/mockCandidates'
import { useJobs } from '@/lib/JobsContext'
import { useMessages } from '@/lib/MessagesContext'
import type { Conversation } from '@/lib/mockMessages'
import { supabaseProfileToCandidate } from '@/lib/types'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import { scoreAndRankJobs, RecommendedJob } from '@/lib/recommendations'
import { supabase } from '@/lib/supabase'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { getTagCategory } from '@/lib/jobTags'
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking'
import styles from './page.module.css'

export default function RecommendedJobsPage() {
  const { jobs, loading: jobsLoading } = useJobs()
  const { addConversation } = useMessages()
  const { isSaved, toggleSave } = useSavedJobs()
  const { trackJobView, trackClickEvent } = useAnalyticsTracking()
  const router = useRouter()
  const listRef = useRef<HTMLDivElement>(null)

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set())
  const [viewedJobs, setViewedJobs] = useState<{ job_id: string; viewed_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [profileComplete, setProfileComplete] = useState(true)
  const [selectedJob, setSelectedJob] = useState<RecommendedJob | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Apply flow state
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [applicationSubmitted, setApplicationSubmitted] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [checkingApplied, setCheckingApplied] = useState(false)
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null)
  const [shortlistedJobIds, setShortlistedJobIds] = useState<Set<string>>(new Set())

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Check auth and load candidate data
  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setIsLoggedIn(false)
        setLoading(false)
        return
      }

      setIsLoggedIn(true)

      const [profileResult, applicationsResult, viewsResult] = await Promise.all([
        supabase
          .from('candidate_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('job_applications')
          .select('job_id, status')
          .eq('candidate_id', session.user.id),
        supabase
          .from('job_views')
          .select('job_id, viewed_at')
          .eq('viewer_id', session.user.id)
          .order('viewed_at', { ascending: false })
          .limit(100),
      ])

      if (profileResult.data) {
        const candidateData = supabaseProfileToCandidate(profileResult.data)
        setCandidate(candidateData)
        const hasSkills = (candidateData.skills || []).length > 0
        const hasJobTitle = !!candidateData.jobTitle
        const hasLocation = !!candidateData.location
        setProfileComplete(hasSkills || hasJobTitle || hasLocation)
      } else {
        setProfileComplete(false)
      }

      if (applicationsResult.data) {
        const ids = new Set(applicationsResult.data.map((a: any) => a.job_id))
        setAppliedJobIds(ids)
        const sIds = new Set(
          applicationsResult.data.filter((a: any) => a.status === 'shortlisted').map((a: any) => a.job_id)
        )
        setShortlistedJobIds(sIds)
      }

      if (viewsResult.data) {
        setViewedJobs(viewsResult.data)
      }

      setLoading(false)
    }

    loadData()
  }, [])

  // Calculate recommendations
  const recommendedJobs = useMemo(() => {
    if (!candidate || jobsLoading || jobs.length === 0) return []
    return scoreAndRankJobs(jobs, candidate, appliedJobIds, viewedJobs)
  }, [jobs, candidate, appliedJobIds, viewedJobs, jobsLoading])

  // Auto-select first job on desktop
  useEffect(() => {
    if (isMobile) return
    if (recommendedJobs.length > 0) {
      setSelectedJob(prev => {
        if (prev && recommendedJobs.some(j => j.id === prev.id)) return prev
        return recommendedJobs[0]
      })
    } else {
      setSelectedJob(null)
    }
  }, [recommendedJobs, isMobile])

  // Check if user has already applied to the selected job
  useEffect(() => {
    if (!selectedJob) return
    setHasApplied(false)
    setApplicationStatus(null)
    setShowApplyModal(false)
    setApplicationSubmitted(false)
    setCoverLetter('')

    const checkExistingApplication = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setCheckingApplied(false)
        return
      }
      setCheckingApplied(true)
      try {
        const { data } = await supabase
          .from('job_applications')
          .select('id, status')
          .eq('job_id', selectedJob.id)
          .eq('candidate_id', session.user.id)
          .maybeSingle()
        if (data) {
          setHasApplied(true)
          setApplicationStatus(data.status)
        }
      } catch {
        // Assume not applied
      }
      setCheckingApplied(false)
    }
    checkExistingApplication()
  }, [selectedJob?.id])

  const selectJob = (job: RecommendedJob) => {
    trackJobView(job.id, 'recommendation')
    if (isMobile) {
      setSelectedJob(job)
    } else {
      setSelectedJob(job)
    }
  }

  const closeJobModal = () => {
    setSelectedJob(null)
  }

  const navigateToJob = (direction: 'prev' | 'next') => {
    if (!selectedJob) return
    const currentIndex = recommendedJobs.findIndex(j => j.id === selectedJob.id)
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < recommendedJobs.length) {
      setSelectedJob(recommendedJobs[newIndex])
    }
  }

  const getCurrentJobIndex = () => {
    if (!selectedJob) return -1
    return recommendedJobs.findIndex(j => j.id === selectedJob.id)
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

  const formatSalary = (job: Job) => {
    if (job.salaryPeriod === 'hour') {
      return `£${job.salaryMin}-${job.salaryMax}/hr`
    }
    return `£${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k/yr`
  }

  const formatSalaryFull = (job: Job) => {
    if (job.salaryPeriod === 'hour') return `£${job.salaryMin} - £${job.salaryMax} per hour`
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
        return <h4 key={index} style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>{paragraph.slice(2, -2)}</h4>
      }
      if (paragraph.trim() === '') return <br key={index} />
      return <p key={index} style={{ margin: '0 0 0.5rem', lineHeight: 1.6 }}>{paragraph}</p>
    })
  }

  // Get match data for the selected job
  const selectedJobMatch = selectedJob
    ? recommendedJobs.find(j => j.id === selectedJob.id)
    : null

  // Apply flow handlers
  const handleApply = () => {
    if (!selectedJob) return
    if (!isLoggedIn) {
      router.push('/login/employee')
      return
    }
    if (hasApplied) return
    trackClickEvent(selectedJob.id, 'apply_click')
    setShowApplyModal(true)
  }

  const submitApplication = async () => {
    if (!selectedJob) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const candidateName = session.user.user_metadata?.full_name || 'Candidate'

      // 1. Insert job_applications
      const { error: insertError } = await supabase
        .from('job_applications')
        .insert({
          job_id: selectedJob.id,
          candidate_id: session.user.id,
          status: 'pending',
          cover_letter: coverLetter || null,
          job_title: selectedJob.title,
          company: selectedJob.company,
        })
      if (insertError) {
        console.warn('Supabase insert warning:', insertError.message)
      }

      // 2. Send notification to employer
      if (selectedJob.employerId) {
        try {
          await supabase.from('notifications').insert({
            user_id: selectedJob.employerId,
            type: 'new_application',
            title: 'New application received',
            message: `${candidateName} applied for ${selectedJob.title}`,
            link: '/my-jobs',
            related_id: selectedJob.id,
            related_type: 'application',
          })
        } catch {
          // Non-blocking
        }
      }

      // 3. Send email (non-blocking)
      fetch('/api/send-application-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: selectedJob.title,
          company: selectedJob.company,
          employerId: selectedJob.employerId,
          candidateName,
          candidateEmail: session.user.email,
          coverLetter: coverLetter || '',
        }),
      }).catch(() => console.warn('Failed to send application email'))

      // 4. Auto-message to employer
      const autoMessage = `Hi, I've just applied for the ${selectedJob.title} position at ${selectedJob.company}. I'm very interested in this opportunity and would love to discuss it further. Please feel free to review my profile and CV. Thank you!`

      if (selectedJob.employerId) {
        try {
          const { data: employerProfile } = await supabase
            .from('employer_profiles')
            .select('company_name')
            .eq('user_id', selectedJob.employerId)
            .maybeSingle()

          const employerName = employerProfile?.company_name || selectedJob.company

          const { data: convData, error: convError } = await supabase
            .from('conversations')
            .insert({
              participant_1: session.user.id,
              participant_2: selectedJob.employerId,
              participant_1_name: candidateName,
              participant_1_role: 'candidate',
              participant_2_name: employerName,
              participant_2_role: 'employer',
              participant_2_company: selectedJob.company,
              related_job_id: selectedJob.id,
              related_job_title: selectedJob.title,
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
              participantId: selectedJob.employerId,
              participantName: employerName,
              participantRole: 'employer',
              participantCompany: selectedJob.company,
              participantProfilePicture: selectedJob.companyLogo || null,
              lastMessage: autoMessage,
              lastMessageAt: new Date().toISOString(),
              unreadCount: 0,
              isOnline: false,
              participantJobTitle: selectedJob.title,
            }
            addConversation(newConv)
          }
        } catch (convErr) {
          console.warn('Auto-message failed (non-blocking):', convErr)
        }
      }

      setHasApplied(true)
      setApplicationSubmitted(true)
      // Update the applied set so this job gets filtered on next calc
      setAppliedJobIds(prev => new Set([...Array.from(prev), selectedJob.id]))
    } catch (err) {
      console.error('Application error:', err)
      alert('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main>
      <Header />

      {/* Slim dark banner */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            <svg className={styles.heroIcon} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            Recommended For You
          </h1>
          <p className={styles.heroSubtitle}>
            Jobs matched to your skills, experience, and preferences
          </p>
        </div>
      </section>

      <div className={styles.container}>
        {/* Not logged in */}
        {isLoggedIn === false && (
          <div className={styles.notLoggedIn}>
            <h2 className={styles.notLoggedInTitle}>Sign in to see recommendations</h2>
            <p className={styles.notLoggedInText}>
              We match jobs to your profile, skills, and preferences. Log in to get started.
            </p>
            <Link href="/login/employee" className={styles.loginBtn}>
              Log In
            </Link>
          </div>
        )}

        {/* Loading */}
        {isLoggedIn && (loading || jobsLoading) && (
          <div className={styles.loading}>
            <div className={styles.loadingSpinner} />
            <p>Finding your best matches...</p>
          </div>
        )}

        {/* Logged in and loaded */}
        {isLoggedIn && !loading && !jobsLoading && (
          <>
            {/* Incomplete profile banner */}
            {!profileComplete && (
              <div className={styles.profileBanner}>
                <span className={styles.profileBannerIcon}>💡</span>
                <div className={styles.profileBannerText}>
                  <p>
                    Complete your profile to get better recommendations.
                    Add your skills, job title, and location for more accurate matches.{' '}
                    <Link href="/profile" className={styles.profileBannerLink}>
                      Update Profile
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {/* Results count */}
            {recommendedJobs.length > 0 && (
              <p className={styles.jobCount}>
                <span className={styles.jobCountHighlight}>{recommendedJobs.length}</span>{' '}
                recommended jobs for you
              </p>
            )}

            {/* Split panel layout */}
            {recommendedJobs.length > 0 ? (
              <div className={styles.splitLayout}>
                {/* LEFT PANEL - Job List */}
                <div className={styles.jobListPanel} ref={listRef}>
                  {recommendedJobs.map(job => (
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
                      </div>
                      {shortlistedJobIds.has(job.id) && (
                        <span className={styles.listCardStamp}>SHORTLISTED</span>
                      )}
                      <span className={styles.listCardMatch}>{job.matchPercentage}%</span>
                    </div>
                  ))}
                </div>

                {/* RIGHT PANEL - Job Detail (desktop only) */}
                {!isMobile && selectedJob && (
                  <div className={styles.detailPanel}>
                    <JobPostingSchema job={selectedJob} />
                    <div className={styles.detailInner}>

                      {/* Match banner at top of detail */}
                      {selectedJobMatch && (
                        <div className={styles.detailMatchBanner}>
                          <div className={styles.detailMatchLeft}>
                            <span className={styles.detailMatchPercent}>{selectedJobMatch.matchPercentage}% Match</span>
                            <span className={styles.detailMatchLabel}>Compatibility Score</span>
                          </div>
                          <div className={styles.detailMatchReasons}>
                            {selectedJobMatch.matchReasons.slice(0, 3).map((reason, i) => (
                              <span key={i} className={styles.detailMatchReason}>✓ {reason}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Banner image */}
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
                            🌐 {selectedJob.companyWebsite.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                        <a
                          href={getGoogleMapsUrl(selectedJob)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.detailLocation}
                        >
                          📍 {selectedJob.fullLocation?.addressLine1
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
                        <button
                          className={`${styles.detailApplyBtn} ${hasApplied ? styles.detailAppliedBtn : ''}`}
                          onClick={handleApply}
                          disabled={hasApplied || checkingApplied}
                        >
                          {checkingApplied ? 'Checking...' : hasApplied ? 'Applied ✓' : 'Apply Now'}
                        </button>
                        <button
                          className={`${styles.detailSaveBtn} ${isSaved(selectedJob.id) ? styles.detailSavedBtn : ''}`}
                          onClick={() => { if (!isSaved(selectedJob.id)) trackClickEvent(selectedJob.id, 'save_click'); toggleSave(selectedJob.id) }}
                        >
                          {isSaved(selectedJob.id) ? 'Saved \u2713' : 'Save Job'}
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
                              <li key={i}>✓ {benefit}</li>
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

                      {/* Footer info */}
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
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
                <h2 className={styles.emptyTitle}>No recommendations yet</h2>
                <p className={styles.emptyText}>
                  {!profileComplete
                    ? 'Complete your profile so we can match you with relevant jobs.'
                    : 'We couldn\'t find strong matches right now. Browse all available jobs instead.'}
                </p>
                <Link href={!profileComplete ? '/profile' : '/jobs'} className={styles.browseBtn}>
                  {!profileComplete ? 'Complete Profile' : 'Browse All Jobs'}
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Apply Modal Overlay */}
      {showApplyModal && selectedJob && (
        <div className={styles.applyOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowApplyModal(false) }}>
          <div className={styles.applyModal}>
            {!applicationSubmitted ? (
              <>
                <div className={styles.applyHeader}>
                  <h2>Apply to {selectedJob.company}</h2>
                  <button className={styles.applyClose} onClick={() => setShowApplyModal(false)}>×</button>
                </div>
                <div className={styles.applyBody}>
                  <div className={styles.applyJobInfo}>
                    <h3>{selectedJob.title}</h3>
                    <p>{selectedJob.location} • {formatSalaryFull(selectedJob)}</p>
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
                    <p className={styles.applyCvNote}>
                      Your profile CV will be attached automatically. Make sure it&apos;s up to date!
                    </p>
                    <Link href="/cv-builder" className={styles.applyUpdateCvLink}>
                      Update your CV →
                    </Link>
                  </div>
                </div>
                <div className={styles.applyFooter}>
                  <button
                    className={styles.applySubmitBtn}
                    onClick={submitApplication}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.applySuccess}>
                <div className={styles.applySuccessIcon}>✓</div>
                <h2>Application Submitted!</h2>
                <p>Your application has been sent to {selectedJob.company}.</p>
                <p className={styles.applySuccessNote}>They will contact you if they&apos;re interested.</p>
                <button className={styles.applySuccessBtn} onClick={() => setShowApplyModal(false)}>
                  Continue Browsing
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Detail Modal - mobile only */}
      {isMobile && selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={closeJobModal}
          onPrevious={() => navigateToJob('prev')}
          onNext={() => navigateToJob('next')}
          hasPrevious={getCurrentJobIndex() > 0}
          hasNext={getCurrentJobIndex() < recommendedJobs.length - 1}
          viewSource="recommendation"
        />
      )}
    </main>
  )
}
