'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import styles from './ScheduleInterviewModal.module.css'
import { Ico } from '@/components/icons'

const INTERVIEW_TYPES = [
  { value: 'in-person', label: 'In-Person' },
  { value: 'video',     label: 'Video Call' },
  { value: 'phone',     label: 'Phone Call' },
]

type Slot = { date: string; time: string; duration: number }

// Active-interview lookup result. The "one active interview per
// application" invariant is enforced in every creation path below by
// branching on this. Active = status IN ('pending_selection',
// 'scheduled', 'confirmed'). See audit INTERVIEW_AUDIT_2026-05-30.md
// fix #1c.
//
// - 'none': safe to INSERT a fresh interview row.
// - 'reuse': there is an active row in pending_selection / scheduled.
//   Caller UPDATEs that row in place to the new desired state — never
//   INSERTs alongside it. Reuse-in-place is preferred because it can
//   never momentarily produce two active rows (matters once the
//   partial UNIQUE index lands in fix #1c-ii).
// - 'confirmed_blocks': there is an active CONFIRMED row. Confirmed
//   interviews may have live Google Calendar events + sent emails;
//   overwriting silently destroys that. Caller surfaces an explicit
//   error to the employer and bails. Behaviour for confirmed-collision
//   (block vs. cancel-with-cleanup vs. force-reschedule prompt) is
//   parked for product decision; this code only ensures no crash and
//   no duplicate row.
type ActiveInterviewSlot =
  | { kind: 'none' }
  | { kind: 'reuse'; interviewId: string; schedulingToken: string | null }
  | { kind: 'confirmed_blocks'; interviewId: string }

