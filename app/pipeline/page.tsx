'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import DeclineModal from '@/components/DeclineModal'
import WithdrawModal from '@/components/WithdrawModal'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import MakeOfferModal from '@/components/MakeOfferModal'
import BackwardToInterviewModal, { type BackwardToInterviewChoice } from '@/components/BackwardToInterviewModal'
import StagePickerSheet from '@/components/StagePickerSheet'
import StageDurationBadge from '@/components/StageDurationBadge'
import SortOrderControl, { type PipelineSortOrder } from '@/components/SortOrderControl'
import Toast from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { STAGE_COLORS, STAGE_LABELS } from '@/lib/constants/pipelineStages'
import { confirmHire } from '@/lib/confirmHire'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

// DECLINED is appended at the end and rendered with a muted neutral
// accent — the column reads as an outcome (end-state), not punishment.
// Drag is disabled both ways; status changes to/from 'rejected' happen
// only via the kebab menu (Decline opens the template-aware modal,
// Restore returns the card to Reviewing silently).
// Colours + labels come from the shared single source of truth
// (lib/constants/pipelineStages.ts); this array just fixes the column ORDER.
const STAGES = [
  { id: 'reviewing', label: STAGE_LABELS.reviewing, color: STAGE_COLORS.reviewing },
  { id: 'shortlisted', label: STAGE_LABELS.shortlisted, color: STAGE_COLORS.shortlisted },
  { id: 'interview', label: STAGE_LABELS.interview, color: STAGE_COLORS.interview },
  { id: 'offered', label: STAGE_LABELS.offered, color: STAGE_COLORS.offered },
  { id: 'hired', label: STAGE_LABELS.hired, color: STAGE_COLORS.hired },
  { id: 'rejected', label: STAGE_LABELS.rejected, color: STAGE_COLORS.rejected },
]

// Forward-direction order. Indices match the kanban layout above (rejected
// is intentionally excluded — it's reached via the modal, never the drag).
// Used to detect backward drags that need the confirm dialog.
const STAGE_ORDER = ['reviewing', 'shortlisted', 'interview', 'offered', 'hired'] as const

function stageIndex(status: string): number {
  return STAGE_ORDER.indexOf(status as typeof STAGE_ORDER[number])
}

// Turn the rows the cascade trigger wrote during this move into a
// human-readable toast. Empty array → silent forward move with no
// dependants → fall back to a generic "Moved to {stage}".
interface CascadeLogRow {
  cascade_kind: string
  details: { count?: number } | null
}
function summarizeCascade(rows: CascadeLogRow[], stageLabel: string): string {
  if (!rows.length) return `Moved to ${stageLabel}.`
  const parts: string[] = []
  let interviewsCompleted = 0
  let interviewsCancelled = 0
  let offerAccepted = false
  let offerWithdrawn = false
  let backward = false
  for (const r of rows) {
    const n = r.details?.count ?? 1
    if (r.cascade_kind === 'interview_completed') interviewsCompleted += n
    else if (r.cascade_kind === 'interview_cancelled') interviewsCancelled += n
    else if (r.cascade_kind === 'offer_accepted') offerAccepted = true
    else if (r.cascade_kind === 'offer_withdrawn') offerWithdrawn = true
    else if (r.cascade_kind === 'backward_move') backward = true
  }
  if (offerAccepted) parts.push('1 offer accepted')
  if (offerWithdrawn) parts.push('1 offer withdrawn')
  if (interviewsCompleted) parts.push(`${interviewsCompleted} interview${interviewsCompleted === 1 ? '' : 's'} completed`)
  if (interviewsCancelled) parts.push(`${interviewsCancelled} interview${interviewsCancelled === 1 ? '' : 's'} cancelled`)
  if (backward && parts.length === 0) return `Moved back to ${stageLabel}. Past actions preserved.`
  if (parts.length === 0) return `Moved to ${stageLabel}.`
  return `Moved to ${stageLabel}. ${parts.join(', ')}.`
}

interface PipelineCard {
  id: string
  candidateId: string
  candidateEmail: string | null
  candidateName: string
  candidatePhoto: string | null
  jobTitle: string
  jobId: string
  status: string
  appliedAt: string
  // ISO timestamp the card entered its current status. Drives the live
  // "N days in [Stage]" badge and the "Oldest in stage" sort. Sourced
  // directly from job_applications.stage_entered_at — the per-move
  // anchor populated by every status-write call site post-Phase 2.
  stageEnteredAt: string
  location: string
  experience: number
  cvUrl: string | null
  hasCoverLetter: boolean
  // True if the application has at least one row in `interviews` with
  // status pending_selection|scheduled|confirmed. Drives the "needs
  // scheduling" badge on Interview-column cards. The drag-gate ensures
  // forward drags only land here after a successful schedule, but the
  // backward "move back, no new interview" path can land a card here
  // legitimately without one.
  hasLiveInterview: boolean
}

