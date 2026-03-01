'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import SignatureModal from '@/components/SignatureModal'
import DeclineOfferModal from '@/components/DeclineOfferModal'
import { supabase } from '@/lib/supabase'
import { Interview, Offer } from '@/lib/types'
import styles from './page.module.css'

type ApplicationStatus = 'applied' | 'viewed' | 'shortlisted' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn'

interface JobApplication {
  id: string
  jobId: string
  jobTitle: string
  company: string
  coverLetter?: string
  appliedAt: string
  status: ApplicationStatus
  interview?: Interview
  offer?: Offer
  employerId?: string
  viewedAt?: string
  shortlistedAt?: string
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; icon: string; className: string }> = {
  applied: { label: 'Applied', icon: '📨', className: 'statusApplied' },
  viewed: { label: 'Viewed', icon: '👁', className: 'statusViewed' },
  shortlisted: { label: 'Shortlisted', icon: '⭐', className: 'statusShortlisted' },
  interview: { label: 'Interview Scheduled', icon: '', className: 'statusInterview' },
  offer: { label: 'Offer Received', icon: '📋', className: 'statusOffer' },
  hired: { label: 'Hired', icon: '✅', className: 'statusHired' },
  rejected: { label: 'Rejected', icon: '✗', className: 'statusRejected' },
  withdrawn: { label: 'Withdrawn', icon: '', className: 'statusWithdrawn' },
}

