'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedLink from '@/components/SignedLink'
import SignedImage from '@/components/SignedImage'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import MakeOfferModal from '@/components/MakeOfferModal'
import WithdrawOrRescindModal, { type WithdrawScenario, type WithdrawConfirmPayload } from '@/components/WithdrawOrRescindModal'
import DeclineModal from '@/components/DeclineModal'
import { isOfferConditional } from '@/lib/offerConditional'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { useJobs } from '@/lib/JobsContext'
import { Interview, Offer } from '@/lib/types'
import { confirmHire } from '@/lib/confirmHire'
import { headerThemeForStatus, stageForStatus, STAGE_LABELS, STAGE_COLORS, stageSoftTint, stageSoftBorder } from '@/lib/constants/pipelineStages'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface Application {
  id: string
  jobId: string
  jobTitle: string
  company: string
  coverLetter: string
  appliedAt: string
  status: 'pending' | 'reviewing' | 'interviewing' | 'interview' | 'hired' | 'rejected' | 'offered' | 'shortlisted'
  candidateId: string
  candidateName: string
  candidateEmail: string
  candidatePhone: string
  candidatePhoto: string | null
  candidatePosition: string
  candidateCity: string
  candidateCv: string | null
  interview?: Interview
  offer?: Offer
  interviewInterestStatus?: 'pending' | 'interested' | 'not_interested' | null
  screeningAnswers?: { questionId: string; question: string; answer: string }[]
}