// Per-stage primary CTA label and destination. The link goes to the
// employer's per-job applications view which already hosts stage-appropriate
// modals (Schedule Interview, Make Offer, etc.). Drag still advances stages.
const STAGE_CTA: Record<string, { label: string; toApplications: boolean } | null> = {
  reviewing: { label: 'Review →', toApplications: true },
  shortlisted: { label: 'Schedule Interview →', toApplications: true },
  interview: { label: 'Make Offer →', toApplications: true },
  offered: { label: 'View Offer →', toApplications: true },
  hired: null,
  rejected: null,
}

export default function PipelinePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<PipelineCard[]>([])
  const [filterJob, setFilterJob] = useState<string>('all')
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])
  // Per-employer sort preference. Persists on employer_profiles.
  // pipeline_sort_order — see SortOrderControl for the write path. The
  // initial value is 'oldest_in_stage' (the column default) until
  // loadData resolves and overrides with the persisted value; this
  // beat is invisible because the page renders a spinner during the
  // first loadData.
  const [sortOrder, setSortOrder] = useState<PipelineSortOrder>('oldest_in_stage')
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  // Kebab + decline/restore state. employerId/employerCompany are
  // captured in loadData and passed to the shared DeclineModal so the
  // candidate email + in-app conversation message attribute correctly.
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null)
  const [declineCard, setDeclineCard] = useState<PipelineCard | null>(null)
  // Withdraw mirrors Decline: same template-aware modal, different
  // template_type ('withdrawn'), amber-not-red CTA. A successful
  // withdraw drops the card from local state — withdrawn applications
  // have no column on the board, unlike rejected which gets the
  // tombstone Declined column.
  const [withdrawCard, setWithdrawCard] = useState<PipelineCard | null>(null)
  const [restoreCard, setRestoreCard] = useState<PipelineCard | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [employerId, setEmployerId] = useState<string | null>(null)
  const [employerCompany, setEmployerCompany] = useState<string>('')
  // Backward-move confirm + post-move toast. The trigger keeps the DB
  // consistent regardless; the toast describes what cascaded so the
  // employer knows interviews/offers were touched.
  const [backwardMove, setBackwardMove] = useState<{ card: PipelineCard; newStatus: string; stageLabel: string } | null>(null)
  const [backwardSubmitting, setBackwardSubmitting] = useState(false)
  // Forward drag into the Interview column gates on a successful schedule —
  // we hold the card here while ScheduleInterviewModal is open. Cancel
  // closes the modal without ever writing job_applications.status.
  const [scheduleCard, setScheduleCard] = useState<PipelineCard | null>(null)
  // Forward drag into the Offered column gates on a successful offer send —
  // we hold the card here while MakeOfferModal is open. Cancel closes the
  // modal without ever writing job_applications.status (mirrors scheduleCard).
  const [offerCard, setOfferCard] = useState<PipelineCard | null>(null)
  // Backward drag into the Interview column shows BackwardToInterviewModal
  // first so the employer can pick: cancel / move-only / move-and-schedule.
  const [backwardToInterview, setBackwardToInterview] = useState<{ card: PipelineCard; previousStageLabel: string } | null>(null)
  // Mobile-only tap-to-move surface. The horizontal-scroll board (≤768px)
  // makes drag-drop impractical on touch, so a tap on a card body opens
  // StagePickerSheet; row tap inside the sheet feeds the same intentToMove
  // gating used by drag. Desktop drag is unchanged.
  const [stagePickerCard, setStagePickerCard] = useState<PipelineCard | null>(null)
  // Sentinel that swallows the click event @hello-pangea/dnd fires
  // immediately after a drag-release. 50ms is enough to cover the
  // browser-emitted click-after-mouseup (most user-agents synthesise it
  // 0–30ms after pointer-up) without burning a real tap that follows
  // the previous drag by more than ~80ms.
  const dragJustHappenedRef = useRef(false)
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login/employer')
      return
    }

    // Multi-user: pipeline data is keyed employer_id = owner user_id.
    const sessionEmployerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
    setEmployerId(sessionEmployerId)
    setEmployerCompany(session.user.user_metadata?.company_name || '')

    // Fetch the persisted sort preference. employer_profiles is guaranteed
    // to have a row per signed-in employer (registration creates one),
    // so a null row means a corrupt account state; fall back to the
    // column default so the page still renders sensibly.
    const { data: prefRow } = await supabase
      .from('employer_profiles')
      .select('pipeline_sort_order')
      .eq('user_id', sessionEmployerId)
      .maybeSingle()
    if (prefRow?.pipeline_sort_order === 'newest_first' || prefRow?.pipeline_sort_order === 'oldest_in_stage') {
      setSortOrder(prefRow.pipeline_sort_order)
    }

    // 'pending' lives on the Applicants page; Pipeline tracks the active
    // funnel + the DECLINED end-state. We DO want 'rejected' rows here
    // so they render in the new column.
    // Withdrawn applications are excluded — they're a terminal state
    // with no board column (Decline gets the tombstone Declined column;
    // Withdraw just disappears, since it's "candidate dropped out" not
    // "employer rejected"). Sort order is applied client-side below
    // against either stage_entered_at ASC (default) or created_at DESC
    // depending on the employer's saved pipeline_sort_order pref —
    // fetching both fields means we don't need to round-trip when the
    // sort control toggles.
    const { data: appData } = await supabase
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, status, cover_letter, created_at, status_updated_at, stage_entered_at')
      .in('job_id', (
        await supabase.from('jobs').select('id').eq('employer_id', sessionEmployerId)
      ).data?.map((j: any) => j.id) || [])
      .neq('status', 'pending')
      .neq('status', 'withdrawn')
      .order('created_at', { ascending: false })

    if (!appData) { setLoading(false); return }

    // Fetch candidate details (incl. email — needed by DeclineModal so
    // the decline email goes out without a server-side user lookup).
    const candidateIds = Array.from(new Set(appData.map(a => a.candidate_id).filter(Boolean)))
    let profileMap: Record<string, { name: string; photo: string | null; location: string; experience: number; cvUrl: string | null; email: string | null }> = {}

    if (candidateIds.length > 0) {
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name, profile_picture_url, city, location, years_experience, cv_url, email')
        .in('user_id', candidateIds)

      for (const p of profiles || []) {
        profileMap[p.user_id] = {
          name: p.full_name || 'Candidate',
          photo: p.profile_picture_url || null,
          location: p.city || p.location || '',
          experience: p.years_experience || 0,
          cvUrl: p.cv_url || null,
          email: p.email || null,
        }
      }
    }

    // Fetch unique jobs for the filter
    const jobIds = Array.from(new Set(appData.map(a => a.job_id)))
    const { data: jobData } = await supabase
      .from('jobs')
      .select('id, title')
      .in('id', jobIds)

    setJobs(jobData || [])

    // Single batched query for live interview rows so cards in the
    // Interview column can show the "needs scheduling" badge when the
    // candidate is in stage but has no live commitment.
    const appIds = appData.map(a => a.id)
    let liveSet = new Set<string>()
    if (appIds.length > 0) {
      const { data: liveInterviews } = await supabase
        .from('interviews')
        .select('application_id')
        .in('application_id', appIds)
        .in('status', ['pending_selection', 'scheduled', 'confirmed'])
      liveSet = new Set((liveInterviews || []).map(i => i.application_id))
    }

    // Map to pipeline cards. stage_entered_at is the load-bearing anchor
    // post-Phase 1 migration — backfilled from pipeline_cascade_log →
    // status_updated_at → created_at. Falling back to created_at here
    // only matters for unmigrated rows in a rolled-back database; the
    // migration guarantees a value otherwise.
    const mapped: PipelineCard[] = appData.map(a => {
      const profile = profileMap[a.candidate_id] || { name: 'Candidate', photo: null, location: '', experience: 0, cvUrl: null, email: null }
      return {
        id: a.id,
        candidateId: a.candidate_id,
        candidateEmail: profile.email,
        candidateName: profile.name,
        candidatePhoto: profile.photo,
        jobTitle: a.job_title || 'Role',
        jobId: a.job_id,
        status: a.status === 'interviewing' ? 'interview' : a.status,
        appliedAt: a.created_at,
        stageEnteredAt: a.stage_entered_at || a.status_updated_at || a.created_at,
        location: profile.location,
        experience: profile.experience,
        cvUrl: profile.cvUrl,
        hasCoverLetter: !!a.cover_letter,
        hasLiveInterview: liveSet.has(a.id),
      }
    })

    setCards(mapped)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Close the kebab popover on outside click or Escape.
  useEffect(() => {
    if (!openMenuCardId) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target?.closest(`.${styles.cardKebabWrap}`)) setOpenMenuCardId(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenuCardId(null) }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenuCardId])

  // Apply a stage move to the DB and surface what cascaded as a toast.
  // Used by both the forward-drag path and the backward-confirm path so
  // every move runs the same optimistic update, supabase write, candidate
  // notification, and cascade-log read.
  const applyMove = async (card: PipelineCard, newStatus: string, fromStatus: string, stageLabel: string) => {
    // Optimistic update
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: newStatus, stageEnteredAt: new Date().toISOString() } : c))

    // Capture cutoff so the cascade-log read only sees rows from this move.
    const requestStartIso = new Date().toISOString()

    const { error } = await supabase
      .from('job_applications')
      .update({ status: newStatus, status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
      .eq('id', card.id)

    if (error) {
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: fromStatus } : c))
      setToast({ message: 'Move failed. Please try again.', key: Date.now() })
      return
    }

    // Candidate-facing bell notification on key transitions.
    if (card.candidateId) {
      const notifMap: Record<string, { title: string; message: string }> = {
        reviewing: { title: 'Application Under Review', message: `Your application for ${card.jobTitle} is being reviewed.` },
        shortlisted: { title: 'Application Shortlisted', message: `Great news! Your application for ${card.jobTitle} has been shortlisted.` },
        interview: { title: 'Moved to Interview Stage', message: `You've been moved to the interview stage for ${card.jobTitle}. The employer will be in touch to schedule.` },
        offered: { title: 'Job Offer Received', message: `You have received a job offer for ${card.jobTitle}!` },
        hired: { title: 'Congratulations!', message: `You've been hired for ${card.jobTitle}!` },
      }
      const notif = notifMap[newStatus]
      if (notif) {
        notify('status_changed', { applicationId: card.id, extra: { status: newStatus } })
      }
    }

    // Read what the cascade trigger did (if anything) so the toast is honest.
    const { data: logRows } = await supabase
      .from('pipeline_cascade_log')
      .select('cascade_kind, details')
      .eq('application_id', card.id)
      .gte('created_at', requestStartIso)
      .order('created_at', { ascending: false })

    setToast({ message: summarizeCascade((logRows as CascadeLogRow[]) || [], stageLabel), key: Date.now() })
  }

  // Gate-aware status-transition entry point. Both drag (handleDragEnd)
  // and tap (StagePickerSheet onPick) route through here so every status
  // change inherits the same three drag-era gates: forward-into-Interview
  // opens ScheduleInterviewModal; backward-into-Interview opens
  // BackwardToInterviewModal; other backward moves open the inline
  // cascade-confirm. Forward non-interview moves call applyMove directly
  // (no gate needed).
  //
  // CONTRACT: applyMove is the no-gate write path. Every NEW transport-
  // layer caller (drag handler, click handler, kebab item, future mobile
  // affordance) MUST go through intentToMove first. The two remaining
  // direct applyMove callers in this file (the backward-move confirm OK
  // and the BackwardToInterview move-only path) are post-gate writes by
  // design — the gate fired, the user confirmed, applyMove finishes the
  // write. e2e/pipeline-mobile.spec.ts enforces this with a static-
  // analysis guard that fails the suite if applyMove appears inside
  // handleDragEnd or the StagePickerSheet wiring.
  const intentToMove = async (card: PipelineCard, newStatus: string, fromStatus: string): Promise<void> => {
    if (newStatus === fromStatus) return
    // Decline must always go through the kebab → DeclineModal so the
    // email gets sent. The DECLINED column is configured isDropDisabled
    // and its cards isDragDisabled; the StagePickerSheet excludes
    // 'rejected' from its destination list — this is the defensive guard
    // if any of those constraints get loosened later.
    if (newStatus === 'rejected' || fromStatus === 'rejected') return

    const fromIdx = stageIndex(fromStatus)
    const toIdx = stageIndex(newStatus)
    const stageLabel = STAGES.find(s => s.id === newStatus)?.label || newStatus

    if (newStatus === 'interview') {
      if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
        const previousStageLabel = STAGES.find(s => s.id === fromStatus)?.label || fromStatus
        setBackwardToInterview({ card, previousStageLabel })
      } else {
        setScheduleCard(card)
      }
      return
    }

    // Forward move into Offered must go through the offer-letter flow
    // (MakeOfferModal) — the SAME gate the "Make Offer" button uses — so an
    // Offered card always has a real job_offers row + signed letter. Cancel =
    // no write, card stays put. Backward into Offered (e.g. from Hired) falls
    // through to the generic cascade-confirm below, unchanged.
    if (newStatus === 'offered' && !(fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx)) {
      setOfferCard(card)
      return
    }

    // Forward move into Hired requires an ACCEPTED offer AND right-to-work
    // confirmed, then runs the SAME shared confirm-hire path as the card's
    // "Confirm Hire" button (no duplication, no bare applyMove). If those
    // aren't met, surface a prompt and don't move. Backward into Hired falls
    // through to the generic cascade-confirm below.
    if (newStatus === 'hired' && !(fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx)) {
      const { data: offer } = await supabase
        .from('job_offers')
        .select('status, right_to_work_confirmed')
        .eq('application_id', card.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!offer) {
        setToast({ message: 'To hire, send an offer and have it accepted first.', key: Date.now() })
        return
      }
      if (!offer.right_to_work_confirmed) {
        setToast({ message: 'Confirm right to work on the accepted offer before hiring.', key: Date.now() })
        return
      }
      if (!window.confirm(`Confirm hire for ${card.candidateName}?`)) return
      try {
        await confirmHire({
          applicationId: card.id,
          jobId: card.jobId,
          candidateId: card.candidateId,
          candidateName: card.candidateName,
          candidateEmail: card.candidateEmail,
          jobTitle: card.jobTitle,
          company: employerCompany,
        })
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'hired', stageEnteredAt: new Date().toISOString() } : c))
        setToast({ message: `${card.candidateName.split(' ')[0]} hired.`, key: Date.now() })
        loadData()
      } catch {
        setToast({ message: 'Hire failed. Please try again.', key: Date.now() })
      }
      return
    }

    if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
      setBackwardMove({ card, newStatus, stageLabel })
      return
    }

    await applyMove(card, newStatus, fromStatus, stageLabel)
  }

  // Drag transport → intentToMove. The sentinel below swallows the
  // synthetic click the browser fires immediately after a successful
  // drag-release so the card-level onClick (tap → StagePickerSheet)
  // doesn't double-fire on touch devices.
  const handleDragEnd = async (result: DropResult) => {
    dragJustHappenedRef.current = true
    setTimeout(() => { dragJustHappenedRef.current = false }, 50)

    const { draggableId, destination, source } = result
    if (!destination || destination.droppableId === source.droppableId) return

    const card = cards.find(c => c.id === draggableId)
    if (!card) return

    await intentToMove(card, destination.droppableId, source.droppableId)
  }

  // Filter by job, then apply the per-employer sort preference. The
  // DB query already returned the rows in created_at DESC; we re-sort
  // client-side so the sort control flips instantly without a refetch.
  //
  // Sort semantics:
  //   - 'oldest_in_stage' → ASC by stage_entered_at. Cards that have
  //     been sitting longest float to the top of each column. Default,
  //     and the one that drives employer attention toward stale work.
  //   - 'newest_first' → DESC by created_at. Original behaviour from
  //     before the sort control existed. Preserved verbatim for users
  //     who explicitly toggled to this mode.
  //
  // Within each column the sort is over the full filteredCards array,
  // not per-column, because column membership is derived from status —
  // sorting the whole list and then partitioning by status gives the
  // same result as partitioning then sorting, and keeps the code path
  // straightforward.
  const filteredCards = (filterJob === 'all' ? cards : cards.filter(c => c.jobId === filterJob))
    .slice()
    .sort((a, b) => {
      if (sortOrder === 'oldest_in_stage') {
        return new Date(a.stageEnteredAt).getTime() - new Date(b.stageEnteredAt).getTime()
      }
      return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
    })

  if (loading) {
    return (
      <main><Header />
        <div className={styles.loadingState}><div className={styles.spinner} /><p>Loading pipeline...</p></div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.title}>Hiring Pipeline</h1>
          <p className={styles.subtitle}>{cards.length} candidate{cards.length !== 1 ? 's' : ''} across {jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.controls}>
          <SortOrderControl
            value={sortOrder}
            onChange={setSortOrder}
            employerId={employerId}
          />
          <select
            value={filterJob}
            onChange={e => setFilterJob(e.target.value)}
            className={styles.jobFilter}
          >
            <option value="all">All jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={styles.board}>
          {STAGES.map(stage => {
            const stageCards = filteredCards.filter(c => c.status === stage.id)
            const isDeclined = stage.id === 'rejected'
            return (
              <div
                key={stage.id}
                // Anchor target for the dashboard's phone pipeline rows, which
                // link to /pipeline#stage-<id>. Native anchor scrolling brings
                // the right column into view inside the horizontally scrolling
                // board — no query param, no router state, nothing to keep in
                // sync. A row tap that always landed on "Applied" would have
                // made five of the six rows lie about where they go.
                id={`stage-${stage.id}`}
                className={`${styles.column} ${isDeclined ? styles.columnDeclined : ''}`}
                // --rs-accent cascades into the count badge, stage CTA,
                // and any other quiet stage-tinted element in the column.
                // Stops us from threading inline colour through every
                // descendant ref.
                style={{ ['--rs-accent' as any]: stage.color }}
              >
                <div className={styles.columnHeader} style={{ borderTopColor: stage.color }}>
                  <span className={styles.columnTitle}>{stage.label}</span>
                  <span className={styles.columnCount}>{stageCards.length}</span>
                </div>
                <Droppable droppableId={stage.id} isDropDisabled={isDeclined}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`${styles.columnBody} ${snapshot.isDraggingOver ? styles.columnBodyDragOver : ''}`}
                    >
                      {stageCards.map((card, index) => (
                        <Draggable key={card.id} draggableId={card.id} index={index} isDragDisabled={isDeclined}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${styles.card} ${snapshot.isDragging ? styles.cardDragging : ''} ${isDeclined ? styles.cardDeclined : ''}`}
                              onClick={() => {
                                // Click-after-drag suppression. Kebab / CTA /
                                // Details inner buttons stopPropagation on
                                // their own onClick, so this only fires for
                                // taps on the card body itself.
                                if (dragJustHappenedRef.current) return
                                if (isDeclined) return
                                setStagePickerCard(card)
                              }}
                            >
                              <div className={styles.cardHeader}>
                                <div className={styles.cardAvatar}>
                                  {card.candidatePhoto ? (
                                    <SignedImage src={card.candidatePhoto} alt={card.candidateName} className={styles.cardAvatarImg} />
                                  ) : (
                                    <span className={styles.cardAvatarInitial}>
                                      {card.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </span>
                                  )}
                                </div>
                                <div className={styles.cardInfo}>
                                  <span className={styles.cardName}>{card.candidateName}</span>
                                  <span className={styles.cardJob}>{card.jobTitle}</span>
                                </div>
                                <div className={styles.cardKebabWrap}>
                                  <button
                                    type="button"
                                    aria-label="Card actions"
                                    aria-expanded={openMenuCardId === card.id}
                                    className={styles.cardKebab}
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setOpenMenuCardId(prev => prev === card.id ? null : card.id)
                                    }}
                                  >
                                    ⋯
                                  </button>
                                  {openMenuCardId === card.id && (
                                    <div className={styles.cardMenu} role="menu" onClick={e => e.stopPropagation()}>
                                      {card.status === 'rejected' ? (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className={styles.cardMenuItem}
                                          onClick={() => { setOpenMenuCardId(null); setRestoreCard(card) }}
                                        >
                                          Restore to Reviewing
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className={styles.cardMenuItem}
                                            onClick={() => { setOpenMenuCardId(null); setDeclineCard(card) }}
                                          >
                                            Decline
                                          </button>
                                          {/* Mark as withdrawn — separate from Decline because the
                                              semantics differ (candidate dropped out vs. employer
                                              rejected). Amber-leaning, not red. The successful-
                                              withdraw handler drops the card from local state since
                                              withdrawn has no column on the board. */}
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className={styles.cardMenuItem}
                                            onClick={() => { setOpenMenuCardId(null); setWithdrawCard(card) }}
                                          >
                                            Mark as withdrawn
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {card.status === 'interview' && !card.hasLiveInterview && (
                                <button
                                  type="button"
                                  className={styles.needsSchedulingBadge}
                                  title="Schedule interview"
                                  aria-label={`Schedule interview for ${card.candidateName}`}
                                  onClick={e => {
                                    // stopPropagation so the card-body tap-to-move
                                    // sheet doesn't also open. Opens the SAME
                                    // ScheduleInterviewModal the drag/tap gate uses
                                    // (create-new: no active interview row exists
                                    // while this badge shows).
                                    e.stopPropagation()
                                    setScheduleCard(card)
                                  }}
                                >
                                  Needs scheduling
                                </button>
                              )}
                              {(() => {
                                const cta = STAGE_CTA[card.status]
                                if (!cta) return null
                                const href = cta.toApplications
                                  ? `/my-jobs/${card.jobId}/applications?from=pipeline&applicationId=${card.id}`
                                  : `/candidates/${card.candidateId}?from=pipeline`
                                return (
                                  <Link
                                    href={href}
                                    className={styles.cardPrimaryCta}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {cta.label}
                                  </Link>
                                )
                              })()}
                              {expandedCardId === card.id && (
                                <div className={styles.cardDetails}>
                                  {(card.location || card.experience > 0) && (
                                    <div className={styles.cardMeta}>
                                      {card.location && <span className={styles.metaBadge}><Ico name="map-pin" size={16} /> {card.location}</span>}
                                      {card.experience > 0 && <span className={styles.metaBadge}><Ico name="briefcase" size={16} /> {card.experience}yr{card.experience !== 1 ? 's' : ''}</span>}
                                    </div>
                                  )}
                                  <div className={styles.cardSecondaryActions}>
                                    <Link
                                      href={`/candidates/${card.candidateId}?from=pipeline`}
                                      className={styles.cardSecondaryBtn}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      View Profile
                                    </Link>
                                    {card.cvUrl && (
                                      <SignedLink
                                        src={card.cvUrl}
                                        className={styles.cardSecondaryBtn}
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                      >
                                        View CV
                                      </SignedLink>
                                    )}
                                  </div>
                                </div>
                              )}
                              <div className={styles.cardFooter}>
                                <StageDurationBadge
                                  stageEnteredAt={card.stageEnteredAt}
                                  stageLabel={STAGES.find(s => s.id === card.status)?.label || card.status}
                                  stageColor={STAGES.find(s => s.id === card.status)?.color}
                                />
                                <button
                                  type="button"
                                  className={styles.cardDetailsToggle}
                                  onClick={e => {
                                    e.stopPropagation()
                                    setExpandedCardId(prev => prev === card.id ? null : card.id)
                                  }}
                                  onMouseDown={e => e.stopPropagation()}
                                >
                                  Details {expandedCardId === card.id ? '▴' : '▾'}
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {stageCards.length === 0 && (
                        <div className={styles.emptyColumn}>
                          No candidates
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* Decline modal — shared with /my-jobs/[jobId]/applications. Owns
          its own template/edit/send state; we react via onDeclined to
          flip the local card's status without a refetch. */}
      {declineCard && employerId && (
        <DeclineModal
          applicationId={declineCard.id}
          candidateId={declineCard.candidateId}
          candidateEmail={declineCard.candidateEmail}
          candidateName={declineCard.candidateName}
          jobTitle={declineCard.jobTitle}
          companyName={employerCompany}
          employerId={employerId}
          onClose={() => setDeclineCard(null)}
          onDeclined={() => {
            const cardId = declineCard.id
            setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'rejected', stageEnteredAt: new Date().toISOString() } : c))
          }}
        />
      )}

      {/* Withdraw modal — same shape as Decline but writes status='withdrawn'.
          On success the card vanishes from the board (no Withdrawn column,
          unlike Decline which gets the tombstone Declined column). */}
      {withdrawCard && employerId && (
        <WithdrawModal
          applicationId={withdrawCard.id}
          candidateId={withdrawCard.candidateId}
          candidateEmail={withdrawCard.candidateEmail}
          candidateName={withdrawCard.candidateName}
          jobTitle={withdrawCard.jobTitle}
          companyName={employerCompany}
          employerId={employerId}
          onClose={() => setWithdrawCard(null)}
          onWithdrawn={() => {
            const cardId = withdrawCard.id
            setCards(prev => prev.filter(c => c.id !== cardId))
            setToast({ message: `${withdrawCard.candidateName.split(' ')[0]} marked as withdrawn.`, key: Date.now() })
          }}
        />
      )}

      {/* Restore confirmation — silent move back to Reviewing. No email,
          no notification (it's an internal correction, not a candidate-
          facing event). */}
      {restoreCard && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !restoring && setRestoreCard(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, maxWidth: 420, width: '100%', padding: '1.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Restore candidate?</h3>
            <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              This will move <strong>{restoreCard.candidateName}</strong> back to Reviewing. No email will be sent.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setRestoreCard(null)}
                disabled={restoring}
                style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!restoreCard) return
                  setRestoring(true)
                  const cardId = restoreCard.id
                  const { error } = await supabase
                    .from('job_applications')
                    .update({ status: 'reviewing', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
                    .eq('id', cardId)
                  setRestoring(false)
                  if (error) {
                    alert('Failed to restore. Please try again.')
                    return
                  }
                  setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'reviewing', stageEnteredAt: new Date().toISOString() } : c))
                  setRestoreCard(null)
                }}
                disabled={restoring}
                style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: 8, background: restoring ? '#94a3b8' : '#0f172a', color: '#FFE500', cursor: restoring ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backward-move confirmation. The DB trigger preserves past
          actions (sent emails, scheduled interviews, offer history) on
          backward moves and writes an audit row to pipeline_cascade_log
          — this dialog warns the employer before that happens. */}
      {backwardMove && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !backwardSubmitting && setBackwardMove(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: '1.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
              Move {backwardMove.card.candidateName} back to {backwardMove.stageLabel}?
            </h3>
            <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              Their past actions stay in place — emails sent, interviews logged, offer history. Nothing is undone. The move is recorded for audit.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setBackwardMove(null)}
                disabled={backwardSubmitting}
                style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!backwardMove) return
                  setBackwardSubmitting(true)
                  const { card, newStatus, stageLabel } = backwardMove
                  await applyMove(card, newStatus, card.status, stageLabel)
                  setBackwardSubmitting(false)
                  setBackwardMove(null)
                }}
                disabled={backwardSubmitting}
                style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: 8, background: backwardSubmitting ? '#94a3b8' : '#0f172a', color: '#FFE500', cursor: backwardSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                {backwardSubmitting ? 'Moving…' : 'Move back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward-into-Interview gate. Card stays at source until the
          schedule succeeds; cancel = no DB write. After success, do an
          optimistic flip on hasLiveInterview so the badge never flashes,
          then refetch via loadData() for correctness. */}
      {scheduleCard && employerId && (
        <ScheduleInterviewModal
          isOpen
          onClose={() => setScheduleCard(null)}
          applicationId={scheduleCard.id}
          jobId={scheduleCard.jobId}
          jobTitle={scheduleCard.jobTitle}
          company={employerCompany}
          candidateId={scheduleCard.candidateId}
          candidateName={scheduleCard.candidateName}
          candidateEmail={scheduleCard.candidateEmail || undefined}
          onSuccess={(emailOutcome) => {
            const cardId = scheduleCard.id
            const first = scheduleCard.candidateName.split(' ')[0]
            setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'interview', stageEnteredAt: new Date().toISOString(), hasLiveInterview: true } : c))
            setScheduleCard(null)
            // THE SECOND SCREEN THAT ASSERTED DELIVERY. "Schedule sent to
            // <name>" was printed whether or not the email went — and here
            // the email carries the LINK the candidate needs to pick a slot,
            // so its absence is not a missed nudge, it is a candidate who
            // cannot book. An in-app message follows too, which is why the
            // move to Interview is still reported as done.
            setToast({
              message: emailOutcome === 'sent'
                ? `Moved to Interview. Schedule sent to ${first}.`
                : `Moved to Interview, but we couldn't email ${first} the booking link — it's in their Thrive messages.`,
              key: Date.now(),
            })
            loadData()
          }}
        />
      )}

      {/* Forward-into-Offered gate. Card stays at source until an offer is
          actually sent (MakeOfferModal writes the job_offers row + flips
          status='offered' itself); cancel = no DB write, card stays put. On
          success we refetch via loadData() so the card lands in Offered with
          a real offer behind it. Mirrors the scheduleCard gate above. */}
      {offerCard && employerId && (
        <MakeOfferModal
          isOpen
          onClose={() => setOfferCard(null)}
          applicationId={offerCard.id}
          jobId={offerCard.jobId}
          jobTitle={offerCard.jobTitle}
          company={employerCompany}
          candidateId={offerCard.candidateId}
          candidateName={offerCard.candidateName}
          candidateEmail={offerCard.candidateEmail || undefined}
          onSuccess={(emailOutcome) => {
            const name = offerCard.candidateName.split(' ')[0]
            setOfferCard(null)
            // THE TOAST SAID "Offer sent" WHETHER OR NOT THE EMAIL WENT.
            // The offer itself always lands — a notification and a full
            // conversation message both go out — so "Offer sent" is true of
            // the OFFER. It was silent about the one channel that reaches a
            // candidate who is not looking at Thrive, which for a job offer
            // is the channel that matters most.
            setToast({
              message: emailOutcome === 'sent'
                ? `Offer sent to ${name}. Moved to Offered.`
                : `Offer sent to ${name}, but we couldn't email them — they'll see it in Thrive.`,
              key: Date.now(),
            })
            loadData()
          }}
        />
      )}

      {/* Backward-into-Interview chooser. Three buttons: cancel (no
          write), move-only (status flips, no new interview row → badge
          appears), move-and-schedule (status flips then ScheduleInterviewModal opens). */}
      {backwardToInterview && (
        <BackwardToInterviewModal
          candidateName={backwardToInterview.card.candidateName}
          previousStageLabel={backwardToInterview.previousStageLabel}
          onChoose={async (choice) => {
            const { card, previousStageLabel } = backwardToInterview
            setBackwardToInterview(null)
            if (choice === 'cancel') return

            await applyMove(card, 'interview', card.status, 'Interview')
            // Optimistic: no live interview yet → badge will render. The
            // applyMove path didn't refetch, so set the field locally.
            setCards(prev => prev.map(c => c.id === card.id ? { ...c, hasLiveInterview: false } : c))

            if (choice === 'move-and-schedule') {
              // Re-open the schedule modal in the same tick. If the
              // employer cancels, the card stays in Interview with the
              // badge — they accepted the backward intent.
              setScheduleCard({ ...card, status: 'interview', hasLiveInterview: false })
            }
            // Suppress unused-warning for previousStageLabel — kept in scope
            // for clarity at the call site.
            void previousStageLabel
          }}
        />
      )}

      {/* Mobile-primary tap-to-move surface. A tap on a card body opens
          this sheet; picking a destination routes through intentToMove
          so the three drag-era gates (schedule modal, backward-to-
          interview chooser, cascade-confirm) fire identically to drag.
          Rendered at every viewport — desktop users who happen to tap
          a card instead of dragging get the same picker. */}
      {stagePickerCard && (
        <StagePickerSheet
          candidateName={stagePickerCard.candidateName}
          currentStageLabel={STAGES.find(s => s.id === stagePickerCard.status)?.label || stagePickerCard.status}
          currentStageId={stagePickerCard.status}
          stages={STAGES}
          stageOrder={STAGE_ORDER as readonly string[]}
          onClose={() => setStagePickerCard(null)}
          onPick={(newStatusId) => {
            const card = stagePickerCard
            setStagePickerCard(null)
            void intentToMove(card, newStatusId, card.status)
          }}
          onDecline={() => {
            const card = stagePickerCard
            setStagePickerCard(null)
            setDeclineCard(card)
          }}
          onWithdraw={() => {
            const card = stagePickerCard
            setStagePickerCard(null)
            setWithdrawCard(card)
          }}
        />
      )}

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </main>
  )
}
