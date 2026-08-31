'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import PrepNotesModal from '@/components/PrepNotesModal'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { MapPin, Video, Phone, MoreHorizontal } from 'lucide-react'
import { RowInlineFields } from '@/components/RowInlineFields'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface InterviewItem {
  interviewId: string
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidatePhoto: string | null
  candidateEmail: string
  candidatePhone: string | null
  interviewDate: string
  interviewTime: string
  interviewType: string
  durationMinutes: number
  locationOrLink: string | null
  meetingLink: string | null
  calendarLink: string | null
  notes: string | null
  status: string
  outcome: 'completed' | 'no_show' | null
}

// interview_date/interview_time are stored as local wall-clock; parsing with
// `new Date(`${date}T${time}`)` (no Z) reads them in the local timezone, which
// matches how the rest of this page formats them.
function interviewStartMs(dateStr: string, timeStr: string | null): number {
  return new Date(`${dateStr}T${timeStr || '00:00'}`).getTime()
}
// End of the interview = start + duration (duration_minutes is NOT NULL,
// default 30). A 2:00–3:00pm interview is "past" at 3:00pm, not 2:00pm.
function interviewEndMs(i: { interviewDate: string; interviewTime: string | null; durationMinutes: number }): number {
  return interviewStartMs(i.interviewDate, i.interviewTime) + (i.durationMinutes || 30) * 60000
}
// Resolution state of a row that belongs in "Past".
function pastState(i: InterviewItem): 'cancelled' | 'rescheduled' | 'completed' | 'no_show' | 'unresolved' {
  if (i.status === 'cancelled') return 'cancelled'
  if (i.status === 'rescheduled') return 'rescheduled'
  if (i.outcome === 'completed' || i.status === 'completed') return 'completed'
  if (i.outcome === 'no_show') return 'no_show'
  return 'unresolved'
}

const TYPE_LABELS: Record<string, string> = {
  'in-person': 'In-Person',
  'video': 'Video Call',
  'phone': 'Phone Call',
}