export default function JobApplicationsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const fromPipeline = searchParams.get('from') === 'pipeline'
  // When Pipeline deep-links a specific candidate, narrow the page to that one.
  // Aggregate stats and the search bar are noise in that mode.
  const focusedApplicationId = searchParams.get('applicationId')
  const jobId = params.jobId as string
  const { jobs, refreshJobs } = useJobs()

  const [loading, setLoading] = useState(true)
  const [applications, setApplications] = useState<Application[]>([])
  const [job, setJob] = useState<any>(null)
  const [isEmployer, setIsEmployer] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [offerModalOpen, setOfferModalOpen] = useState(false)
  const [offerApplication, setOfferApplication] = useState<Application | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLetters, setExpandedLetters] = useState(new Set<string>())
  // Decline modal state — the modal itself owns its template/edit/send
  // state in components/DeclineModal.tsx. We only track which application
  // is currently being declined and the employer's session id (passed
  // through to the modal).
  const [declineApp, setDeclineApp] = useState<Application | null>(null)
  const [employerId, setEmployerId] = useState<string | null>(null)
  // Withdraw/rescind state — single modal with three scenarios driven by
  // current offer status + whether the offer letter contains pre-employment
  // conditions (RTW/refs/DBS/probation).
  const [withdrawApp, setWithdrawApp] = useState<Application | null>(null)
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const session = await getSessionWithRetry()
      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login/employer')
        return
      }
      setIsEmployer(true)
      // Multi-user: applications/writes are keyed employer_id = owner user_id.
      setEmployerId((await getCurrentEmployerOwnerId(supabase)) ?? session.user.id)

      // Find the job
      const foundJob = jobs.find(j => j.id === jobId)
      setJob(foundJob)

      // Load applications from Supabase (no JOIN — fetch candidates separately)
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false })

      if (!error && data && data.length > 0) {
        // Auto-set viewed_at for unviewed applications and send notifications
        const unviewedRows = data.filter((row: any) => !row.viewed_at)
        if (unviewedRows.length > 0) {
          const unviewedIds = unviewedRows.map((row: any) => row.id)
          await supabase
            .from('job_applications')
            .update({ viewed_at: new Date().toISOString() })
            .in('id', unviewedIds)

          // Send "Application Viewed" notifications to candidates (batch)
          await notify('application_viewed', { applicationIds: unviewedIds })
        }

        // Fetch candidate profiles for all applicants
        const candidateIds = data.map((row: any) => row.candidate_id)
        const { data: profiles, error: profileError } = await supabase
          .from('candidate_profiles')
          .select('*')
          .in('user_id', candidateIds)

        if (profileError) {
          console.error('Failed to fetch candidate profiles:', profileError.message)
        }

        const profileMap: Record<string, any> = {}
        if (profiles) {
          profiles.forEach((p: any) => { profileMap[p.user_id] = p })
        }

        // Fetch interviews for these applications
        const applicationIds = data.map((row: any) => row.id)
        const { data: interviews } = await supabase
          .from('interviews')
          .select('*')
          .in('application_id', applicationIds)
          .in('status', ['pending_selection', 'scheduled', 'confirmed', 'completed'])

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

        const mapped: Application[] = data.map((row: any) => {
          const profile = profileMap[row.candidate_id]
          const interview = interviewMap[row.id]
          const offer = offerMap[row.id]
          return {
            id: row.id,
            jobId: row.job_id,
            jobTitle: foundJob?.title || row.job_title || 'Unknown',
            company: foundJob?.company || row.company || 'Unknown',
            coverLetter: row.cover_letter || '',
            screeningAnswers: row.screening_answers || [],
            appliedAt: row.applied_at,
            status: row.status === 'pending' ? 'pending' : row.status,
            candidateId: row.candidate_id,
            candidateName: profile?.full_name || row.candidate_name || 'Applicant',
            candidateEmail: profile?.email || '',
            candidatePhone: profile?.phone || '',
            candidatePhoto: profile?.profile_picture_url || null,
            candidatePosition: profile?.job_title || 'Job Seeker',
            candidateCity: profile?.location || profile?.city || '',
            // APPLICATION FIRST, PROFILE AS FALLBACK.
            // row.cv_url is what they actually applied with; the profile is
            // what they have TODAY. Reading the application is the honest
            // answer — an employer looking at a months-old application should
            // not see it change because the candidate swapped their CV.
            // The fallback exists because all 59 pre-existing rows are null:
            // switching outright would make 24 candidates CVs VANISH from the
            // employer view, which is worse than the problem. Historical rows
            // keep working, new ones are accurate, and NOTHING WAS BACKFILLED —
            // we cannot know what CV those people actually held at the time,
            // and inventing one would put a false value in an audit trail.
            candidateCv: row.cv_url || profile?.cv_url || null,
            interviewInterestStatus: row.interview_interest_status || null,
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
              proposedSlots: interview.proposed_slots || [],
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
              offerLetterText: offer.offer_letter_text,
              status: offer.status,
              signatureName: offer.signature_name,
              signatureTimestamp: offer.signature_timestamp,
              signatureImageUrl: offer.signature_image_url,
              employerSignatureImageUrl: offer.employer_signature_image_url,
              employerSignatureName: offer.employer_signature_name,
              employerSignatureTimestamp: offer.employer_signature_timestamp,
              rightToWorkConfirmed: offer.right_to_work_confirmed ?? false,
              rightToWorkConfirmedAt: offer.right_to_work_confirmed_at,
              rightToWorkConfirmedBy: offer.right_to_work_confirmed_by,
              declineReason: offer.decline_reason,
              createdAt: offer.created_at,
              updatedAt: offer.updated_at,
            } : undefined,
          }
        })
        setApplications(mapped)
      }

      setLoading(false)
    }

    checkAuthAndLoadData()
  }, [jobId, jobs, router])

  const loadApplications = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const foundJob = jobs.find(j => j.id === jobId)
    setJob(foundJob)

    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('job_id', jobId)
      .order('applied_at', { ascending: false })

    if (!error && data && data.length > 0) {
      const candidateIds = data.map((row: any) => row.candidate_id)
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('*')
        .in('user_id', candidateIds)

      const profileMap: Record<string, any> = {}
      if (profiles) {
        profiles.forEach((p: any) => { profileMap[p.user_id] = p })
      }

      const applicationIds = data.map((row: any) => row.id)
      const { data: interviews } = await supabase
        .from('interviews')
        .select('*')
        .in('application_id', applicationIds)
        .in('status', ['pending_selection', 'scheduled', 'confirmed', 'completed'])

      const interviewMap: Record<string, any> = {}
      if (interviews) {
        interviews.forEach((i: any) => { interviewMap[i.application_id] = i })
      }

      // Fetch offers for these applications. Newest-first + keep the FIRST per
      // application, so a fresh re-offer supersedes an earlier withdrawn one.
      const { data: offers } = await supabase
        .from('job_offers')
        .select('*')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false })

      const offerMap: Record<string, any> = {}
      if (offers) {
        offers.forEach((o: any) => { if (!offerMap[o.application_id]) offerMap[o.application_id] = o })
      }

      const mapped: Application[] = data.map((row: any) => {
        const profile = profileMap[row.candidate_id]
        const interview = interviewMap[row.id]
        const offer = offerMap[row.id]
        return {
          id: row.id,
          jobId: row.job_id,
          jobTitle: foundJob?.title || row.job_title || 'Unknown',
          company: foundJob?.company || row.company || 'Unknown',
          coverLetter: row.cover_letter || '',
          appliedAt: row.applied_at,
          status: row.status === 'pending' ? 'pending' : row.status,
          candidateId: row.candidate_id,
          candidateName: profile?.full_name || row.candidate_name || 'Applicant',
          candidateEmail: profile?.email || '',
          candidatePhone: profile?.phone || '',
          candidatePhoto: profile?.profile_picture_url || null,
          candidatePosition: profile?.job_title || 'Job Seeker',
          candidateCity: profile?.location || profile?.city || '',
          candidateCv: row.cv_url || profile?.cv_url || null,
          interviewInterestStatus: row.interview_interest_status || null,
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
            offerLetterText: offer.offer_letter_text,
            status: offer.status,
            signatureName: offer.signature_name,
            signatureTimestamp: offer.signature_timestamp,
            signatureImageUrl: offer.signature_image_url,
            employerSignatureImageUrl: offer.employer_signature_image_url,
            employerSignatureName: offer.employer_signature_name,
            employerSignatureTimestamp: offer.employer_signature_timestamp,
            rightToWorkConfirmed: offer.right_to_work_confirmed ?? false,
            rightToWorkConfirmedAt: offer.right_to_work_confirmed_at,
            rightToWorkConfirmedBy: offer.right_to_work_confirmed_by,
            declineReason: offer.decline_reason,
            createdAt: offer.created_at,
            updatedAt: offer.updated_at,
          } : undefined,
        }
      })
      setApplications(mapped)
    }
  }

  const updateApplicationStatus = async (
    applicationId: string,
    newStatus: Application['status']
  ) => {
    const application = applications.find(a => a.id === applicationId)

    const { error: updateError } = await supabase
      .from('job_applications')
      .update({ status: newStatus, status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
      .eq('id', applicationId)

    if (updateError) {
      alert('Failed to update status. Please try again.')
      return
    }

    // Notify the candidate on key status transitions
    if (application) {
      const notifMap: Record<string, { title: string; message: string }> = {
        reviewing: {
          title: 'Application Under Review',
          message: `Your application for ${application.jobTitle} at ${application.company} is being reviewed. We'll be in touch soon.`,
        },
        rejected: {
          title: 'Application Update',
          message: `Your application for ${application.jobTitle} at ${application.company} was not selected to move forward.`,
        },
        offered: {
          title: 'Job Offer Received',
          message: `You have received a job offer for ${application.jobTitle} at ${application.company}! Check your messages for details.`,
        },
        hired: {
          title: 'Congratulations!',
          message: `Congratulations! You've been hired for ${application.jobTitle} at ${application.company}.`,
        },
      }
      const notif = notifMap[newStatus]
      if (notif) {
        await notify('status_changed', { applicationId, extra: { status: newStatus } })

        if (application.candidateEmail) {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: application.candidateEmail,
              type: 'application_status',
              data: {
                status: newStatus,
                companyName: application.company,
                jobTitle: application.jobTitle,
                candidateName: application.candidateName,
                employerId: (await supabase.auth.getSession()).data.session?.user.id,
              },
            }),
          }).catch(() => {})
        }
      }

      // When hired: check if all applications for this job are resolved → mark job filled
      if (newStatus === 'hired') {
        const { data: remaining } = await supabase
          .from('job_applications')
          .select('id')
          .eq('job_id', application.jobId)
          .not('status', 'in', '("hired","rejected")')
          .limit(1)
        if (!remaining || remaining.length === 0) {
          await supabase.from('jobs').update({ status: 'filled' }).eq('id', application.jobId)
        }
      }
    }

    setApplications(prev =>
      prev.map(app => app.id === applicationId ? { ...app, status: newStatus } : app)
    )
  }

  const handleShortlist = async (application: Application) => {
    await supabase
      .from('job_applications')
      .update({
        status: 'shortlisted',
        shortlisted_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
        stage_entered_at: new Date().toISOString(),
      })
      .eq('id', application.id)

    // Send notification to candidate
    await notify('status_changed', { applicationId: application.id, extra: { status: 'shortlisted' } })

    // Send email notification
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: application.candidateEmail,
        type: 'application_status',
        data: { status: 'shortlisted', companyName: application.company, jobTitle: application.jobTitle },
      }),
    }).catch(() => {})

    setApplications(prev =>
      prev.map(a => a.id === application.id ? { ...a, status: 'shortlisted' as const } : a)
    )
  }

  const handleScheduleInterview = (application: Application) => {
    setSelectedApplication(application)
    setScheduleModalOpen(true)
  }

  const handleInviteToInterview = async (application: Application) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // 1. Update interest status to 'pending'
    const { error: updateError } = await supabase
      .from('job_applications')
      .update({ interview_interest_status: 'pending' })
      .eq('id', application.id)

    if (updateError) {
      alert('Failed to send invitation. Please try again.')
      return
    }

    // 2. Notify the candidate
    await notify('interview_invite_interest', { applicationId: application.id })

    // 3. Send in-app message via find-or-create conversation
    const firstName = (application.candidateName || 'there').split(' ')[0]
    const messageContent = `Hi ${firstName}, we'd love to invite you to interview for the ${application.jobTitle} role at ${application.company}. Please let us know if you're interested by visiting your applications page.`

    let conversationId: string | null = null
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${application.candidateId}),and(participant_1.eq.${application.candidateId},participant_2.eq.${session.user.id})`)
      .eq('related_job_id', application.jobId)
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
      await supabase
        .from('conversations')
        .update({ last_message: messageContent, last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          participant_1: session.user.id,
          participant_2: application.candidateId,
          participant_1_name: application.company,
          participant_1_role: 'employer',
          participant_1_company: application.company,
          participant_2_name: application.candidateName,
          participant_2_role: 'candidate',
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
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: session.user.id,
        sender_name: application.company,
        sender_role: 'employer',
        content: messageContent,
        is_read: false,
      })
    }

    // 4. Update local state + toast
    setApplications(prev => prev.map(a => a.id === application.id ? { ...a, interviewInterestStatus: 'pending' } : a))
    alert(`Interview invitation sent to ${application.candidateName}`)
  }

  // Toggle the right-to-work readiness flag on the accepted offer. Status only
  // (no documents). Stamps confirmed_at + confirmed_by when ticked; clears both
  // when unticked. The Hired gate (here and on the pipeline) requires this true.
  const handleToggleRtw = async (offerId: string, next: boolean) => {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase
      .from('job_offers')
      .update({
        right_to_work_confirmed: next,
        right_to_work_confirmed_at: next ? new Date().toISOString() : null,
        right_to_work_confirmed_by: next ? (session?.user.id ?? null) : null,
      })
      .eq('id', offerId)
    loadApplications()
  }

  const handleConfirmHire = async (application: Application) => {
    // Gate: hire requires right-to-work confirmed on the accepted offer.
    // (The button is also disabled until then; this is the defensive guard.)
    if (application.offer?.rightToWorkConfirmed !== true) return
    const confirmed = confirm(`Confirm hire for ${application.candidateName}?`)
    if (!confirmed) return

    try {
      await confirmHire({
        applicationId: application.id,
        jobId: application.jobId,
        candidateId: application.candidateId,
        candidateName: application.candidateName,
        candidateEmail: application.candidateEmail,
        jobTitle: application.jobTitle,
        company: application.company,
      })
      loadApplications()
      refreshJobs()
    } catch (err) {
      console.error('Error confirming hire:', err)
    }
  }

  // Submit a withdraw or rescind to /api/offers/[offerId]/withdraw. The
  // server enforces audit-first ordering — a failed audit insert aborts the
  // action and returns an error here, so the offer's candidate-visible state
  // can never change without a corresponding audit row.
  const handleConfirmWithdraw = async (payload: WithdrawConfirmPayload) => {
    if (!withdrawApp?.offer) return
    setWithdrawSubmitting(true)
    setWithdrawError(null)
    try {
      const session = await getSessionWithRetry()
      if (!session) throw new Error('Not signed in')

      const res = await fetch(`/api/offers/${withdrawApp.offer.id}/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWithdrawError(body.error || 'Could not complete the action. Try again.')
        return
      }

      // Success — close modal, reload list so the card reflects the new state
      setWithdrawApp(null)
      loadApplications()
    } catch (err) {
      console.error('[withdraw] request failed:', err)
      setWithdrawError('Could not reach the server. Check your connection and try again.')
    } finally {
      setWithdrawSubmitting(false)
    }
  }

  const handleCancelInterview = async (interviewId: string, applicationId: string) => {
    const confirmed = confirm('Are you sure you want to cancel this interview?')
    if (!confirmed) return

    const application = applications.find(a => a.id === applicationId)

    await supabase
      .from('interviews')
      .update({ status: 'cancelled' })
      .eq('id', interviewId)

    // Remove the mirrored Google Calendar event (if any) — fire-and-forget
    fetch('/api/calendar/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewId }),
    }).catch(() => {})

    // Notify candidate in-app (fire-and-forget, as before)
    if (application) {
      notify('interview_cancelled', { applicationId })

      // Send email to candidate
      if (application.candidateEmail) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: application.candidateEmail,
            type: 'interview_cancelled',
            data: {
              companyName: application.company || '',
              jobTitle: application.jobTitle,
              candidateName: application.candidateName,
              date: '',
            },
          }),
        }).catch(() => {})
      }
    }

    loadApplications()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading applications...</p>
        </div>
      </main>
    )
  }

  if (!isEmployer) {
    return null
  }

  return (
    <main>
      <Header />

      <div className={styles.container}>
        {/* Back Link & Header */}
        <div className={styles.header}>
          <button className={styles.backLink} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => router.push(fromPipeline ? '/pipeline' : '/my-jobs')}>
            <span className={styles.backArrow}>←</span>
            {fromPipeline ? 'Back to Pipeline' : 'Back to Manage Job Ads'}
          </button>

          <div className={styles.jobInfo}>
            {/* Quiet stage pill above the title (focused single-candidate views
                only — Review / Make Offer / Schedule Interview come in focused
                on one applicant). Same soft-tinted styling as the pipeline's
                "N days in {stage}" pills. Title + subtitle stay as-is; this is
                a label, not a link. */}
            {(() => {
              const focused = focusedApplicationId ? applications.find(a => a.id === focusedApplicationId) : null
              const stage = focused ? stageForStatus(focused.status) : null
              if (!stage) return null
              return (
                <span
                  className={styles.stagePill}
                  style={{
                    background: stageSoftTint(stage),
                    border: `1px solid ${stageSoftBorder(stage)}`,
                    color: STAGE_COLORS[stage],
                  }}
                >
                  {STAGE_LABELS[stage]}
                </span>
              )
            })()}
            <h1 className={styles.title}>
              Applications for {job?.title || 'Job'}
            </h1>
            <p className={styles.subtitle}>
              {/* Join with the bullet only between parts that exist, so a job
                  with no location never leaves a dangling "•" under the title. */}
              {[job?.company, job?.location].filter(Boolean).join(' • ')}
            </p>
          </div>

          {!focusedApplicationId && (
            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statNumber}>{applications.length}</span>
                <span className={styles.statLabel}>Total Applications</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNumber}>
                  {applications.filter(a => a.status === 'pending').length}
                </span>
                <span className={styles.statLabel}>Pending Review</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNumber}>
                  {applications.filter(a => a.status === 'interviewing' || a.status === 'interview').length}
                </span>
                <span className={styles.statLabel}>Interviewing</span>
              </div>
            </div>
          )}
        </div>

        {/* Search bar — hidden when focused on a single candidate from Pipeline */}
        {applications.length > 0 && !focusedApplicationId && (
          <div className={styles.searchRow}>
            <input
              type="text"
              placeholder="Search by candidate name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.candidateSearch}
            />
            {searchQuery && (
              <button className={styles.searchClear} onClick={() => setSearchQuery('')}>&times;</button>
            )}
          </div>
        )}

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><Ico name="inbox" size={20} /></span>
            <h2 className={styles.emptyTitle}>No applications yet</h2>
            <p className={styles.emptyText}>
              No candidates have applied to this position yet.
              Share this job to get more applications!
            </p>
            <div className={styles.emptyActions}>
              <button
                className={styles.shareBtn}
                onClick={() => {
                  // /job/ singular — the advert's own server-rendered page, so
                  // a pasted link previews with the role's title, salary and
                  // photograph. /jobs?id= is the BOARD, whose preview is the
                  // generic site card. See the note in JobDetailModal.
                  navigator.clipboard.writeText(window.location.origin + '/job/' + jobId)
                  alert('Job link copied to clipboard!')
                }}
              >
                <Ico name="file-text" size={16} /> Copy Job Link
              </button>
              <button className={styles.backBtn} onClick={() => router.push(fromPipeline ? '/pipeline' : '/my-jobs')}>
                {fromPipeline ? 'Back to Pipeline' : 'Back to Manage Job Ads'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.applicationsList}>
            {applications
              .filter(a => {
                if (focusedApplicationId) return a.id === focusedApplicationId
                if (searchQuery && !a.candidateName.toLowerCase().includes(searchQuery.toLowerCase())) return false
                return true
              })
              .map(application => {
              // Candidate-header "you are here" halo: tint the header to the
              // candidate's current pipeline-stage colour (status → stage →
              // colour via the shared constant). Unmapped statuses (e.g.
              // 'pending') return null → the default navy header.
              const headerTheme = headerThemeForStatus(application.status)
              return (
                <div key={application.id} className={styles.applicationCard}>
                  <div
                    className={styles.cardMain}
                    style={headerTheme ? { background: headerTheme.bg, borderBottom: `1px solid ${headerTheme.border}` } : undefined}
                    data-ink={headerTheme ? 'dark' : undefined}
                  >
                    {/* Candidate Photo */}
                    <div className={styles.candidatePhoto}>
                      {application.candidatePhoto ? (
                        <SignedImage
                          src={application.candidatePhoto}
                          alt={application.candidateName}
                          className={styles.photoImage}
                        />
                      ) : (
                        <div className={styles.photoPlaceholder}>
                          {getInitials(application.candidateName)}
                        </div>
                      )}
                    </div>

                    {/* Candidate Info — single line: name · position · location · applied */}
                    <h3 className={styles.candidateName}>{application.candidateName}</h3>
                    <span className={styles.cardSep} aria-hidden="true">·</span>
                    <span className={styles.candidatePosition}>{application.candidatePosition}</span>
                    {application.candidateCity && (
                      <>
                        <span className={styles.cardSep} aria-hidden="true">·</span>
                        <span className={styles.candidateLocation}>{application.candidateCity}</span>
                      </>
                    )}
                    <span className={styles.cardSep} aria-hidden="true">·</span>
                    <span className={styles.appliedDate}>
                      Applied {formatDate(application.appliedAt)}
                    </span>

                    {/* Profile actions (right) */}
                    <Link
                      href={`/candidates/${application.candidateId}`}
                      className={styles.viewProfileLink}
                    >
                      View Profile
                    </Link>
                    {application.candidateCv ? (
                      <SignedLink src={application.candidateCv} className={styles.viewProfileLink}>
                        View CV
                      </SignedLink>
                    ) : (
                      <span
                        className={`${styles.viewProfileLink} ${styles.viewCvDisabled}`}
                        title="No CV uploaded"
                      >
                        View CV
                      </span>
                    )}
                  </div>

                  {/* Interview Details */}
                  {application.interview && (
                    <div className={styles.interviewSection}>
                      <h4 className={styles.interviewTitle}>
                        {application.interview.status === 'completed'
                          ? 'Interview Completed'
                          : application.interview.status === 'pending_selection'
                          ? '⏳ Awaiting Time Selection'
                          : application.interview.status === 'confirmed'
                          ? 'Confirmed Interview'
                          : 'Scheduled — Awaiting Confirmation'}
                      </h4>
                      {application.interview.status === 'pending_selection' && (
                        <p className={styles.pendingSlot}>Waiting for candidate to select a time</p>
                      )}
                      <div className={styles.interviewDetails}>
                        {application.interview.status === 'pending_selection' && (application.interview.proposedSlots?.length ?? 0) > 0 ? (
                          <div>
                            <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0 0 0.375rem 0' }}><strong>Proposed times:</strong></p>
                            {(application.interview.proposedSlots || []).map((slot, i) => {
                              const d = new Date(slot.date + 'T00:00:00')
                              const fd = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                              return <p key={i} style={{ fontSize: '0.85rem', color: '#334155', margin: '0 0 0.25rem 0' }}>Option {i + 1}: {fd} at {slot.time}</p>
                            })}
                          </div>
                        ) : (application.interview.status === 'pending_selection' || !application.interview.interviewDate) ? (
                          // Self-schedule pending case (no proposed_slots, NULL
                          // date/time until candidate picks via token link)
                          // OR any defensive NULL-date case. Render an honest
                          // "Awaiting scheduling" line — see audit fix #1b.
                          <p className={styles.interviewDate}>
                            <strong>Status:</strong> Awaiting candidate to pick a time.
                          </p>
                        ) : (
                          <p className={styles.interviewDate}>
                            <strong>Date:</strong>{' '}
                            {new Date(application.interview.interviewDate).toLocaleDateString('en-GB', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}{' '}
                            at {(() => {
                              const [h, m] = (application.interview.interviewTime || '').split(':').map(Number)
                              if (isNaN(h)) return application.interview.interviewTime
                              const ampm = h >= 12 ? 'pm' : 'am'
                              const h12 = h % 12 || 12
                              return `${h12}:${String(m || 0).padStart(2, '0')}${ampm}`
                            })()}
                          </p>
                        )}
                        <p className={styles.interviewType}>
                          <strong>Type:</strong>{' '}
                          {application.interview.interviewType === 'in-person'
                            ? 'In-Person'
                            : application.interview.interviewType === 'video'
                            ? 'Video Call'
                            : 'Phone Call'}
                        </p>
                        {(() => {
                          const loc = application.interview.locationOrLink
                          // Hide location if it's just a type label (In-Person, Video Call, Phone Call)
                          const isTypeLabel = !loc || ['In-Person', 'Video Call', 'Phone Call'].includes(loc)
                          if (isTypeLabel) return null
                          const isUrl = loc.startsWith('http')
                          return (
                            <p className={styles.interviewLocation}>
                              <strong>{isUrl ? 'Meeting Link:' : 'Location:'}</strong>{' '}
                              {isUrl ? (
                                <a href={loc} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                                  Join Meeting
                                </a>
                              ) : loc}
                            </p>
                          )
                        })()}
                        {application.interview.status === 'confirmed' && (
                          <p className={styles.interviewConfirmed}>Confirmed by candidate</p>
                        )}
                        {application.interview.status === 'scheduled' && (
                          <p style={{ fontSize: '0.8rem', color: '#d97706', fontStyle: 'italic', margin: '0.375rem 0 0' }}>Awaiting candidate confirmation</p>
                        )}
                      </div>
                      {application.interview.status !== 'completed' && !(application.offer?.status === 'accepted' || application.status === 'hired') && (
                        <div className={styles.interviewActions}>
                          <button
                            className={styles.rescheduleBtn}
                            onClick={() => handleScheduleInterview(application)}
                          >
                            Reschedule
                          </button>
                          <button
                            className={styles.cancelInterviewBtn}
                            onClick={() => handleCancelInterview(application.interview!.id, application.id)}
                          >
                            Cancel Interview
                          </button>
                          <button
                            className={styles.rejectInterviewBtn}
                            onClick={() => setDeclineApp(application)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Offer Details — a withdrawn offer is hidden entirely
                      (the application has been reverted to a re-offerable
                      stage), so no stale "Job Offer Sent" card lingers. */}
                  {application.offer && application.offer.status !== 'withdrawn' && (
                    <div className={styles.offerSection}>
                      <h4 className={styles.offerTitle}>
                        {application.status === 'hired'
                          ? 'Hired'
                          : application.offer.status === 'accepted'
                          ? 'Offer Accepted — Awaiting Confirmation'
                          : application.offer.status === 'declined'
                          ? 'Offer Declined'
                          : 'Job Offer Sent'}
                      </h4>
                      <div className={styles.offerDetails}>
                        <p><strong>Salary:</strong> {application.offer.salary}</p>
                        <p>
                          <strong>Start Date:</strong>{' '}
                          {new Date(application.offer.startDate).toLocaleDateString('en-GB', {
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
                        {application.offer.employerSignatureImageUrl && (
                          <div className={styles.signatureDisplay}>
                            <p className={styles.signatureLabel}>Your Signature:</p>
                            <div className={styles.signatureBox}>
                              <SignedImage
                                src={application.offer.employerSignatureImageUrl}
                                alt={`Signature of ${application.offer.employerSignatureName || 'employer'}`}
                                style={{ maxHeight: 70, maxWidth: '100%', display: 'block' }}
                              />
                            </div>
                            {application.offer.employerSignatureTimestamp && (
                              <p className={styles.signatureDate}>
                                Signed {application.offer.employerSignatureName ? `by ${application.offer.employerSignatureName} ` : ''}on {new Date(application.offer.employerSignatureTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        )}
                        {application.offer.signatureName && (
                          <div className={styles.signatureDisplay}>
                            <p className={styles.signatureLabel}>Candidate Signature:</p>
                            <div className={styles.signatureBox}>
                              {application.offer.signatureImageUrl ? (
                                <SignedImage
                                  src={application.offer.signatureImageUrl}
                                  alt={`Signature of ${application.offer.signatureName}`}
                                  style={{ maxHeight: 70, maxWidth: '100%', display: 'block' }}
                                  fallback={<span className={styles.signatureText}>{application.offer.signatureName}</span>}
                                />
                              ) : (
                                <span className={styles.signatureText}>{application.offer.signatureName}</span>
                              )}
                            </div>
                            <p className={styles.signatureDate}>
                              Signed by {application.offer.signatureName} on {new Date(application.offer.signatureTimestamp!).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        )}
                        {application.offer.declineReason && (
                          <p><strong>Decline reason:</strong> {application.offer.declineReason}</p>
                        )}
                        {application.offer.offerLetterUrl && (
                          <p>
                            <SignedLink src={application.offer.offerLetterUrl} className={styles.offerLetterLink} download>
                              ⬇ Download Offer Letter
                            </SignedLink>
                          </p>
                        )}
                      </div>
                      {application.offer.status === 'pending' && (
                        <div className={styles.interviewActions}>
                          <button
                            type="button"
                            className={styles.barBtn}
                            onClick={() => setWithdrawApp(application)}
                          >
                            Withdraw offer
                          </button>
                        </div>
                      )}
                      {application.offer.status === 'accepted' && application.status !== 'hired' && (
                        <>
                          {/* Right-to-work confirmation — the single pre-hire
                              readiness flag. Status only; no documents stored.
                              The hire is gated on this being ticked. */}
                          <label className={styles.rtwRow}>
                            <input
                              type="checkbox"
                              className={styles.rtwCheckbox}
                              checked={!!application.offer.rightToWorkConfirmed}
                              onChange={e => handleToggleRtw(application.offer!.id, e.target.checked)}
                            />
                            <span className={styles.rtwText}>
                              <span className={styles.rtwTitle}>Right to work confirmed</span>
                              <span className={styles.rtwCaption}>
                                Confirm you’ve verified this candidate’s right to work via the Home Office online service or your usual checks. Thrive stores only that you’ve confirmed it — no documents.
                              </span>
                              {application.offer.rightToWorkConfirmed && application.offer.rightToWorkConfirmedAt && (
                                <span className={styles.rtwDate}>
                                  Confirmed {new Date(application.offer.rightToWorkConfirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                              )}
                            </span>
                          </label>
                          <div className={styles.interviewActions}>
                            <button
                              className={styles.barBtnHire}
                              onClick={() => handleConfirmHire(application)}
                              disabled={!application.offer.rightToWorkConfirmed}
                              title={!application.offer.rightToWorkConfirmed ? 'Confirm right to work first.' : undefined}
                            >
                              Confirm Hire
                            </button>
                            {!application.offer.rightToWorkConfirmed && (
                              <span className={styles.rtwHint}>Confirm right to work first.</span>
                            )}
                            <button
                              type="button"
                              className={styles.barBtn}
                              onClick={() => setWithdrawApp(application)}
                            >
                              Rescind offer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Cover Letter Preview */}
                  {application.coverLetter && (
                    <div className={styles.coverLetterSection}>
                      <h4 className={styles.coverLetterTitle}>Cover Letter</h4>
                      <p className={styles.coverLetterText}>
                        {application.coverLetter.length > 200 && !expandedLetters.has(application.id)
                          ? application.coverLetter.slice(0, 200) + '...'
                          : application.coverLetter}
                      </p>
                      {application.coverLetter.length > 200 && (
                        expandedLetters.has(application.id) ? (
                          <button
                            type="button"
                            className={styles.coverLetterToggle}
                            onClick={() => setExpandedLetters(prev => { const s = new Set(prev); s.delete(application.id); return s })}
                          >
                            Read less
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.coverLetterToggle}
                            onClick={() => setExpandedLetters(prev => new Set(prev).add(application.id))}
                          >
                            Read more
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Screening Answers */}
                  {application.screeningAnswers && application.screeningAnswers.length > 0 && (
                    <div className={styles.screeningBlock}>
                      <h4 className={styles.screeningTitle}>Screening Answers</h4>
                      {application.screeningAnswers.map((a, i) => (
                        <div key={a.questionId || i} className={styles.screeningItem}>
                          <p className={styles.screeningQuestion}>{a.question}</p>
                          <p className={styles.screeningAnswer}>{a.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Bar */}
                  {/* Stage-specific action bars */}
                  <div className={styles.actionBar}>
                    {/* ── APPLIED: Review or Reject ── */}
                    {application.status === 'pending' && (
                      <>
                        <button className={styles.barBtnPrimary} onClick={() => updateApplicationStatus(application.id, 'reviewing')}>
                          Review →
                        </button>
                        <button className={styles.barBtnReject} onClick={() => setDeclineApp(application)}>
                          Reject
                        </button>
                      </>
                    )}

                    {/* ── REVIEWING: Shortlist or Reject ── */}
                    {application.status === 'reviewing' && (
                      <>
                        <button className={styles.barBtnPrimary} onClick={() => handleShortlist(application)}>
                          Shortlist →
                        </button>
                        <button className={styles.barBtnReject} onClick={() => setDeclineApp(application)}>
                          Reject
                        </button>
                      </>
                    )}

                    {/* ── SHORTLISTED: Schedule Interview or Reject ── */}
                    {application.status === 'shortlisted' && (
                      <>
                        <button className={styles.barBtnPrimary} onClick={() => handleScheduleInterview(application)}>
                          Schedule Interview →
                        </button>
                        <button className={styles.barBtnReject} onClick={() => setDeclineApp(application)}>
                          Reject
                        </button>
                      </>
                    )}

                    {/* ── INTERVIEWING: Send Offer Letter (Reschedule/Reject live in the interview panel; Message/Email live on the candidate profile).
                        Also re-shown after a withdrawn offer (the app was reverted
                        to interviewing and the withdrawn offer is treated as gone),
                        so the employer can send a fresh offer. ── */}
                    {(application.status === 'interviewing' || application.status === 'interview') && (!application.offer || application.offer.status === 'withdrawn') && (
                      <button className={styles.barBtnPrimary} onClick={() => { setOfferApplication(application); setOfferModalOpen(true) }}>
                        Send Offer Letter →
                      </button>
                    )}

                    {/* ── OFFERED ──
                        When an offer exists, the offer card above owns the
                        correct lifecycle controls (Withdraw offer / Confirm
                        Hire / Rescind) — so here we only surface the pending
                        "awaiting response" note. The old action-bar "Withdraw"
                        button wrongly opened the candidate-DECLINE modal
                        (setDeclineApp), which rejects the candidate rather than
                        withdrawing the offer — removed.
                        If the application is 'offered' with NO offer letter on
                        record (a pre-fix drag, or seeded data), show a clear
                        empty state + a path to send a real offer, instead of
                        the mis-wired decline control. */}
                    {application.status === 'offered' && (
                      application.offer ? (
                        application.offer.status === 'pending' ? (
                          <span style={{ fontSize: '0.8rem', color: '#d97706', fontStyle: 'italic', padding: '0.5rem 0.75rem' }}>
                            Awaiting candidate response...
                          </span>
                        ) : null
                      ) : (
                        <>
                          <span style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', padding: '0.5rem 0.75rem' }}>
                            No offer letter on record yet.
                          </span>
                          <button className={styles.barBtnPrimary} onClick={() => { setOfferApplication(application); setOfferModalOpen(true) }}>
                            Send Offer Letter →
                          </button>
                        </>
                      )
                    )}

                    {/* ── HIRED / REJECTED: Reset ── */}
                    {(application.status === 'hired' || application.status === 'rejected') && (
                      <button className={styles.barBtnReset} onClick={() => updateApplicationStatus(application.id, 'pending')}>
                        Reset Status
                      </button>
                    )}

                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Schedule Interview Modal */}
      {selectedApplication && (
        <ScheduleInterviewModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false)
            setSelectedApplication(null)
          }}
          applicationId={selectedApplication.id}
          jobId={selectedApplication.jobId}
          jobTitle={selectedApplication.jobTitle}
          company={selectedApplication.company}
          candidateId={selectedApplication.candidateId}
          candidateName={selectedApplication.candidateName}
          candidateEmail={selectedApplication.candidateEmail}
          jobLocation={job?.location}
          existingInterviewId={selectedApplication.interview?.id}
          onSuccess={() => {
            loadApplications()
          }}
        />
      )}

      {/* Make Offer Modal */}
      {offerApplication && (
        <MakeOfferModal
          isOpen={offerModalOpen}
          onClose={() => {
            setOfferModalOpen(false)
            setOfferApplication(null)
          }}
          applicationId={offerApplication.id}
          jobId={offerApplication.jobId}
          jobTitle={offerApplication.jobTitle}
          company={offerApplication.company}
          candidateId={offerApplication.candidateId}
          candidateName={offerApplication.candidateName}
          candidateEmail={offerApplication.candidateEmail}
          onSuccess={() => {
            loadApplications()
          }}
        />
      )}

      {/* Withdraw / rescind modal — scenario picked from offer status +
          conditional-clause detection on the body text. */}
      {withdrawApp?.offer && (() => {
        const status = withdrawApp.offer.status
        const conditional = isOfferConditional(withdrawApp.offer.offerLetterText ?? null)
        const scenario: WithdrawScenario =
          status === 'pending'
            ? 'pending'
            : conditional ? 'rescind_conditional' : 'rescind_unconditional'
        return (
          <WithdrawOrRescindModal
            isOpen
            scenario={scenario}
            candidateName={withdrawApp.candidateName}
            jobTitle={withdrawApp.jobTitle}
            submitting={withdrawSubmitting}
            errorMessage={withdrawError}
            onClose={() => {
              if (withdrawSubmitting) return
              setWithdrawApp(null)
              setWithdrawError(null)
            }}
            onConfirm={handleConfirmWithdraw}
          />
        )
      })()}

      {/* Decline modal lives in components/DeclineModal.tsx — owns its
          own template/edit/send state. We just supply the application
          + employer context and react to onDeclined to keep the local
          applications list in sync. */}
      {declineApp && employerId && (
        <DeclineModal
          applicationId={declineApp.id}
          candidateId={declineApp.candidateId}
          candidateEmail={declineApp.candidateEmail || null}
          candidateName={declineApp.candidateName}
          jobTitle={declineApp.jobTitle}
          companyName={declineApp.company}
          employerId={employerId}
          onClose={() => setDeclineApp(null)}
          onDeclined={() => {
            setApplications(prev => prev.map(a => a.id === declineApp.id ? { ...a, status: 'rejected' } : a))
          }}
        />
      )}
    </main>
  )
}