async function findActiveInterviewSlot(applicationId: string): Promise<ActiveInterviewSlot> {
  const { data, error } = await supabase
    .from('interviews')
    .select('id, status, scheduling_token')
    .eq('application_id', applicationId)
    .in('status', ['pending_selection', 'scheduled', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return { kind: 'none' }
  if (data.status === 'confirmed') return { kind: 'confirmed_blocks', interviewId: data.id }
  return { kind: 'reuse', interviewId: data.id, schedulingToken: data.scheduling_token as string | null }
}

const CONFIRMED_COLLISION_ERROR =
  'This candidate already has a confirmed interview for this role. Cancel that interview first (from the interview list or the calendar) before scheduling a new one.'

interface ScheduleInterviewModalProps {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  jobLocation?: string
  existingInterviewId?: string
  existingMeetingLink?: string
  onSuccess: () => void
}

// Format "HH:MM" → "9:00am"
const fmt12 = (hm: string) => {
  const [hStr, mStr] = hm.split(':')
  let h = Number(hStr)
  const m = Number(mStr)
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

// Format "YYYY-MM-DD" → { weekday, day, month } pieces
const formatDateParts = (dateStr: string) => {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  return {
    weekday: dt.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: String(d),
    month: dt.toLocaleDateString('en-GB', { month: 'short' }),
    full: dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

export default function ScheduleInterviewModal({
  isOpen,
  onClose,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateId,
  candidateName,
  candidateEmail,
  existingInterviewId,
  existingMeetingLink,
  onSuccess,
}: ScheduleInterviewModalProps) {
  // Manual-mode state (unchanged legacy)
  const [slots, setSlots] = useState([
    { date: '', time: '' },
    { date: '', time: '' },
    { date: '', time: '' },
  ])

  // Shared fields
  const [interviewType, setInterviewType] = useState('in-person')
  const [meetingLink, setMeetingLink] = useState(existingMeetingLink || '')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [conflictWarning, setConflictWarning] = useState('')
  const [letCandidatePick, setLetCandidatePick] = useState(false)

  // Calendar-mode state
  const [mode, setMode] = useState<'calendar' | 'manual'>('calendar')
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [hasGcal, setHasGcal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const interviewTypeLabel = INTERVIEW_TYPES.find(t => t.value === interviewType)?.label ?? 'In-Person'

  // Load availability when modal opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      setSlotsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setAvailableSlots([]); return }
        // Multi-user: slots come from the owner's availability (employer_id = owner uid).
        const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
        const from = new Date()
        const to = new Date(Date.now() + 28 * 86_400_000)
        const fromStr = from.toISOString().slice(0, 10)
        const toStr = to.toISOString().slice(0, 10)
        const res = await fetch(
          `/api/calendar/slots?employerId=${ownerId}&from=${fromStr}&to=${toStr}`
        )
        const data = await res.json()
        if (cancelled) return
        const fetched: Slot[] = data.slots || []
        setAvailableSlots(fetched)
        setHasGcal(!!data.hasGcal)
        if (fetched.length > 0) setMode('calendar')
        // If no slots, don't auto-switch to manual — show the "set up availability" CTA
      } catch {
        if (!cancelled) { setAvailableSlots([]) }
      } finally {
        if (!cancelled) setSlotsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isOpen])

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of availableSlots) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    }
    return map
  }, [availableSlots])

  const availableDates = useMemo(() => Array.from(slotsByDate.keys()).sort(), [slotsByDate])

  // Build the monthly calendar grid
  const datesWithSlots = useMemo(() => new Set(availableDates), [availableDates])
  const calendarGrid = useMemo(() => {
    const { year, month } = calMonth
    const firstDay = new Date(year, month, 1)
    // Monday = 0 … Sunday = 6 (ISO week)
    const startDow = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const cells: Array<{ date: string; day: number; hasSlots: boolean; isPast: boolean; isToday: boolean } | null> = []
    // Leading blanks
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d)
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({
        date: dateStr,
        day: d,
        hasSlots: datesWithSlots.has(dateStr),
        isPast: dt < today,
        isToday: dt.getTime() === today.getTime(),
      })
    }
    return cells
  }, [calMonth, datesWithSlots])

  const calMonthLabel = new Date(calMonth.year, calMonth.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    const now = new Date()
    const current = new Date(calMonth.year, calMonth.month)
    if (current <= new Date(now.getFullYear(), now.getMonth())) return // can't go before current month
    setCalMonth(prev => {
      const d = new Date(prev.year, prev.month - 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  const nextMonth = () => {
    setCalMonth(prev => {
      const d = new Date(prev.year, prev.month + 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  // Auto-select first available date when slots load
  useEffect(() => {
    if (mode === 'calendar' && availableDates.length > 0 && !selectedDate) {
      setSelectedDate(availableDates[0])
      // Jump calendar to the month of the first available date
      const [y, m] = availableDates[0].split('-').map(Number)
      setCalMonth({ year: y, month: m - 1 })
    }
  }, [mode, availableDates, selectedDate])

  const selectedSlotObj = useMemo(() => {
    if (!selectedDate || !selectedTime) return null
    return availableSlots.find(s => s.date === selectedDate && s.time === selectedTime) || null
  }, [availableSlots, selectedDate, selectedTime])

  const checkConflict = async (date: string, time: string) => {
    if (!date || !time) { setConflictWarning(''); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      // Multi-user: interviews are keyed employer_id = owner user_id.
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      const { data: existing } = await supabase
        .from('interviews')
        .select('interview_date, interview_time, candidate_id')
        .eq('employer_id', ownerId)
        .eq('interview_date', date)
        .in('status', ['pending_selection', 'scheduled', 'confirmed'])
      if (existing && existing.length > 0) {
        const clash = existing.find(i => i.interview_time === time && i.candidate_id !== candidateId)
        if (clash) {
          setConflictWarning(`You already have an interview scheduled at this time on ${date}. You can still proceed but consider rescheduling.`)
        } else {
          setConflictWarning('')
        }
      } else {
        setConflictWarning('')
      }
    } catch { setConflictWarning('') }
  }

  const handleOpenCalendar = () => {
    const title = jobTitle ? `Interview - ${jobTitle}` : 'Interview'
    const details = candidateName ? `Interview with ${candidateName}` : 'Interview'
    const guestParam = candidateEmail ? `&add=${encodeURIComponent(candidateEmail)}` : ''
    const firstSlot = slots[0]

    let dateParams = ''
    if (firstSlot.date && firstSlot.time) {
      const [year, month, day] = firstSlot.date.split('-').map(Number)
      const [hours, minutes] = firstSlot.time.split(':').map(Number)
      const start = new Date(year, month - 1, day, hours, minutes, 0)
      const end = new Date(start.getTime() + 30 * 60000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const fmt = (d: Date) =>
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
      dateParams = `&dates=${fmt(start)}/${fmt(end)}`
    }

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(title)}` +
      `&details=${encodeURIComponent(details)}` +
      dateParams +
      `&location=${encodeURIComponent(interviewTypeLabel)}` +
      guestParam
    window.open(url, '_blank')
  }

  // ═══ Helper: find-or-create conversation and post a message
  const sendCandidateMessage = async (
    sessionUserId: string,
    content: string
  ) => {
    let conversationId: string | null = null
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${sessionUserId},participant_2.eq.${candidateId}),and(participant_1.eq.${candidateId},participant_2.eq.${sessionUserId})`)
      .eq('related_job_id', jobId)
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          participant_1: sessionUserId,
          participant_2: candidateId,
          participant_1_name: company,
          participant_1_role: 'employer',
          participant_1_company: company,
          participant_2_name: candidateName,
          participant_2_role: 'candidate',
          related_job_id: jobId,
          related_job_title: jobTitle,
          last_message: content,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (newConv) conversationId = newConv.id
    }

    if (conversationId) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: sessionUserId,
        sender_name: company,
        sender_role: 'employer',
        content,
        is_read: false,
      })
      if (existingConv) {
        await supabase
          .from('conversations')
          .update({ last_message: content, last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      }
    }
  }

  // ═══ Calendar-mode submit
  const handleCalendarSubmit = async () => {
    setError('')
    if (!selectedSlotObj) { setError('Please pick a date and time'); return }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('You must be logged in'); setSubmitting(false); return }
      // Multi-user: interviews/bookings are keyed employer_id = owner user_id.
      // Using the owner id is also what makes the manage_interviews RLS gate pass
      // for a capable team member (has_employer_permission is keyed on owner id).
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id

      // Enforce "one active interview per application" via the shared
      // helper rather than relying on the caller-passed existingInterviewId
      // prop alone. The prop is retained for prop-API compat (callers
      // still pass it when explicitly clicking Reschedule on a known
      // interview) but the DB lookup is now the source of truth — if
      // ANY active row exists for this application, we reuse it.
      const lookup = await findActiveInterviewSlot(applicationId)
      if (lookup.kind === 'confirmed_blocks') {
        setError(CONFIRMED_COLLISION_ERROR)
        setSubmitting(false)
        return
      }

      const calendarRowState = {
        interview_date: selectedSlotObj.date,
        interview_time: selectedSlotObj.time,
        duration_minutes: selectedSlotObj.duration,
        interview_type: interviewType,
        location_or_link: interviewType === 'video' ? (meetingLink.trim() || interviewTypeLabel) : interviewTypeLabel,
        notes: notes.trim() || null,
        status: 'scheduled',
      }

      let interviewId: string
      if (lookup.kind === 'reuse') {
        // Reuse-in-place: UPDATE the active row, do not INSERT alongside.
        const { error: updErr } = await supabase
          .from('interviews')
          .update(calendarRowState)
          .eq('id', lookup.interviewId)
        if (updErr) throw updErr
        interviewId = lookup.interviewId
      } else {
        const { data: newInterview, error: intErr } = await supabase
          .from('interviews')
          .insert({
            application_id: applicationId,
            job_id: jobId,
            employer_id: ownerId,
            candidate_id: candidateId,
            ...calendarRowState,
          })
          .select()
          .single()
        if (intErr || !newInterview) throw intErr || new Error('Interview creation failed')
        interviewId = newInterview.id
      }

      // Book via API
      const bookRes = await fetch('/api/calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          interviewId,
          employerId: ownerId,
          candidateId,
          bookedDate: selectedSlotObj.date,
          bookedTime: selectedSlotObj.time,
          duration: selectedSlotObj.duration,
          candidateEmail,
          jobTitle,
          companyName: company,
          candidateName,
        }),
      })
      const bookData = await bookRes.json()
      if (!bookRes.ok || !bookData.success) {
        throw new Error(bookData.error || 'Booking failed')
      }

      // In-app message
      const parts = formatDateParts(selectedSlotObj.date)
      const prettyTime = fmt12(selectedSlotObj.time)
      const firstName = (candidateName || '').split(' ')[0] || candidateName
      const trimmedLink = interviewType === 'video' ? meetingLink.trim() : ''
      const msgLines = [
        `Hi ${firstName}, your interview for ${jobTitle} at ${company} is confirmed.`,
        '',
        `${parts.full} at ${prettyTime} (${interviewTypeLabel})`,
        ...(trimmedLink ? ['', `Join the video call: ${trimmedLink}`] : []),
        ...(notes.trim() ? ['', notes.trim()] : []),
        '', 'See you then!', '', 'Best regards,', company,
      ]
      await sendCandidateMessage(session.user.id, msgLines.join('\n'))

      onSuccess()
      onClose()
      // Reset local state
      setSelectedDate('')
      setSelectedTime('')
      setInterviewType('in-person')
      setMeetingLink('')
      setNotes('')
    } catch (err: any) {
      console.error('Calendar booking error', err)
      setError(err.message || 'An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ═══ Manual-mode submit (UNCHANGED legacy logic)
  // ═══ Self-schedule: create interview with pending_selection status
  // and send the candidate a link to pick their own time. The CHECK
  // constraint on interviews.status only permits the 6 enum values
  // listed in the table; pending_selection is the closest semantic
  // match ("candidate hasn't picked yet") and is shared with the
  // multi-slot manual mode — both are distinguished by whether
  // proposed_slots is populated (manual) or empty (self-schedule).
  const handleSendSelfSchedule = async () => {
    setSubmitting(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      // Multi-user: key interviews to the owner id (also required for the
      // manage_interviews RLS gate to pass for a team member).
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id

      // Reuse-in-place pattern (fix #1c): never create a second active
      // interview for the same application. If one already exists in
      // pending_selection / scheduled, UPDATE it; if confirmed, surface
      // a clear error rather than overwrite. The scheduling_token of an
      // existing pending row is preserved on reuse so any prior invite
      // link the candidate has remains valid.
      const lookup = await findActiveInterviewSlot(applicationId)
      if (lookup.kind === 'confirmed_blocks') {
        setError(CONFIRMED_COLLISION_ERROR)
        setSubmitting(false)
        return
      }

      // The "fresh self-schedule invite" desired state. interview_date/
      // time are NULL because the candidate hasn't picked yet (see fix
      // #1b). proposed_slots is empty by design — self-schedule mode
      // uses the schedule-token link, not pre-proposed slots.
      const selfScheduleRowState = {
        interview_date: null,
        interview_time: null,
        duration_minutes: availableSlots[0]?.duration || 45,
        interview_type: interviewType,
        location_or_link: interviewType === 'video' ? (meetingLink.trim() || 'Video Call') : interviewType === 'in-person' ? 'In-Person' : 'Phone Call',
        notes: notes.trim() || null,
        status: 'pending_selection',
        proposed_slots: [],
      }

      let interviewIdForLink: string
      let schedulingToken: string | null

      if (lookup.kind === 'reuse') {
        const { error: updErr } = await supabase
          .from('interviews')
          .update(selfScheduleRowState)
          .eq('id', lookup.interviewId)
        if (updErr) throw updErr
        interviewIdForLink = lookup.interviewId
        schedulingToken = lookup.schedulingToken
      } else {
        const { data: newInterview, error: intErr } = await supabase
          .from('interviews')
          .insert({
            application_id: applicationId,
            job_id: jobId,
            employer_id: ownerId,
            candidate_id: candidateId,
            ...selfScheduleRowState,
          })
          .select('id, scheduling_token')
          .single()
        if (intErr || !newInterview) throw intErr || new Error('Failed to create interview')
        interviewIdForLink = newInterview.id
        schedulingToken = newInterview.scheduling_token as string | null
      }

      const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
      const scheduleLink = `${siteUrl}/interview/schedule/${schedulingToken}`

      // Notify candidate with the scheduling link — the route reads the token
      // from the interview row itself, so the link cannot be forged.
      await notify('interview_self_schedule', { applicationId, interviewId: interviewIdForLink })

      // Update application status. stage_entered_at anchors the new
      // "N days in [Stage]" badge and the "Oldest in stage" sort order.
      await supabase.from('job_applications').update({ status: 'interview', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() }).eq('id', applicationId)

      // Send email with scheduling link
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'interview_self_schedule_invite',
          data: {
            candidateName,
            companyName: company,
            jobTitle,
            scheduleLink,
          },
        }),
      }).catch(() => {})

      // Send in-app message
      await sendCandidateMessage(
        session.user.id,
        `Hi ${candidateName}, I'd like to invite you to interview for ${jobTitle || 'this role'}. Please pick a time that works for you: ${scheduleLink}`
      )

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const handleManualSubmit = async () => {
    setError('')

    const filledSlots = slots.filter(s => s.date && s.time)
    const partialSlots = slots.filter(s => (s.date && !s.time) || (!s.date && s.time))
    if (partialSlots.length > 0) {
      setError('Please fill in both date and time for each option')
      return
    }
    if (filledSlots.length === 0) {
      setError('Please enter at least one date and time option')
      return
    }

    const proposedSlots = filledSlots.map(s => ({ date: s.date, time: s.time }))
    const isMultiSlot = proposedSlots.length > 1

    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to send interview invites')
        setSubmitting(false)
        return
      }
      // Multi-user: key interviews to the owner id (also required for the
      // manage_interviews RLS gate to pass for a team member).
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id

      // Reuse-in-place pattern (fix #1c). The previous isReschedule
      // branch (mark old row 'rescheduled', then INSERT new) had a
      // momentary two-active-row window if the UPDATE failed silently
      // — and it relied on the caller passing the right
      // existingInterviewId. The active-row lookup makes this
      // automatic: if any active row exists, we UPDATE it in place;
      // we never INSERT a second active row. isReschedule is still
      // useful downstream as a UX signal (different copy in the
      // candidate notification/message), so we keep it derived from
      // the explicit caller-passed prop.
      const isReschedule = !!existingInterviewId
      const lookup = await findActiveInterviewSlot(applicationId)
      if (lookup.kind === 'confirmed_blocks') {
        setError(CONFIRMED_COLLISION_ERROR)
        setSubmitting(false)
        return
      }

      await supabase
        .from('job_applications')
        .update({ status: 'interview', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
        .eq('id', applicationId)

      // For multi-slot invitations (status 'pending_selection'), interview_date/
      // time stay NULL — the candidate hasn't picked yet. proposed_slots holds
      // the real options. For single-slot ('scheduled'), the slot IS the
      // interview time so we store it directly. See audit fix #1b: storing
      // proposedSlots[0] on a pending_selection row was a softer phantom that
      // would still surface as a "real" date in emails/notifications.
      const manualRowState = {
        interview_date: isMultiSlot ? null : proposedSlots[0].date,
        interview_time: isMultiSlot ? null : proposedSlots[0].time,
        interview_type: interviewType,
        location_or_link: interviewType === 'video' ? (meetingLink.trim() || interviewTypeLabel) : interviewTypeLabel,
        notes: notes.trim() || null,
        status: isMultiSlot ? 'pending_selection' : 'scheduled',
        proposed_slots: proposedSlots,
      }

      if (lookup.kind === 'reuse') {
        const { error: updErr } = await supabase
          .from('interviews')
          .update(manualRowState)
          .eq('id', lookup.interviewId)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase.from('interviews').insert({
          application_id: applicationId,
          job_id: jobId,
          employer_id: ownerId,
          candidate_id: candidateId,
          ...manualRowState,
        })
        if (insErr) throw insErr
      }

      const interviewDate = proposedSlots[0].date
      const interviewTime = proposedSlots[0].time
      const [year, month, day] = interviewDate.split('-').map(Number)
      const formattedDate = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })

      // The bell-notification title/message are now composed by
      // /api/notifications/notify from these same flags; only the
      // conversation message is still built here.
      let messageContent: string

      const trimmedMeetingLink = interviewType === 'video' ? meetingLink.trim() : ''

      if (isReschedule) {
        const firstName = candidateName.split(' ')[0]
        if (isMultiSlot) {
          const slotLines = proposedSlots.map((s, i) => {
            const [sy, sm, sd] = s.date.split('-').map(Number)
            const fd = new Date(sy, sm - 1, sd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            return `  Option ${i + 1}: ${fd} at ${s.time}`
          })
          messageContent = [
            `Hi ${firstName}, I wanted to let you know your interview for ${jobTitle} has been rescheduled.`,
            '',
            `Please choose one of the following times:`,
            ...slotLines,
            '',
            `Type: ${interviewTypeLabel}`,
            ...(trimmedMeetingLink ? ['', `Join the video call here: ${trimmedMeetingLink}`] : []),
            '', 'Please select a time from your Applications page.', '', 'Best regards,', company,
          ].join('\n')
        } else {
          const rescheduleLines = [
            `Hi ${firstName}, I wanted to let you know your interview for ${jobTitle} has been rescheduled.`,
            '',
            `Your new interview is on ${formattedDate} at ${interviewTime} (${interviewTypeLabel}).`,
          ]
          if (trimmedMeetingLink) {
            rescheduleLines.push('', `Join the video call here: ${trimmedMeetingLink}`)
          }
          rescheduleLines.push('', 'Please let me know if you have any questions.', '', 'Best regards,', company)
          messageContent = rescheduleLines.join('\n')
        }
      } else {
        if (isMultiSlot) {
          const slotLines = proposedSlots.map((s, i) => {
            const [sy, sm, sd] = s.date.split('-').map(Number)
            const fd = new Date(sy, sm - 1, sd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            return `  Option ${i + 1}: ${fd} at ${s.time}`
          })
          messageContent = [
            `Hello ${candidateName},`,
            '',
            `You've been invited to an interview for the ${jobTitle} position at ${company}.`,
            '',
            `Please choose one of the following times:`,
            ...slotLines,
            '',
            `Type: ${interviewTypeLabel}`,
            ...(trimmedMeetingLink ? ['', `Join the video call here: ${trimmedMeetingLink}`] : []),
            ...(notes.trim() ? ['', notes.trim()] : []),
            '', 'Please select a time from your Applications page.', '', 'Best regards,', company,
          ].join('\n')
        } else {
          const messageLines = [
            `Hello ${candidateName},`,
            '',
            `You've been invited to an interview for the ${jobTitle} position at ${company}.`,
            '',
            `Date: ${formattedDate}`,
            `Time: ${interviewTime}`,
            `Type: ${interviewTypeLabel}`,
          ]
          if (trimmedMeetingLink) {
            messageLines.push('', `Join the video call here: ${trimmedMeetingLink}`)
          }
          if (notes.trim()) {
            messageLines.push('', notes.trim())
          }
          messageLines.push('', 'Best regards,', company)
          messageContent = messageLines.join('\n')
        }
      }

      await notify('interview_scheduled', {
        applicationId,
        extra: {
          date: formattedDate,
          time: interviewTime,
          multiSlot: isMultiSlot ? 'true' : 'false',
          isReschedule: isReschedule ? 'true' : 'false',
        },
      })

      if (candidateEmail) {
        if (isReschedule) {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: candidateEmail,
              type: 'interview_rescheduled',
              data: {
                companyName: company,
                jobTitle,
                candidateName,
                date: formattedDate,
                time: interviewTime,
                interviewType: interviewTypeLabel,
                meetingLink: trimmedMeetingLink || undefined,
              },
            }),
          }).catch((err: unknown) => console.error('Error sending reschedule email:', err))
        } else {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: candidateEmail,
              type: 'interview_scheduled',
              data: {
                companyName: company,
                jobTitle,
                date: formattedDate,
                time: interviewTime,
                notes: notes.trim() || undefined,
                meetingLink: trimmedMeetingLink || undefined,
              },
            }),
          }).catch(() => {})
        }
      }

      await sendCandidateMessage(session.user.id, messageContent)

      onSuccess()

      if (slots[0].date && slots[0].time) {
        handleOpenCalendar()
      }

      onClose()
      setSlots([{ date: '', time: '' }, { date: '', time: '' }, { date: '', time: '' }])
      setInterviewType('in-person')
      setMeetingLink('')
      setNotes('')
    } catch (err) {
      console.error('Error sending interview invite:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const hasCalendarSlots = availableSlots.length > 0
  const selectedDateSlots = selectedDate ? (slotsByDate.get(selectedDate) || []) : []

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{existingInterviewId ? 'Reschedule Interview' : 'Schedule Interview'}</h2>
            <p className={styles.subtitle}>The candidate will be notified instantly by email and in-app message</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {slotsLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', gap: '0.75rem', color: '#6b7280' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid #e5e7eb',
                  borderTopColor: '#0f172a',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p style={{ fontSize: '0.9rem', margin: 0 }}>Loading availability…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {!slotsLoading && (
          <>
          {/* No availability — prominent CTA to set up */}
          {!slotsLoading && !hasCalendarSlots && mode !== 'manual' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}><Ico name="calendar" size={20} /></div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>No interview slots available</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
                {hasGcal
                  ? 'Your Google Calendar is connected but all slots are booked. Check your calendar or adjust your availability settings.'
                  : 'Set up your weekly availability so candidates can book interview slots directly from your calendar.'}
              </p>
              <a
                href={hasGcal ? '/calendar' : '/settings/availability'}
                style={{
                  display: 'inline-block', padding: '0.625rem 1.25rem', background: '#0f172a',
                  color: '#FFE500', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem',
                  textDecoration: 'none',
                }}
              >
                {hasGcal ? 'View calendar' : 'Set up availability'}
              </a>
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Or enter dates manually
                </button>
              </div>
            </div>
          )}

          {/* Mode toggle — when calendar slots are available */}
          {hasCalendarSlots && (
            <div className={styles.modeToggle} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'calendar'}
                className={`${styles.modeBtn} ${mode === 'calendar' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('calendar')}
              >
                <Ico name="calendar" size={16} /> My availability
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'manual'}
                className={`${styles.modeBtn} ${mode === 'manual' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('manual')}
              >
                <Ico name="pencil" size={16} /> Enter manually
              </button>
            </div>
          )}

          {mode === 'calendar' && hasCalendarSlots && (
            <>
              {/* Monthly calendar grid */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#64748b' }}>&#8249;</button>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{calMonthLabel}</span>
                  <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#64748b' }}>&#8250;</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', padding: '0.25rem 0' }}>{d}</div>
                  ))}
                  {calendarGrid.map((cell, i) => {
                    if (!cell) return <div key={`blank-${i}`} />
                    const isSelected = cell.date === selectedDate
                    const disabled = !cell.hasSlots || cell.isPast
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        disabled={disabled}
                        onClick={() => { if (!disabled) { setSelectedDate(cell.date); setSelectedTime('') } }}
                        style={{
                          padding: '0.5rem 0',
                          fontSize: '0.82rem',
                          minHeight: 44,
                          fontWeight: isSelected ? 700 : cell.isToday ? 600 : 400,
                          background: isSelected ? '#0f172a' : 'transparent',
                          color: isSelected ? '#FFE500' : disabled ? '#d1d5db' : cell.hasSlots ? '#0f172a' : '#94a3b8',
                          border: cell.isToday && !isSelected ? '1px solid #0f172a' : '1px solid transparent',
                          borderRadius: 6,
                          cursor: disabled ? 'default' : 'pointer',
                          transition: 'background 0.15s, color 0.15s',
                          position: 'relative',
                        }}
                      >
                        {cell.day}
                        {cell.hasSlots && !isSelected && (
                          <span style={{ display: 'block', width: 4, height: 4, borderRadius: '50%', background: '#16a34a', margin: '2px auto 0' }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Time slots for selected date */}
              {selectedDate && (
                <>
                  <h3 className={styles.selectedDateHeading}>
                    {formatDateParts(selectedDate).full}
                  </h3>
                  {selectedDateSlots.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>No available slots on this date</p>
                  ) : (
                  <div className={styles.timeGrid}>
                    {selectedDateSlots.map(s => {
                      const active = s.time === selectedTime
                      return (
                        <button
                          key={s.time}
                          type="button"
                          className={`${styles.timeBtn} ${active ? styles.timeBtnActive : ''}`}
                          onClick={() => {
                            setSelectedTime(s.time)
                            checkConflict(s.date, s.time)
                          }}
                        >
                          {fmt12(s.time)}
                        </button>
                      )
                    })}
                  </div>
                  )}
                </>
              )}

              {selectedSlotObj && (
                <div className={styles.confirmBanner}>
                  ✓ {formatDateParts(selectedSlotObj.date).full} at {fmt12(selectedSlotObj.time)} · {selectedSlotObj.duration} min
                </div>
              )}
            </>
          )}

          {mode === 'manual' && (
            <div className={styles.slotsSection}>
              {!hasCalendarSlots && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.625rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#92400e' }}>
                  Manual entry — dates won&apos;t sync with your availability calendar.{' '}
                  <a href={hasGcal ? '/calendar' : '/settings/availability'} style={{ color: '#92400e', fontWeight: 600 }}>
                    {hasGcal ? 'View calendar' : 'Set up availability'}
                  </a>
                </div>
              )}
              <p className={styles.slotsLabel}>Propose up to 3 date and time options</p>
              {slots.map((slot, i) => (
                <div key={i} className={styles.slotRow}>
                  <span className={styles.slotNum}>Option {i + 1}{i > 0 ? ' (optional)' : ''}</span>
                  <input
                    type="date"
                    value={slot.date}
                    onChange={(e) => {
                      const next = [...slots]
                      next[i] = { ...next[i], date: e.target.value }
                      setSlots(next)
                      if (i === 0) checkConflict(e.target.value, slot.time)
                    }}
                    className={styles.slotInput}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => {
                      const next = [...slots]
                      next[i] = { ...next[i], time: e.target.value }
                      setSlots(next)
                      if (i === 0) checkConflict(slot.date, e.target.value)
                    }}
                    className={styles.slotInput}
                  />
                </div>
              ))}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Interview Type</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {INTERVIEW_TYPES.map(t => {
                const active = interviewType === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setInterviewType(t.value)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: 999,
                      border: `1px solid ${active ? '#0f172a' : '#d1d5db'}`,
                      background: active ? '#0f172a' : 'white',
                      color: active ? '#FFE500' : '#374151',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {interviewType === 'video' && (
            <div className={styles.field}>
              <label htmlFor="meetingLink" className={styles.fieldLabel}>
                Meeting link <span className={styles.optional}>(Optional)</span>
              </label>
              <input
                type="url"
                id="meetingLink"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="Paste your Google Meet link here (e.g. https://meet.google.com/xxx-xxxx-xxx)"
                className={styles.input}
              />
              <p className={styles.helperText}>
                Create your Google Calendar event first — it will automatically generate a Meet link. Copy and paste it here.
              </p>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="notes" className={styles.fieldLabel}>
              Additional Notes <span className={styles.optional}>(Optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information for the candidate..."
              rows={3}
              className={styles.textarea}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {conflictWarning && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#856404', marginBottom: '0.75rem' }}>
              {conflictWarning}
            </div>
          )}

          {/* Let candidate choose toggle — only in calendar mode for new interviews */}
          {mode === 'calendar' && hasCalendarSlots && !existingInterviewId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}>
              <input
                type="checkbox"
                checked={letCandidatePick}
                onChange={e => setLetCandidatePick(e.target.checked)}
                style={{ accentColor: '#16a34a' }}
              />
              Let candidate choose their own time
            </label>
          )}

          <button
            type="button"
            onClick={letCandidatePick ? handleSendSelfSchedule : (mode === 'calendar' ? handleCalendarSubmit : handleManualSubmit)}
            className={styles.sendBtn}
            disabled={submitting}
          >
            {submitting
              ? 'Sending...'
              : letCandidatePick
              ? 'Send Scheduling Link'
              : (mode === 'calendar' ? 'Confirm Booking' : 'Send Interview Invite')}
          </button>

          {mode === 'manual' && (
            <button
              type="button"
              onClick={handleOpenCalendar}
              className={styles.calendarLink}
              disabled={submitting}
            >
              + Add to Google Calendar (optional)
            </button>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