// Build a mailto: link to the candidate with a short, professional draft
// referencing the role + company, opening the employer's default mail client.
function buildCandidateMailto(interview: InterviewItem): string {
  const firstName = (interview.candidateName || '').split(' ')[0] || 'there'
  const subject = `Your ${interview.jobTitle} interview at ${interview.company}`
  const body = [
    `Hi ${firstName},`,
    '',
    `I'm reaching out regarding your interview for the ${interview.jobTitle} role at ${interview.company}.`,
    '',
    'Best regards,',
    interview.company,
  ].join('\n')
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  // Only inline the address if it's a clean address with none of the characters
  // that could inject extra mailto parameters/recipients (?, &, #, %, comma,
  // whitespace). Otherwise omit the recipient — the employer can fill in the To
  // field — rather than risk mailto parameter injection from a tainted email.
  const email = (interview.candidateEmail || '').trim()
  const safeEmail = /^[^\s@,?&#%]+@[^\s@,?&#%]+\.[^\s@,?&#%]+$/.test(email) ? email : ''
  return `mailto:${safeEmail}?${query}`
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  'in-person': styles.typeInPerson,
  'video': styles.typeVideo,
  'phone': styles.typePhone,
}

export default function InterviewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [employerId, setEmployerId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [upcoming, setUpcoming] = useState<InterviewItem[]>([])
  const [past, setPast] = useState<InterviewItem[]>([])
  const [pastExpanded, setPastExpanded] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<InterviewItem | null>(null)
  // Prep-notes modal target (private rich-text note for one interview).
  const [notesTarget, setNotesTarget] = useState<InterviewItem | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  // The past interview currently being marked completed / no-show.
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})
  const [activeFilter, setActiveFilter] = useState<'today' | 'week' | 'all'>('all')
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  // Phase 1: the per-row "⋯" overflow menu is presented but its items
  // do not yet wire to real handlers — see the click handlers below.
  // Phase 2 will hook them up after Paul approves the look.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Outside-click closes the open overflow menu.
  useEffect(() => {
    if (!openMenuId) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openMenuId])

  useEffect(() => { loadInterviews() }, [])

  const loadInterviews = async () => {
    const session = await getSessionWithRetry()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login/employer')
      return
    }
    const eid = session.user.id
    setEmployerId(eid)

    const { data: empProfile } = await supabase
      .from('employer_profiles')
      .select('company_name')
      .eq('user_id', eid)
      .maybeSingle()
    const cName = empProfile?.company_name || 'Company'
    setCompanyName(cName)

    const { data: interviews } = await supabase
      .from('interviews')
      .select('*')
      .eq('employer_id', eid)
      .order('interview_date', { ascending: true })
      .order('interview_time', { ascending: true })

    if (!interviews || interviews.length === 0) {
      setLoading(false)
      return
    }

    const candidateIds = Array.from(new Set(interviews.map((i: any) => i.candidate_id as string)))
    const jobIds = Array.from(new Set(interviews.map((i: any) => i.job_id as string)))

    const [{ data: profiles }, { data: jobs }] = await Promise.all([
      supabase
        .from('candidate_profiles')
        .select('user_id, full_name, profile_picture_url, email, phone')
        .in('user_id', candidateIds),
      supabase
        .from('jobs')
        .select('id, title, company')
        .in('id', jobIds),
    ])

    const profileMap: Record<string, any> = {}
    if (profiles) profiles.forEach((p: any) => { profileMap[p.user_id] = p })
    const jobMap: Record<string, any> = {}
    if (jobs) jobs.forEach((j: any) => { jobMap[j.id] = j })

    const mapped: InterviewItem[] = interviews.map((i: any) => {
      const profile = profileMap[i.candidate_id]
      const job = jobMap[i.job_id]
      return {
        interviewId: i.id,
        applicationId: i.application_id,
        jobId: i.job_id,
        jobTitle: job?.title || 'Unknown Role',
        company: job?.company || cName,
        candidateId: i.candidate_id,
        candidateName: profile?.full_name || 'Candidate',
        candidatePhoto: profile?.profile_picture_url || null,
        candidateEmail: profile?.email || '',
        candidatePhone: profile?.phone || null,
        interviewDate: i.interview_date,
        interviewTime: i.interview_time,
        interviewType: i.interview_type,
        durationMinutes: i.duration_minutes,
        locationOrLink: i.location_or_link || null,
        meetingLink: i.location_or_link || null,
        calendarLink: i.calendar_link || null,
        notes: i.notes || null,
        status: i.status,
        outcome: i.outcome ?? null,
      }
    })

    // Defence-in-depth: even within the active statuses, exclude rows
    // with NULL date/time. After fix #1b, those should only exist on
    // 'pending_selection' rows (excluded by the status filter anyway),
    // but if a phantom row slipped through with status='scheduled' /
    // 'confirmed' / 'completed' / 'cancelled' and NULL date/time, the
    // formatters and sort below would crash. Filtering by status is
    // the canonical gate; this NULL filter is the safety net.
    const nowMs = Date.now()
    // "Past" = the interview's END time (start + duration) has elapsed. An
    // active row only leaves Upcoming once it has actually finished, so a
    // 2:00–3:00pm interview still shows as upcoming at 2:30pm.
    const hasEnded = (i: InterviewItem) =>
      !!i.interviewDate && !!i.interviewTime && interviewEndMs(i) <= nowMs

    // Upcoming = active status AND not yet ended, soonest first.
    const upcomingItems = mapped
      .filter(i => ['scheduled', 'confirmed'].includes(i.status) && i.interviewDate && i.interviewTime && !hasEnded(i))
      .sort((a, b) => interviewStartMs(a.interviewDate, a.interviewTime) - interviewStartMs(b.interviewDate, b.interviewTime))

    // Past = terminal/resolved statuses, OR an active interview whose time has
    // already passed (the "needs resolving" case). Most-recent-first by end time.
    const pastItems = mapped
      .filter(i => i.interviewDate && (
        ['completed', 'cancelled', 'rescheduled'].includes(i.status) ||
        (['scheduled', 'confirmed'].includes(i.status) && hasEnded(i))
      ))
      .sort((a, b) => interviewEndMs(b) - interviewEndMs(a))

    const initialNotes: Record<string, string> = {}
    mapped.forEach(i => { initialNotes[i.interviewId] = i.notes || '' })
    setNotesMap(initialNotes)

    setUpcoming(upcomingItems)
    setPast(pastItems)
    setLoading(false)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const formatGroupHeader = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const long = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    if (date.getTime() === today.getTime()) return `Today — ${long}`
    if (date.getTime() === tomorrow.getTime()) return `Tomorrow — ${long}`
    return long
  }

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const h = hours % 12 || 12
    return `${h}:${String(minutes).padStart(2, '0')} ${ampm}`
  }

  // Compact row date — drops "at" and duration, e.g. "Tue 12 May, 3:30 PM".
  // Duration is hidden in the row but still in the row's overflow menu /
  // detail screen (Phase 2).
  const formatRowDateTime = (dateStr: string, timeStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    return `${dayStr}, ${formatTime(timeStr)}`
  }

  const buildCalendarUrl = (interview: InterviewItem) => {
    const [year, month, day] = interview.interviewDate.split('-').map(Number)
    const [hours, minutes] = interview.interviewTime.split(':').map(Number)
    const start = new Date(year, month - 1, day, hours, minutes, 0)
    const end = new Date(start.getTime() + interview.durationMinutes * 60000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
    return (
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(`Interview - ${interview.jobTitle}`)}` +
      `&details=${encodeURIComponent(`Interview with ${interview.candidateName} for ${interview.jobTitle}`)}` +
      `&dates=${fmt(start)}/${fmt(end)}` +
      `&location=${encodeURIComponent(interview.locationOrLink || TYPE_LABELS[interview.interviewType] || interview.interviewType)}` +
      `&ctz=Europe%2FLondon`
    )
  }

  const handleNoteBlur = async (interviewId: string, value: string) => {
    await supabase.from('interviews').update({ notes: value }).eq('id', interviewId)
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCancelInterview = async (interview: InterviewItem) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel this interview?\nThe candidate will be notified.`
    )
    if (!confirmed) return

    setCancellingId(interview.interviewId)
    try {
      // /api/calendar/cancel is the single source of truth for cancellation:
      // it sets interviews.status='cancelled', notifies + messages + emails
      // the candidate, AND deletes the mirrored Google Calendar event (via
      // interview_bookings.gcal_event_id_employer). It soft-skips the Google
      // call when there's no synced event (returns ok:true, skipped). We
      // AWAIT it so the row only moves to "Past" once the cancel actually
      // succeeded, and so we don't double-send the candidate comms (which is
      // what would happen if we also did them client-side here).
      const res = await fetch('/api/calendar/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewId: interview.interviewId, employerId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Cancellation failed')
      }

      const cancelled = { ...interview, status: 'cancelled' }
      setUpcoming(prev => prev.filter(i => i.interviewId !== interview.interviewId))
      setPast(prev => [...prev, cancelled].sort((a, b) => interviewEndMs(b) - interviewEndMs(a)))
    } catch (err) {
      console.error('Error cancelling interview:', err)
      alert('Sorry — we couldn\'t cancel this interview. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  // Record the outcome of a passed interview (Completed / No-show). This is a
  // RECORD-ONLY action: it sets interviews.outcome and does NOT change status
  // or touch the candidate's pipeline stage — advancing/rejecting from the
  // interview outcome is a deliberate later follow-up. RLS limits the update to
  // the employer's own rows.
  const handleResolveOutcome = async (interview: InterviewItem, outcome: 'completed' | 'no_show') => {
    const label = outcome === 'completed' ? 'Completed' : 'No-show'
    if (!window.confirm(`Mark this interview as “${label}”? This records what happened — it won’t move the candidate in your pipeline.`)) return

    setResolvingId(interview.interviewId)
    try {
      const { error } = await supabase
        .from('interviews')
        .update({ outcome })
        .eq('id', interview.interviewId)
      if (error) throw error
      setPast(prev => prev.map(i => i.interviewId === interview.interviewId ? { ...i, outcome } : i))
    } catch (err) {
      console.error('Error recording interview outcome:', err)
      alert('Sorry — we couldn\'t save that. Please try again.')
    } finally {
      setResolvingId(null)
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0)
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`
  const weekEnd = new Date(todayObj); weekEnd.setDate(todayObj.getDate() + 7)

  const countToday = upcoming.filter(i => i.interviewDate === todayStr).length
  const countThisWeek = upcoming.filter(i => {
    const [y, m, d] = i.interviewDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt >= todayObj && dt <= weekEnd
  }).length
  const countConfirmed = upcoming.filter(i => i.status === 'confirmed').length
  const countCompleted = past.filter(i => i.status === 'completed').length

  const filteredUpcoming = upcoming.filter(i => {
    if (activeFilter === 'today') return i.interviewDate === todayStr
    if (activeFilter === 'week') {
      const [y, m, d] = i.interviewDate.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      return dt >= todayObj && dt <= weekEnd
    }
    return true
  })


  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading interviews...</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>

        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Interviews</h1>
          <p className={styles.pageSubtitle}>Your upcoming interview schedule</p>
        </div>

        {/* Stats bar removed — the filter tabs below carry the same counts,
            keeping the page glanceable instead of doubling the top region. */}

        {/* Filter Tabs */}
        {upcoming.length > 0 && (
          <div className={styles.filterTabs}>
            {([
              { key: 'today' as const, label: 'Today', count: countToday },
              { key: 'week' as const, label: 'This Week', count: countThisWeek },
              { key: 'all' as const, label: 'All Upcoming', count: upcoming.length },
            ]).map(tab => (
              <button
                key={tab.key}
                className={`${styles.filterTab} ${activeFilter === tab.key ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter(tab.key)}
              >
                {tab.label}<span className={styles.filterTabCount}>({tab.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Upcoming Interviews */}
        {/* TWO DIFFERENT EMPTINESSES, AND THEY ARE NOT THE SAME SENTENCE.
            This block fired on `upcoming` alone, so an employer with a dozen
            finished interviews read "No interviews scheduled" sitting directly
            on top of "Past Interviews (12)" — a sentence describing a state the
            page is not in. Nothing was hidden; the wording was just wrong.

            Nothing yet     -> explain what the page is for, and offer the way
                               to start: the job ads.
            None coming up  -> say the interviews happened. The Manage Job Ads
                               link is dropped here on purpose; someone who has
                               been interviewing does not need to be told where
                               jobs live, and the past list below is the useful
                               thing to look at. */}
        {upcoming.length === 0 ? (
          past.length > 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Ico name="calendar" size={20} /></span>
              <h2 className={styles.emptyTitle}>Nothing coming up</h2>
              <p className={styles.emptyText}>
                Your {past.length === 1 ? 'interview has' : `${past.length} interviews have`} all
                taken place. Anything you schedule next will appear here.
              </p>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Ico name="calendar" size={20} /></span>
              <h2 className={styles.emptyTitle}>No interviews yet</h2>
              <p className={styles.emptyText}>
                When you schedule interviews with candidates they will appear here.
              </p>
              <Link href="/my-jobs" className={styles.emptyLink}>Manage Job Ads</Link>
            </div>
          )
        ) : filteredUpcoming.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><Ico name="calendar" size={20} /></span>
            <h2 className={styles.emptyTitle}>No interviews {activeFilter === 'today' ? 'today' : 'this week'}</h2>
            <p className={styles.emptyText}>
              Try viewing all upcoming interviews.
            </p>
            <button className={styles.emptyLink} onClick={() => setActiveFilter('all')}>Show all</button>
          </div>
        ) : (
          <div className={styles.interviewCards}>
            {filteredUpcoming.map(interview => {
                    // Phase 1: visual-only. Row click + every overflow menu
                    // item logs and closes the menu but does NOT navigate or
                    // call the existing modal handlers. Phase 2 (separate
                    // approval) wires real behaviour.
                    const menuOpen = openMenuId === interview.interviewId
                    const isConfirmed = interview.status === 'confirmed'
                    const modalityIcon =
                      interview.interviewType === 'video'
                        ? <Video size={16} aria-label="Video call" />
                        : interview.interviewType === 'phone'
                          ? <Phone size={16} aria-label="Phone call" />
                          : <MapPin size={16} aria-label="In-person" />
                    const modalityClass =
                      interview.interviewType === 'video'
                        ? styles.modalityVideo
                        : interview.interviewType === 'phone'
                          ? styles.modalityPhone
                          : styles.modalityInPerson

                    return (
                      <div
                        key={interview.interviewId}
                        className={styles.interviewRow}
                        role="button"
                        tabIndex={0}
                        onClick={() => console.log(`[Phase 1 stub] row-click → interview ${interview.interviewId} (${interview.candidateName})`)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            console.log(`[Phase 1 stub] row-key → interview ${interview.interviewId}`)
                          }
                        }}
                      >
                        <div className={styles.rowMain}>
                          <RowInlineFields
                            sepClassName={styles.fieldSep}
                            fields={[
                              <span key="n" className={styles.candidateName}>{interview.candidateName}</span>,
                              <span key="r" className={styles.jobTitle}>{interview.jobTitle}</span>,
                              <span key="d" className={styles.dateTime}>{formatRowDateTime(interview.interviewDate, interview.interviewTime)}</span>,
                            ]}
                          />
                        </div>

                        <div className={styles.rowAside}>
                          <span
                            className={`${styles.statusPill} ${isConfirmed ? styles.statusConfirmed : styles.statusPending}`}
                            aria-label={isConfirmed ? 'Confirmed' : 'Pending'}
                          >
                            {isConfirmed ? 'Confirmed' : 'Pending'}
                          </span>

                          <span
                            className={`${styles.modalityIcon} ${modalityClass}`}
                            title={TYPE_LABELS[interview.interviewType] || interview.interviewType}
                          >
                            {modalityIcon}
                          </span>

                          <button
                            type="button"
                            className={styles.overflowBtn}
                            aria-label="More actions"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={e => {
                              e.stopPropagation()
                              setOpenMenuId(prev => prev === interview.interviewId ? null : interview.interviewId)
                            }}
                          >
                            <MoreHorizontal size={18} />
                          </button>

                          {menuOpen && (
                            <div
                              ref={menuRef}
                              className={styles.overflowMenu}
                              role="menu"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={styles.menuItem}
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); router.push(`/messages?candidate=${interview.candidateId}`) }}
                              >
                                Message
                              </button>
                              <a
                                className={styles.menuItem}
                                role="menuitem"
                                href={buildCandidateMailto(interview)}
                                onClick={() => setOpenMenuId(null)}
                              >
                                Email
                              </a>
                              <button
                                type="button"
                                className={styles.menuItem}
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); router.push(`/calendar?date=${interview.interviewDate}`) }}
                              >
                                Calendar
                              </button>
                              <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { setOpenMenuId(null); setNotesTarget(interview) }}>Notes</button>
                              <div className={styles.menuDivider} />
                              <button
                                type="button"
                                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); setRescheduleTarget(interview) }}
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                role="menuitem"
                                disabled={cancellingId === interview.interviewId}
                                onClick={() => { setOpenMenuId(null); handleCancelInterview(interview) }}
                              >
                                {cancellingId === interview.interviewId ? 'Cancelling…' : 'Cancel'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
          </div>
        )}

        {/* Past Interviews */}
        {past.length > 0 && (
          <div className={styles.pastSection}>
            <button className={styles.pastToggle} onClick={() => setPastExpanded(p => !p)}>
              <span>Past Interviews ({past.length})</span>
              <span className={`${styles.chevron} ${pastExpanded ? styles.chevronUp : ''}`}>▾</span>
            </button>

            {pastExpanded && (
              /* Reskinned to the canonical compact-row standard, just DIMMED
                 (.pastRow) so history reads as de-emphasised — same anatomy
                 as the upcoming rows, not a different tile layout. Avatar +
                 "View Application" action are preserved. */
              <div className={`${styles.interviewCards} ${styles.pastList}`}>
                {past.map(interview => {
                  const state = pastState(interview)
                  const pill =
                    state === 'completed' ? { cls: styles.statusCompleted, label: 'Completed' }
                    : state === 'no_show' ? { cls: styles.statusNoShow, label: 'No-show' }
                    : state === 'cancelled' ? { cls: styles.statusCancelled, label: 'Cancelled' }
                    : state === 'rescheduled' ? { cls: styles.statusRescheduled, label: 'Rescheduled' }
                    : { cls: styles.statusUnresolved, label: 'Needs review' }
                  const busy = resolvingId === interview.interviewId
                  return (
                  <div key={interview.interviewId} className={`${styles.interviewRow} ${styles.pastRow}`}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowAvatar} aria-hidden="true">
                        {/* Fallback covers no-photo, still-signing and failed. */}
                        <SignedImage
                          src={interview.candidatePhoto}
                          alt=""
                          className={styles.cardPhotoImg}
                          fallback={<span className={styles.cardPhotoPlaceholder}>{getInitials(interview.candidateName)}</span>}
                        />
                      </span>
                      <RowInlineFields
                        sepClassName={styles.fieldSep}
                        fields={[
                          <span key="n" className={styles.candidateName}>{interview.candidateName}</span>,
                          <span key="r" className={styles.jobTitle}>{interview.jobTitle}</span>,
                          <span key="d" className={styles.dateTime}>{formatRowDateTime(interview.interviewDate, interview.interviewTime)}</span>,
                        ]}
                      />
                    </div>
                    <div className={styles.rowAside}>
                      <span className={`${styles.statusPill} ${pill.cls}`}>{pill.label}</span>
                      {/* This interview's time has passed but the employer hasn't
                          said what happened yet — prompt for the outcome. Recording
                          it is RECORD-ONLY (no pipeline side-effects); Reschedule
                          reuses the existing schedule modal/flow. */}
                      {state === 'unresolved' && (
                        <>
                          <button type="button" className={styles.resolveBtnPrimary} onClick={() => handleResolveOutcome(interview, 'completed')} disabled={busy}>
                            {busy ? 'Saving…' : 'Completed'}
                          </button>
                          <button type="button" className={styles.resolveBtn} onClick={() => handleResolveOutcome(interview, 'no_show')} disabled={busy}>
                            No-show
                          </button>
                          <button type="button" className={styles.resolveBtn} onClick={() => setRescheduleTarget(interview)} disabled={busy}>
                            Reschedule
                          </button>
                        </>
                      )}
                      {/* Notes are available on every interview regardless of
                          status; past/cancelled rows have no "…" menu, so the
                          entry point lives inline here. */}
                      <button type="button" className={styles.btnSm} onClick={() => setNotesTarget(interview)}>
                        Notes
                      </button>
                      <Link href={`/my-jobs/${interview.jobId}/applications`} className={styles.btnSm}>
                        View Application
                      </Link>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <ScheduleInterviewModal
          isOpen={true}
          onClose={() => setRescheduleTarget(null)}
          applicationId={rescheduleTarget.applicationId}
          jobId={rescheduleTarget.jobId}
          jobTitle={rescheduleTarget.jobTitle}
          company={rescheduleTarget.company}
          candidateId={rescheduleTarget.candidateId}
          candidateName={rescheduleTarget.candidateName}
          candidateEmail={rescheduleTarget.candidateEmail}
          existingInterviewId={rescheduleTarget.interviewId}
          existingMeetingLink={rescheduleTarget.meetingLink ?? undefined}
          onSuccess={() => {
            setRescheduleTarget(null)
            loadInterviews()
          }}
        />
      )}

      {/* Prep Notes Modal — private rich-text note for one interview */}
      {notesTarget && (
        <PrepNotesModal
          isOpen={true}
          onClose={() => setNotesTarget(null)}
          interviewId={notesTarget.interviewId}
          candidateName={notesTarget.candidateName}
          jobTitle={notesTarget.jobTitle}
        />
      )}
    </main>
  )
}
