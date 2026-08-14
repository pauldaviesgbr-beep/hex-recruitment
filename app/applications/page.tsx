'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedLink from '@/components/SignedLink'
import SignedImage from '@/components/SignedImage'
import DeclineOfferModal from '@/components/DeclineOfferModal'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { Interview, Offer } from '@/lib/types'
import styles from './page.module.css'
import { Ico, type IconName } from '@/components/icons'

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
  interviewInterestStatus?: 'pending' | 'interested' | 'not_interested' | null
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; icon: string; className: string }> = {
  applied: { label: 'Applied', icon: 'inbox', className: 'statusApplied' },
  viewed: { label: 'Viewed', icon: 'eye', className: 'statusViewed' },
  shortlisted: { label: 'Shortlisted', icon: 'star', className: 'statusShortlisted' },
  interview: { label: 'Interview Scheduled', icon: '', className: 'statusInterview' },
  offer: { label: 'Offer Received', icon: 'file-text', className: 'statusOffer' },
  hired: { label: 'Hired', icon: 'check', className: 'statusHired' },
  rejected: { label: 'Rejected', icon: 'x', className: 'statusRejected' },
  withdrawn: { label: 'Withdrawn', icon: '', className: 'statusWithdrawn' },
}

export default function MyJobsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
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
        .select('id, job_id, status, applied_at, cover_letter, job_title, company, viewed_at, shortlisted_at, interview_interest_status, jobs(title, company, employer_id)')
        .eq('candidate_id', session.user.id)
        .order('applied_at', { ascending: false })

      if (error) {
        console.error('Error fetching applications:', error.message)
        setApplications([])
      } else if (data) {
        // Fetch interviews for these applications (by application_id OR by candidate+job)
        const applicationIds = data.map((row: any) => row.id)
        const jobIds = data.map((row: any) => row.job_id).filter(Boolean)
        const { data: interviews } = await supabase
          .from('interviews')
          .select('*')
          .eq('candidate_id', session.user.id)
          .in('status', ['pending_selection', 'scheduled', 'confirmed', 'cancelled'])

        // Deterministic current-interview selection per application.
        // Previous behaviour: two .forEach() passes with no ordering meant
        // "last iteration wins" — when more than one interview row exists
        // for a single application (a phantom-row hygiene problem that
        // pre-dates this commit; see audit INTERVIEW_AUDIT_2026-05-30.md
        // bug (b)), the picked row was non-deterministic and frequently
        // resolved to a stale row with interview_time='00:00:00'. That
        // stale data then fed both the "Interview Updated" notification
        // and the employer "Interview Confirmed" email, producing
        // user-visible date/time corruption.
        //
        // New behaviour: explicitly pick the most-recently-created
        // interview that is NOT cancelled, per application. Falls back
        // to the most-recently-created cancelled row only if no active
        // row exists (so the UI can still surface a "Cancelled
        // Interview" badge for terminal states). Does not depend on
        // Supabase return order or forEach iteration order.
        const pickBetter = (existing: any, incoming: any): any => {
          if (!existing) return incoming
          const existingCancelled = existing.status === 'cancelled'
          const incomingCancelled = incoming.status === 'cancelled'
          // Prefer non-cancelled over cancelled.
          if (existingCancelled && !incomingCancelled) return incoming
          if (!existingCancelled && incomingCancelled) return existing
          // Same cancellation tier — newer created_at wins.
          return new Date(incoming.created_at) > new Date(existing.created_at)
            ? incoming
            : existing
        }

        const interviewMap: Record<string, any> = {}
        if (interviews) {
          // Pass 1: match by application_id (the strong link).
          for (const i of interviews) {
            if (i.application_id && applicationIds.includes(i.application_id)) {
              interviewMap[i.application_id] = pickBetter(interviewMap[i.application_id], i)
            }
          }
          // Pass 2: job_id fallback for interviews not joined to a known
          // application_id. Uses the same most-recent-non-cancelled rule.
          for (const i of interviews) {
            if (i.application_id && applicationIds.includes(i.application_id)) continue
            const matchingApp = data.find((row: any) => row.job_id === i.job_id)
            if (matchingApp) {
              interviewMap[matchingApp.id] = pickBetter(interviewMap[matchingApp.id], i)
            }
          }
        }

        // Fetch offers for these applications. Order newest-first and keep the
        // FIRST per application so a fresh re-offer supersedes an earlier
        // withdrawn/declined offer for the same application.
        const { data: offers } = await supabase
          .from('job_offers')
          .select('*')
          .in('application_id', applicationIds)
          .order('created_at', { ascending: false })

        const offerMap: Record<string, any> = {}
        if (offers) {
          offers.forEach((o: any) => { if (!offerMap[o.application_id]) offerMap[o.application_id] = o })
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

  // Plain-accept for letter-less offers (no document to counter-sign). Flips
  // the offer to 'accepted'; the employer still confirms the hire, exactly as
  // for a counter-signed offer.
  const handleAcceptOffer = async (application: JobApplication) => {
    if (!application.offer) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login/employee'); return }
    try {
      const res = await fetch(`/api/offers/${application.offer.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      })
      if (res.ok || res.status === 409) {
        await loadApplications()
        return
      }
      const body = await res.json().catch(() => ({}))
      if (res.status === 410) {
        alert('This offer has been withdrawn by the employer.')
        await loadApplications()
        return
      }
      alert(body.error || 'Could not accept the offer. Please try again.')
    } catch {
      alert('Could not reach the server. Check your connection and try again.')
    }
  }

  const handleAcceptInterest = async (application: JobApplication) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase
      .from('job_applications')
      .update({ interview_interest_status: 'interested' })
      .eq('id', application.id)

    if (error) {
      alert('Something went wrong. Please try again.')
      return
    }

    await notify('interest_accepted', { applicationId: application.id })

    setApplications(prev => prev.map(a => a.id === application.id ? { ...a, interviewInterestStatus: 'interested' } : a))
  }

  const handleDeclineInterest = async (application: JobApplication) => {
    const confirmed = confirm("Are you sure? This will let the employer know you're no longer interested.")
    if (!confirmed) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase
      .from('job_applications')
      .update({ interview_interest_status: 'not_interested' })
      .eq('id', application.id)

    if (error) {
      alert('Something went wrong. Please try again.')
      return
    }

    await notify('interest_declined', { applicationId: application.id })

    setApplications(prev => prev.map(a => a.id === application.id ? { ...a, interviewInterestStatus: 'not_interested' } : a))
  }

  const handleAcceptInterview = async (interviewId: string, employerId: string) => {
    try {
      // Idempotency guard: if this interview is already 'confirmed' (or
      // 'cancelled', for that matter), bail without firing the
      // notification + email + gcal-sync side-effect block. Without
      // this, a candidate who self-scheduled via the token link AND
      // then visited /applications and clicked Accept on the same
      // interview card would re-trigger the entire downstream chain,
      // producing duplicate "Interview Confirmed" notifications +
      // emails (audit bug a.2 — see INTERVIEW_AUDIT_2026-05-30.md).
      // The render guard at the Accept button already gates on
      // status === 'scheduled', but this server-checked fence catches
      // any stale-render race (e.g. button-click after a background
      // status-change but before re-render).
      const { data: current } = await supabase
        .from('interviews')
        .select('status')
        .eq('id', interviewId)
        .maybeSingle()
      if (current?.status === 'confirmed' || current?.status === 'cancelled') {
        return
      }

      const { error } = await supabase
        .from('interviews')
        .update({ status: 'confirmed' })
        .eq('id', interviewId)

      if (!error) {
        const { data: { session } } = await supabase.auth.getSession()
        const candidateName = session?.user?.user_metadata?.full_name || 'Candidate'

        // Fetch full interview details for email + calendar sync
        const { data: interviewRow } = await supabase
          .from('interviews')
          .select('application_id, job_id, interview_date, interview_time, duration_minutes, interview_type, location_or_link, jobs ( title, company )')
          .eq('id', interviewId)
          .maybeSingle()

        const job: any = interviewRow?.jobs ? (Array.isArray(interviewRow.jobs) ? interviewRow.jobs[0] : interviewRow.jobs) : null
        const jobTitle = job?.title || ''
        const companyName = job?.company || ''
        const interviewDate = interviewRow?.interview_date || ''
        const interviewTime = interviewRow?.interview_time || ''
        const interviewType = interviewRow?.interview_type || 'in-person'

        // Format date for display. Upgraded fallbacks from '' to explicit
        // "awaiting scheduling" / "TBC" so any user-visible notification
        // + email text shows honest copy when called against a row with
        // NULL date/time (the confirm-without-real-date path is parked
        // for fix #1c; this fix ensures it never produces blank strings
        // or "Invalid Date" in the interim). See audit fix #1b
        // hardening pass.
        const friendlyDate = interviewDate
          ? new Date(interviewDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'awaiting scheduling'
        const displayTime = interviewTime || 'TBC'

        // Send notification to employer. The route derives the recipient and
        // link from the application row; without an application id there is no
        // relationship to authorise against, so no notification is sent.
        if (interviewRow?.application_id) {
          await notify('interview_confirmed', {
            applicationId: interviewRow.application_id,
            extra: { date: friendlyDate, time: displayTime },
          })
        }

        // Send candidate-facing confirmation ("Hi Gianna, your interview is confirmed")
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'interview_confirmed',
            data: {
              recipientUserId: session?.user?.id,
              candidateName,
              jobTitle,
              companyName,
              date: friendlyDate,
              time: displayTime,
              interviewType,
            },
          }),
        }).catch(() => {})

        // Send employer-facing notification ("Gianna has confirmed their interview")
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'interview_confirmed_employer',
            data: {
              recipientUserId: employerId,
              candidateName,
              jobTitle,
              companyName,
              date: friendlyDate,
              time: displayTime,
              interviewType,
            },
          }),
        }).catch(() => {})

        // Sync confirmed status to Google Calendar
        fetch('/api/calendar/update-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interviewId,
            employerId,
            date: interviewDate,
            time: interviewTime,
            duration: interviewRow?.duration_minutes || 45,
            interviewType,
            candidateName,
            jobTitle,
          }),
        }).catch(() => {})

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
      await notify('reschedule_requested', { applicationId: application.id })

      alert('Reschedule request sent to employer')
    } catch (error) {
      console.error('Error requesting reschedule:', error)
      alert('Failed to send reschedule request')
    }
  }

  const formatSlotDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatSlotTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m}${hour >= 12 ? 'pm' : 'am'}`
  }

  const handleSelectSlot = async (application: JobApplication, slot: { date: string; time: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !application.interview) return

      // Update the interview with the chosen slot and confirm it
      await supabase
        .from('interviews')
        .update({
          interview_date: slot.date,
          interview_time: slot.time,
          status: 'confirmed',
        })
        .eq('id', application.interview.id)

      // Notify employer
      await notify('interview_slot_selected', {
        applicationId: application.id,
        extra: { date: formatSlotDate(slot.date), time: formatSlotTime(slot.time) },
      })

      // Send email to employer
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'interview_confirmed',
          data: {
            recipientUserId: application.interview.employerId,
            companyName: application.company,
            jobTitle: application.jobTitle,
            candidateName: session.user.user_metadata?.full_name || 'Candidate',
            date: formatSlotDate(slot.date),
            time: formatSlotTime(slot.time),
            interviewType: application.interview.interviewType,
          },
        }),
      }).catch(() => {})

      loadApplications()
      alert('Interview time confirmed!')
    } catch (err) {
      console.error('Error selecting slot:', err)
    }
  }

  const handleWithdraw = async (appId: string) => {
    setWithdrawingId(appId)
    try {
      await supabase
        .from('job_applications')
        .update({ status: 'withdrawn', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
        .eq('id', appId)

      setApplications(prev =>
        prev.map(app => app.id === appId ? { ...app, status: 'withdrawn' } : app)
      )
    } catch {
      alert('Failed to withdraw application. Please try again.')
      setWithdrawingId(null)
      setShowConfirm(null)
      return
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
                            <div className={styles.interviewCardHeader} style={application.interview?.status === 'cancelled' ? { background: '#6b7280' } : !application.interview ? { background: '#6b7280' } : application.interview?.status === 'pending_selection' ? { background: '#f59e0b' } : undefined}>
                              {application.interview?.status === 'cancelled' ? 'Interview Cancelled' : !application.interview ? 'Interview Cancelled' : application.interview?.status === 'pending_selection' ? 'Select a Time' : 'Interview Scheduled'}
                            </div>
                            <div className={styles.interviewCardBody}>
                              {application.interview && application.interview.status !== 'cancelled' ? (
                                (() => {
                                  // Gate: pending_selection or NULL date means
                                  // the candidate hasn't picked a slot yet —
                                  // render an honest "Awaiting scheduling"
                                  // line rather than splitting null and
                                  // crashing (or formatting today's date as
                                  // a fake "scheduled" interview, the old
                                  // phantom-placeholder bug). See audit
                                  // fix #1b.
                                  if (application.interview.status === 'pending_selection' || !application.interview.interviewDate) {
                                    return <span className={styles.interviewCardDate}>Awaiting scheduling</span>
                                  }
                                  const [y, m, d] = application.interview.interviewDate.split('-').map(Number)
                                  const interviewDateObj = new Date(y, m - 1, d)
                                  return <>
                                  <span className={styles.interviewCardDate}>
                                    {interviewDateObj.toLocaleDateString('en-GB', {
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
                                })()
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className={`${styles.statusBanner} ${styles[config.className]}`}>
                            {config.icon && <span className={styles.bannerIcon}><Ico name={config.icon as IconName} size={16} /></span>}
                            <span className={styles.bannerLabel}>{config.label}</span>
                            {!application.interview && application.interviewInterestStatus === 'pending' && (
                              <span className={styles.actionRequiredDot} aria-label="Action required" title="Action required" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status Stepper */}
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.5rem 0 0.2rem' }}>Application status</p>
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

                      {/* Interview interest check — only when no interview exists yet */}
                      {!application.interview && application.interviewInterestStatus === 'pending' && (
                        <div className={styles.interestCard}>
                          <div className={styles.interestCardContent}>
                            <h4 className={styles.interestCardTitle}>
                              <span aria-hidden><Ico name="party-popper" size={20} /></span> Interview Invitation
                            </h4>
                            <p className={styles.interestCardSub}>
                              {application.company} would like to interview you for {application.jobTitle}
                            </p>
                          </div>
                          <div className={styles.interestCardActions}>
                            <button
                              type="button"
                              className={styles.interestBtnYes}
                              onClick={() => handleAcceptInterest(application)}
                            >
                              <Ico name="check" size={16} /> Yes, I&apos;m interested!
                            </button>
                            <button
                              type="button"
                              className={styles.interestBtnNo}
                              onClick={() => handleDeclineInterest(application)}
                            >
                              <Ico name="x" size={16} /> No thanks
                            </button>
                          </div>
                        </div>
                      )}
                      {!application.interview && application.interviewInterestStatus === 'interested' && (
                        <div className={styles.interestResolvedPositive}>
                          Great! The employer will be in touch to schedule your interview.
                        </div>
                      )}
                      {!application.interview && application.interviewInterestStatus === 'not_interested' && (
                        <div className={styles.interestResolvedNeutral}>
                          You&apos;ve declined this interview invitation.
                        </div>
                      )}

                      {/* Prominent status callout for key milestones */}
                      {application.status === 'shortlisted' && !application.interviewInterestStatus && (
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
                            {application.interview.status === 'cancelled' ? '' : application.interview.status === 'confirmed' ? '' : application.interview.status === 'pending_selection' ? '' : ''}
                            {application.interview.status === 'cancelled' ? 'Cancelled Interview' : application.interview.status === 'pending_selection' ? 'Select Interview Time' : 'Scheduled Interview'}
                          </h4>

                          {/* Slot picker for pending_selection */}
                          {application.interview.status === 'pending_selection' && (application.interview.proposedSlots?.length ?? 0) > 0 && (
                            <div className={styles.slotPicker}>
                              <p className={styles.slotPickerTitle}>Please select an interview time:</p>
                              {(application.interview.proposedSlots || []).map((slot, i) => (
                                <button
                                  key={i}
                                  className={styles.slotOption}
                                  onClick={() => handleSelectSlot(application, slot)}
                                >
                                  {formatSlotDate(slot.date)} at {formatSlotTime(slot.time)}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Standard interview details (shown when not pending_selection).
                             Defense-in-depth on NULL date: if the row got
                             this far with a missing date (e.g. an older
                             phantom that fix #1b doesn't backfill), render
                             "Awaiting scheduling" rather than splitting
                             null and crashing. */}
                          {application.interview.status !== 'pending_selection' && (
                            <div className={styles.interviewDetails}>
                              <p className={styles.interviewDate}>
                                <strong>Date:</strong>{' '}
                                {!application.interview.interviewDate
                                  ? 'Awaiting scheduling'
                                  : (() => {
                                      const [y, m, d] = application.interview.interviewDate.split('-').map(Number)
                                      return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                      })
                                    })()}{application.interview.interviewDate && application.interview.interviewTime ? (
                                  <>{' '}at {application.interview.interviewTime}</>
                                ) : null}
                              </p>
                              <p className={styles.interviewType}>
                                <strong>Type:</strong>{' '}
                                {application.interview.interviewType === 'in-person'
                                  ? 'In-Person'
                                  : application.interview.interviewType === 'video'
                                  ? 'Video Call'
                                  : 'Phone Call'}
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
                          )}

                          {/* Interview type info for pending_selection */}
                          {application.interview.status === 'pending_selection' && (
                            <p className={styles.interviewType} style={{ marginTop: '0.5rem' }}>
                              <strong>Type:</strong>{' '}
                              {application.interview.interviewType === 'in-person'
                                ? 'In-Person'
                                : application.interview.interviewType === 'video'
                                ? 'Video Call'
                                : 'Phone Call'}
                            </p>
                          )}

                          {application.interview.status === 'scheduled' && !(application.offer?.status === 'accepted' || application.status === 'hired') && (
                            <div className={styles.interviewActions}>
                              <button
                                className={styles.acceptBtn}
                                onClick={() => handleAcceptInterview(application.interview!.id, application.interview!.employerId)}
                              >
                                ✓ Confirm Attendance
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
                              ? 'Offer Accepted'
                              : application.offer.status === 'declined'
                              ? 'Offer Declined'
                              : 'Job Offer Received'}
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
                            {application.offer.employerSignatureImageUrl && (
                              <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                                <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', color: '#15803d', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                  ✓ Signed by {application.offer.employerSignatureName || 'Employer'}
                                </p>
                                <SignedImage
                                  src={application.offer.employerSignatureImageUrl}
                                  alt={`Signature of ${application.offer.employerSignatureName || 'Employer'}`}
                                  style={{ maxHeight: 56, maxWidth: '100%', display: 'block' }}
                                />
                              </div>
                            )}
                            {application.offer.offerLetterUrl && (
                              <p>
                                <SignedLink src={application.offer.offerLetterUrl} className={styles.viewOfferLetterLink} download>
                                  ⬇ Download Offer Letter
                                </SignedLink>
                              </p>
                            )}
                          </div>
                          {application.offer.status === 'pending' && (
                            <div className={styles.offerActions}>
                              {(application.offer.offerLetterText || application.offer.offerLetterUrl) ? (
                                <Link
                                  href={`/applications/${application.id}/review`}
                                  className={styles.acceptOfferBtn}
                                  style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
                                >
                                  Review &amp; Counter-sign
                                </Link>
                              ) : (
                                /* No letter to sign — plain Accept. */
                                <button
                                  className={styles.acceptOfferBtn}
                                  onClick={() => handleAcceptOffer(application)}
                                >
                                  Accept Offer
                                </button>
                              )}
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
                            <div>
                              <p className={styles.offerAcceptedText}>
                                You accepted this offer on{' '}
                                {new Date(application.offer.signatureTimestamp!).toLocaleDateString('en-GB')}
                              </p>
                              {application.offer.signatureImageUrl && (
                                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                  <p style={{ margin: '0 0 0.375rem', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Your Signature</p>
                                  <SignedImage
                                    src={application.offer.signatureImageUrl}
                                    alt={`Signature of ${application.offer.signatureName || 'candidate'}`}
                                    style={{ maxHeight: 64, maxWidth: '100%', display: 'block' }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          {application.offer.status === 'declined' && (
                            <p className={styles.offerDeclinedText}>You declined this offer</p>
                          )}
                          {(application.offer.status === 'withdrawn' || application.offer.status === 'rescinded') && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: '#b91c1c', fontWeight: 600 }}>
                                {application.offer.status === 'withdrawn'
                                  ? 'This offer was withdrawn by the employer.'
                                  : 'This offer was rescinded by the employer.'}
                              </p>
                              <Link
                                href={`/applications/${application.id}/review`}
                                style={{ fontSize: '0.78rem', color: '#0369a1', textDecoration: 'underline' }}
                              >
                                See details
                              </Link>
                            </div>
                          )}
                        </div>
                      )}

                      <div className={styles.cardActions}>
                        <button
                          className={styles.viewJobBtn}
                          onClick={() => router.push(`/job/${application.jobId}?from=applications`)}
                        >
                          View Job
                        </button>
                        {/* Once an offer has been counter-signed/accepted, withdrawing the
                            APPLICATION is no longer meaningful — the contract exists. Hide
                            both the Withdraw button (for accepted) and for terminated offers
                            (rescinded/withdrawn — application already ended). */}
                        {application.status !== 'rejected'
                         && application.offer?.status !== 'accepted'
                         && application.offer?.status !== 'rescinded'
                         && application.offer?.status !== 'withdrawn'
                         && (
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

      {/* Decline modal — Accept flow now lives at /applications/[id]/review */}
      {selectedOffer && (
        <>
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