export default function MyJobsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
  const [signatureModalOpen, setSignatureModalOpen] = useState(false)
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [selectedOffer, setSelectedOffer] = useState<{ offer: Offer; application: JobApplication } | null>(null)
  const [candidateName, setCandidateName] = useState('Candidate')

  useEffect(() => {
    loadApplications()
  }, [])

  const loadApplications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login/employee')
        return
      }

      setCandidateName(session.user.user_metadata?.full_name || 'Candidate')

      // Fetch from Supabase with JOIN to jobs table for title/company/employer_id
      const { data, error } = await supabase
        .from('job_applications')
        .select('id, job_id, status, applied_at, cover_letter, job_title, company, viewed_at, shortlisted_at, jobs(title, company, employer_id)')
        .eq('candidate_id', session.user.id)
        .order('applied_at', { ascending: false })

      if (error) {
        console.error('Error fetching applications:', error.message)
        setApplications([])
      } else if (data) {
        // Fetch interviews for these applications
        const applicationIds = data.map((row: any) => row.id)
        const { data: interviews } = await supabase
          .from('interviews')
          .select('*')
          .in('application_id', applicationIds)
          .in('status', ['scheduled', 'confirmed'])

        const interviewMap: Record<string, any> = {}
        if (interviews) {
          interviews.forEach((i: any) => { interviewMap[i.application_id] = i })
        }

        // Fetch offers for these applications
        const { data: offers } = await supabase
          .from('job_offers')
          .select('*')
          .in('application_id', applicationIds)

        const offerMap: Record<string, any> = {}
        if (offers) {
          offers.forEach((o: any) => { offerMap[o.application_id] = o })
        }

        setApplications(data.map((row: any) => {
          const interview = interviewMap[row.id]
          const offer = offerMap[row.id]
          return {
            id: row.id,
            jobId: row.job_id,
            jobTitle: row.jobs?.title || row.job_title || 'Unknown Position',
            company: row.jobs?.company || row.company || 'Unknown Company',
            coverLetter: row.cover_letter || '',
            appliedAt: row.applied_at,
            status: normalizeStatus(row.status),
            employerId: row.jobs?.employer_id || undefined,
            viewedAt: row.viewed_at || undefined,
            shortlistedAt: row.shortlisted_at || undefined,
            interview: interview ? {
              id: interview.id,
              applicationId: interview.application_id,
              jobId: interview.job_id,
              employerId: interview.employer_id,
              candidateId: interview.candidate_id,
              interviewDate: interview.interview_date,
              interviewTime: interview.interview_time,
              durationMinutes: interview.duration_minutes,
              interviewType: interview.interview_type,
              locationOrLink: interview.location_or_link,
              notes: interview.notes,
              status: interview.status,
              createdAt: interview.created_at,
              updatedAt: interview.updated_at,
            } : undefined,
            offer: offer ? {
              id: offer.id,
              applicationId: offer.application_id,
              jobId: offer.job_id,
              employerId: offer.employer_id,
              candidateId: offer.candidate_id,
              salary: offer.salary,
              startDate: offer.start_date,
              contractType: offer.contract_type,
              additionalTerms: offer.additional_terms,
              offerLetterUrl: offer.offer_letter_url,
              status: offer.status,
              signatureName: offer.signature_name,
              signatureTimestamp: offer.signature_timestamp,
              declineReason: offer.decline_reason,
              createdAt: offer.created_at,
              updatedAt: offer.updated_at,
            } : undefined,
          }
        }))
      }
    } catch {
      console.error('Failed to load applications')
      setApplications([])
    }
    setLoading(false)
  }

  const normalizeStatus = (status: string | undefined): ApplicationStatus => {
    const s = (status || 'applied').toLowerCase()
    if (['applied', 'viewed', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'].includes(s)) {
      return s as ApplicationStatus
    }
    if (s === 'pending' || s === 'pending review') return 'applied'
    if (s === 'reviewing' || s === 'under review') return 'viewed'
    if (s === 'interviewing') return 'interview'
    if (s === 'offered') return 'offer'
    if (s === 'hired') return 'hired'
    return 'applied'
  }

  const getStepperSteps = (app: JobApplication): { key: string; label: string; reached: boolean; active: boolean }[] => {
    const STATUS_ORDER: ApplicationStatus[] = ['applied', 'viewed', 'shortlisted', 'interview', 'offer', 'hired']
    const currentIndex = STATUS_ORDER.indexOf(app.status)

    // For rejected/withdrawn, show up to last reached step then the terminal state
    if (app.status === 'rejected' || app.status === 'withdrawn') {
      let highestReached = 0
      if (app.viewedAt) highestReached = 1
      if (app.shortlistedAt) highestReached = 2
      if (app.interview) highestReached = 3
      if (app.offer) highestReached = 4

      const steps: { key: string; label: string; reached: boolean; active: boolean }[] =
        STATUS_ORDER.slice(0, highestReached + 1).map((key) => ({
          key,
          label: STATUS_CONFIG[key]?.label || key,
          reached: true,
          active: false,
        }))
      steps.push({
        key: app.status,
        label: STATUS_CONFIG[app.status].label,
        reached: true,
        active: true,
      })
      return steps
    }

    return STATUS_ORDER.map((key, i) => ({
      key,
      label: STATUS_CONFIG[key]?.label || key,
      reached: i <= currentIndex,
      active: i === currentIndex,
    }))
  }

  const handleAcceptInterview = async (interviewId: string, employerId: string) => {
    try {
      const { error } = await supabase
        .from('interviews')
        .update({ status: 'confirmed' })
        .eq('id', interviewId)

      if (!error) {
        // Send notification to employer
        await supabase
          .from('notifications')
          .insert({
            user_id: employerId,
            title: 'Interview Confirmed',
            message: 'A candidate has confirmed their interview',
            type: 'application_status_change',
            read: false,
          })

        loadApplications()
      }
    } catch (error) {
      console.error('Error accepting interview:', error)
    }
  }

  const handleRequestReschedule = async (application: JobApplication) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !application.interview) return

    const reason = prompt('Please provide a reason for rescheduling:')
    if (!reason) return

    const employerId = application.interview.employerId
    const messageContent = `I would like to request rescheduling the interview for ${application.jobTitle}.\n\nReason: ${reason}`

    try {
      const senderName = session.user.user_metadata?.full_name || 'Candidate'

      // Find existing conversation or create one
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${employerId}),and(participant_1.eq.${employerId},participant_2.eq.${session.user.id})`)
        .eq('related_job_id', application.jobId)
        .maybeSingle()

      let conversationId: string | null = existingConv?.id || null

      if (!conversationId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            participant_1: session.user.id,
            participant_2: employerId,
            participant_1_name: senderName,
            participant_1_role: 'candidate',
            participant_2_name: application.company,
            participant_2_role: 'employer',
            participant_2_company: application.company,
            related_job_id: application.jobId,
            related_job_title: application.jobTitle,
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        conversationId = newConv?.id || null
      }

      if (conversationId) {
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: session.user.id,
            sender_name: senderName,
            sender_role: 'candidate',
            content: messageContent,
            is_read: false,
          })

        if (existingConv) {
          await supabase
            .from('conversations')
            .update({
              last_message: messageContent,
              last_message_at: new Date().toISOString(),
            })
            .eq('id', conversationId)
        }
      }

      // Send notification
      await supabase
        .from('notifications')
        .insert({
          user_id: employerId,
          title: 'Reschedule Requested',
          message: `Candidate has requested to reschedule interview for ${application.jobTitle}`,
          type: 'application_status_change',
          read: false,
        })

      alert('Reschedule request sent to employer')
    } catch (error) {
      console.error('Error requesting reschedule:', error)
      alert('Failed to send reschedule request')
    }
  }

  const handleWithdraw = async (appId: string) => {
    setWithdrawingId(appId)
    try {
      await supabase
        .from('job_applications')
        .update({ status: 'withdrawn' })
        .eq('id', appId)

      setApplications(prev =>
        prev.map(app => app.id === appId ? { ...app, status: 'withdrawn' } : app)
      )
    } catch {
      // Fail silently
    }
    setWithdrawingId(null)
    setShowConfirm(null)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const activeApplications = applications.filter(a => a.status !== 'withdrawn')
  const withdrawnApplications = applications.filter(a => a.status === 'withdrawn')

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <p>Loading your jobs...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>My Applications</h1>
            <p className={styles.subtitle}>Track your applications and their progress</p>
          </div>
          {applications.length > 0 && (
            <div className={styles.statsRow}>
              <div className={styles.statChip}>
                <span className={styles.statValue}>{activeApplications.length}</span>
                <span className={styles.statLabel}>Active</span>
              </div>
              <div className={styles.statChip}>
                <span className={styles.statValue}>
                  {applications.filter(a => a.status === 'interview').length}
                </span>
                <span className={styles.statLabel}>Interviews</span>
              </div>
            </div>
          )}
        </div>

        {applications.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>You haven&apos;t applied to any jobs yet</h2>
            <p className={styles.emptyText}>
              Start exploring opportunities and apply to jobs that match your skills.
            </p>
            <button
              className={styles.browseBtn}
              onClick={() => router.push('/jobs')}
            >
              Browse Jobs
            </button>
          </div>
        ) : (
          <>
            <div className={styles.applicationsList}>
              {activeApplications.map(application => {
                const config = STATUS_CONFIG[application.status]
                return (
                  <div key={application.id} className={styles.applicationCard}>
                    <div className={styles.cardLeft}>
                      <div className={styles.companyInitial}>
                        {application.company.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className={styles.cardContent}>
                      <div className={styles.cardTop}>
                        <div className={styles.jobInfo}>
                          <h3 className={styles.jobTitle}>{application.jobTitle}</h3>
                          <p className={styles.company}>{application.company}</p>
                        </div>
                        {application.status === 'interview' ? (
                          <div className={styles.interviewCard}>
                            <div className={styles.interviewCardHeader}>
                              Interview Scheduled
                            </div>
                            <div className={styles.interviewCardBody}>
                              {application.interview ? (
                                <>
                                  <span className={styles.interviewCardDate}>
                                    {new Date(application.interview.interviewDate).toLocaleDateString('en-GB', {
                                      weekday: 'long',
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                    })}
                                  </span>
                                  <span className={styles.interviewCardTime}>
                                    {application.interview.interviewTime}
                                  </span>
                                </>
                              ) : (
                                <span className={styles.interviewCardDate}>Date pending</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className={`${styles.statusBanner} ${styles[config.className]}`}>
                            {config.icon && <span className={styles.bannerIcon}>{config.icon}</span>}
                            <span className={styles.bannerLabel}>{config.label}</span>
                          </div>
                        )}
                      </div>

                      {/* Status Stepper */}
                      <div className={styles.stepper}>
                        {getStepperSteps(application).map((step, i, arr) => (
                          <div
                            key={step.key}
                            className={`${styles.step} ${step.reached ? styles.stepReached : ''} ${step.active ? styles.stepActive : ''} ${step.key === 'rejected' ? styles.stepRejected : ''} ${step.key === 'withdrawn' ? styles.stepWithdrawn : ''}`}
                          >
                            <div className={styles.stepDot}>
                              {step.reached && !step.active && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <span className={styles.stepLabel}>{step.label}</span>
                            {i < arr.length - 1 && (
                              <div className={`${styles.stepLine} ${step.reached ? styles.stepLineReached : ''}`} />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Prominent status callout for key milestones */}
                      {application.status === 'shortlisted' && (
                        <div className={styles.shortlistedCallout}>
                          <span className={styles.shortlistedCalloutStar}>&#9733;</span>
                          <div>
                            <strong>You&apos;ve been shortlisted!</strong>
                            <p className={styles.shortlistedCalloutText}>The employer has shortlisted your application for this role.</p>
                          </div>
                        </div>
                      )}

                      {application.status === 'viewed' && (
                        <div className={styles.viewedCallout}>
                          <span className={styles.viewedCalloutIcon}>&#128065;</span>
                          <span>Your application has been viewed by the employer.</span>
                        </div>
                      )}

                      <div className={styles.cardMeta}>
                        <span className={styles.metaItem}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          Applied {formatDate(application.appliedAt)}
                        </span>
                      </div>

                      {/* Interview Details */}
                      {application.interview && (
                        <div className={styles.interviewSection}>
                          <h4 className={styles.interviewTitle}>
                            {application.interview.status === 'confirmed' ? '✅ ' : '📅 '}
                            Scheduled Interview
                          </h4>
                          <div className={styles.interviewDetails}>
                            <p className={styles.interviewDate}>
                              <strong>Date:</strong>{' '}
                              {new Date(application.interview.interviewDate).toLocaleDateString('en-GB', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}{' '}
                              at {application.interview.interviewTime}
                            </p>
                            <p className={styles.interviewType}>
                              <strong>Type:</strong>{' '}
                              {application.interview.interviewType === 'in-person'
                                ? '🏢 In-Person'
                                : application.interview.interviewType === 'video'
                                ? '📹 Video Call'
                                : '📞 Phone Call'}
                            </p>
                            {application.interview.locationOrLink && (
                              <p className={styles.interviewLocation}>
                                <strong>
                                  {application.interview.locationOrLink.startsWith('http')
                                    ? 'Calendar Link:'
                                    : application.interview.interviewType === 'in-person'
                                    ? 'Location:'
                                    : application.interview.interviewType === 'video'
                                    ? 'Meeting Link:'
                                    : 'Phone Number:'}
                                </strong>{' '}
                                {application.interview.locationOrLink.startsWith('http') ? (
                                  <a href={application.interview.locationOrLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                                    View Calendar Event
                                  </a>
                                ) : (
                                  application.interview.locationOrLink
                                )}
                              </p>
                            )}
                            {application.interview.notes && (
                              <p className={styles.interviewNotes}>
                                <strong>Notes:</strong> {application.interview.notes}
                              </p>
                            )}
                          </div>
                          {application.interview.status === 'scheduled' && !(application.offer?.status === 'accepted' || application.status === 'hired') && (
                            <div className={styles.interviewActions}>
                              <button
                                className={styles.acceptBtn}
                                onClick={() => handleAcceptInterview(application.interview!.id, application.interview!.employerId)}
                              >
                                ✓ Accept Interview
                              </button>
                              <button
                                className={styles.rescheduleBtn}
                                onClick={() => handleRequestReschedule(application)}
                              >
                                Request Reschedule
                              </button>
                            </div>
                          )}
                          {application.interview.status === 'confirmed' && !(application.offer?.status === 'accepted' || application.status === 'hired') && (
                            <p className={styles.confirmedText}>You have confirmed this interview</p>
                          )}
                        </div>
                      )}

                      {/* Offer Details */}
                      {application.offer && (
                        <div className={styles.offerSection}>
                          <h4 className={styles.offerTitle}>
                            {application.offer.status === 'accepted'
                              ? '✅ Offer Accepted'
                              : application.offer.status === 'declined'
                              ? '❌ Offer Declined'
                              : '📋 Job Offer Received'}
                          </h4>
                          <div className={styles.offerDetails}>
                            <p><strong>Salary:</strong> {application.offer.salary}</p>
                            <p>
                              <strong>Start Date:</strong>{' '}
                              {new Date(application.offer.startDate).toLocaleDateString('en-GB', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>
                            <p>
                              <strong>Contract:</strong>{' '}
                              {application.offer.contractType.charAt(0).toUpperCase() +
                                application.offer.contractType.slice(1)}
                            </p>
                            {application.offer.additionalTerms && (
                              <p><strong>Additional Terms:</strong> {application.offer.additionalTerms}</p>
                            )}
                            {application.offer.offerLetterUrl && (
                              <p>
                                <a
                                  href={application.offer.offerLetterUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.viewOfferLetterLink}
                                >
                                  View Offer Letter
                                </a>
                              </p>
                            )}
                          </div>
                          {application.offer.status === 'pending' && (
                            <div className={styles.offerActions}>
                              <button
                                className={styles.acceptOfferBtn}
                                onClick={() => {
                                  setSelectedOffer({ offer: application.offer!, application })
                                  setSignatureModalOpen(true)
                                }}
                              >
                                Accept Offer
                              </button>
                              <button
                                className={styles.declineOfferBtn}
                                onClick={() => {
                                  setSelectedOffer({ offer: application.offer!, application })
                                  setDeclineModalOpen(true)
                                }}
                              >
                                Decline Offer
                              </button>
                            </div>
                          )}
                          {application.offer.status === 'accepted' && (
                            <p className={styles.offerAcceptedText}>
                              You accepted this offer on{' '}
                              {new Date(application.offer.signatureTimestamp!).toLocaleDateString('en-GB')}
                            </p>
                          )}
                          {application.offer.status === 'declined' && (
                            <p className={styles.offerDeclinedText}>You declined this offer</p>
                          )}
                        </div>
                      )}

                      <div className={styles.cardActions}>
                        <button
                          className={styles.viewJobBtn}
                          onClick={() => router.push(`/jobs?id=${application.jobId}`)}
                        >
                          View Job
                        </button>
                        {application.status !== 'rejected' && (
                          <>
                            {showConfirm === application.id ? (
                              <div className={styles.confirmGroup}>
                                <span className={styles.confirmText}>Withdraw?</span>
                                <button
                                  className={styles.confirmYes}
                                  onClick={() => handleWithdraw(application.id)}
                                  disabled={withdrawingId === application.id}
                                >
                                  {withdrawingId === application.id ? '...' : 'Yes'}
                                </button>
                                <button
                                  className={styles.confirmNo}
                                  onClick={() => setShowConfirm(null)}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                className={styles.withdrawBtn}
                                onClick={() => setShowConfirm(application.id)}
                              >
                                Withdraw
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {withdrawnApplications.length > 0 && (
              <div className={styles.withdrawnSection}>
                <h3 className={styles.withdrawnHeading}>Withdrawn ({withdrawnApplications.length})</h3>
                <div className={styles.applicationsList}>
                  {withdrawnApplications.map(application => (
                    <div key={application.id} className={`${styles.applicationCard} ${styles.cardWithdrawn}`}>
                      <div className={styles.cardLeft}>
                        <div className={`${styles.companyInitial} ${styles.initialFaded}`}>
                          {application.company.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className={styles.cardContent}>
                        <div className={styles.cardTop}>
                          <div className={styles.jobInfo}>
                            <h3 className={styles.jobTitle}>{application.jobTitle}</h3>
                            <p className={styles.company}>{application.company}</p>
                          </div>
                          <div className={`${styles.statusBanner} ${styles.statusWithdrawn}`}>
                            <span className={styles.bannerLabel}>Withdrawn</span>
                          </div>
                        </div>
                        <div className={styles.cardMeta}>
                          <span className={styles.metaItem}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            Applied {formatDate(application.appliedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Signature Modal (Accept Offer) */}
      {selectedOffer && (
        <>
          <SignatureModal
            isOpen={signatureModalOpen}
            onClose={() => {
              setSignatureModalOpen(false)
              setSelectedOffer(null)
            }}
            offerId={selectedOffer.offer.id}
            applicationId={selectedOffer.application.id}
            jobId={selectedOffer.application.jobId}
            jobTitle={selectedOffer.application.jobTitle}
            company={selectedOffer.application.company}
            candidateName={candidateName}
            employerId={selectedOffer.offer.employerId}
            onSuccess={() => loadApplications()}
          />
          <DeclineOfferModal
            isOpen={declineModalOpen}
            onClose={() => {
              setDeclineModalOpen(false)
              setSelectedOffer(null)
            }}
            offerId={selectedOffer.offer.id}
            applicationId={selectedOffer.application.id}
            jobId={selectedOffer.application.jobId}
            jobTitle={selectedOffer.application.jobTitle}
            company={selectedOffer.application.company}
            candidateName={candidateName}
            employerId={selectedOffer.offer.employerId}
            onSuccess={() => loadApplications()}
          />
        </>
      )}
    </main>
  )
}
