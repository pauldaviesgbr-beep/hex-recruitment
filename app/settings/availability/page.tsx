'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { employerLoginPath } from '@/lib/loginRedirect'
import DatePicker from '@/components/DatePicker'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

const DAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
]

const DURATIONS = [30, 45, 60, 90]

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 19; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    out.push(`${String(h).padStart(2, '0')}:30`)
  }
  out.push('20:00')
  return out
})()

type WeeklyRow = { enabled: boolean; start: string; end: string }
type Override = { id?: string; override_date: string; reason: string | null; block_group_id: string | null }
type BlockEntry =
  | { kind: 'single'; id: string; date: string; reason: string | null }
  | { kind: 'range'; groupId: string; from: string; to: string; count: number; reason: string | null; ids: string[] }

const DEFAULT_WEEKLY: WeeklyRow[] = DAYS.map((_, i) => ({
  enabled: i <= 4, // Mon–Fri on by default
  start: '09:00',
  end: '17:00',
}))

function AvailabilitySettingsContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [duration, setDuration] = useState<number>(60)
  const [bufferMinutes, setBufferMinutes] = useState<number>(0)
  const [minNoticeHours, setMinNoticeHours] = useState<number>(24)
  const [maxAdvanceDays, setMaxAdvanceDays] = useState<number>(28)
  const [weekly, setWeekly] = useState<WeeklyRow[]>(DEFAULT_WEEKLY)
  const [overrides, setOverrides] = useState<Override[]>([])
  const [newBlockRange, setNewBlockRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [newBlockReason, setNewBlockReason] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)
  const searchParams = useSearchParams()

  const loadAll = useCallback(async (uid: string) => {
    // weekly
    const { data: weeklyRows } = await supabase
      .from('employer_availability')
      .select('*')
      .eq('employer_id', uid)
      .order('day_of_week')

    if (weeklyRows && weeklyRows.length) {
      const next: WeeklyRow[] = DAYS.map((_, idx) => {
        const row = weeklyRows.find(r => r.day_of_week === idx)
        if (row) {
          return {
            enabled: !!row.is_active,
            start: String(row.slot_start).slice(0, 5),
            end: String(row.slot_end).slice(0, 5),
          }
        }
        return { enabled: false, start: '09:00', end: '17:00' }
      })
      setWeekly(next)
      const first = weeklyRows[0]
      if (first?.duration_minutes) setDuration(first.duration_minutes)
      if (typeof first?.buffer_minutes === 'number') setBufferMinutes(first.buffer_minutes)
      if (typeof first?.min_notice_hours === 'number') setMinNoticeHours(first.min_notice_hours)
      if (typeof first?.max_advance_days === 'number') setMaxAdvanceDays(first.max_advance_days)
    }

    // overrides
    const today = new Date().toISOString().slice(0, 10)
    const { data: ov } = await supabase
      .from('employer_availability_overrides')
      .select('id, override_date, reason, is_blocked, block_group_id')
      .eq('employer_id', uid)
      .eq('is_blocked', true)
      .gte('override_date', today)
      .order('override_date')
    setOverrides((ov || []).map(o => ({
      id: o.id,
      override_date: o.override_date,
      reason: o.reason,
      block_group_id: o.block_group_id ?? null,
    })))

    // ICS feed token + Google Calendar connection status
    const { data: profile } = await supabase
      .from('employer_profiles')
      .select('ics_feed_token, gcal_calendar_id')
      .eq('user_id', uid)
      .maybeSingle()
    if (profile?.ics_feed_token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      setFeedUrl(`${siteUrl}/api/calendar/feed/${profile.ics_feed_token}.ics`)
    }
    setGcalConnected(Boolean(profile?.gcal_calendar_id))
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push(employerLoginPath()); return }
      if (session.user.user_metadata?.role !== 'employer') { router.push('/login/employer'); return }
      // Multi-user: availability is keyed employer_id = owner user_id; scope
      // every read/write on this page to the owner of the active employer.
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      setUserId(ownerId)
      await loadAll(ownerId)
      setLoading(false)
    }
    init()
  }, [router, loadAll])

  // Surface Google Calendar connection result from ?gcal= query param
  useEffect(() => {
    const gcal = searchParams.get('gcal')
    if (!gcal) return
    if (gcal === 'connected') {
      setMessage({ type: 'success', text: 'Google Calendar connected — interviews will sync automatically.' })
    } else if (gcal === 'error') {
      const reason = searchParams.get('reason') || 'unknown'
      setMessage({ type: 'error', text: `Couldn't connect Google Calendar (${reason}). Please try again.` })
    }
  }, [searchParams])

  const handleConnectGcal = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'Please sign in again to connect Google Calendar.' })
      return
    }
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.authUrl) {
        setMessage({ type: 'error', text: data?.error || 'Failed to start Google Calendar connection' })
        return
      }
      window.location.href = data.authUrl
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to start Google Calendar connection' })
    }
  }

  const handleDisconnectGcal = async () => {
    if (!userId) return
    if (!confirm('Disconnect Google Calendar? Future interviews will no longer sync to your Google Calendar.')) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/auth/google/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage({ type: 'error', text: data?.error || 'Failed to disconnect Google Calendar' })
      return
    }
    setGcalConnected(false)
    setMessage({ type: 'success', text: 'Google Calendar disconnected.' })
  }

  const toggleDay = (idx: number) => {
    setWeekly(prev => prev.map((w, i) => i === idx ? { ...w, enabled: !w.enabled } : w))
  }
  const updateDay = (idx: number, key: 'start' | 'end', val: string) => {
    setWeekly(prev => prev.map((w, i) => i === idx ? { ...w, [key]: val } : w))
  }

  // Enumerate every YYYY-MM-DD between start and end inclusive. Anchored
  // at noon UTC so day-stepping is DST-safe; we only ever care about the
  // date portion.
  const enumerateDates = (start: string, end: string): string[] => {
    const cursor = new Date(`${start}T12:00:00Z`)
    const stop = new Date(`${end}T12:00:00Z`)
    const out: string[] = []
    while (cursor <= stop) {
      const y = cursor.getUTCFullYear()
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0')
      const d = String(cursor.getUTCDate()).padStart(2, '0')
      out.push(`${y}-${m}-${d}`)
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return out
  }

  // Look up existing scheduled/confirmed interviews inside [from, to] so
  // we can warn the employer before blocking days that already have
  // commitments. Returns [] if nothing's affected.
  const findInterviewsInRange = async (from: string, to: string) => {
    if (!userId) return []
    const { data, error } = await supabase
      .from('interviews')
      .select('id, candidate_id, interview_date, interview_time, status')
      .eq('employer_id', userId)
      .in('status', ['scheduled', 'confirmed', 'pending_selection'])
      .gte('interview_date', from)
      .lte('interview_date', to)
      .order('interview_date')
      .order('interview_time')
    if (error || !data || data.length === 0) return []
    // Pull candidate names so the warning lists "Ashvin Patel — Wed 20 May 11:30am"
    // rather than uuids. Cheap second round-trip; the list is tiny.
    const candidateIds = Array.from(new Set(data.map(d => d.candidate_id).filter(Boolean)))
    const nameById = new Map<string, string>()
    if (candidateIds.length > 0) {
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name')
        .in('user_id', candidateIds)
      for (const p of profiles || []) {
        if (p.full_name) nameById.set(p.user_id, p.full_name)
      }
    }
    return data.map(iv => ({
      candidateName: nameById.get(iv.candidate_id) || 'Candidate',
      date: iv.interview_date as string,
      time: String(iv.interview_time).slice(0, 5),
    }))
  }

  const formatConflictLine = (c: { candidateName: string; date: string; time: string }) => {
    const dateLabel = new Date(c.date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    const [hStr, mStr] = c.time.split(':')
    let h = Number(hStr); const m = Number(mStr)
    const ap = h >= 12 ? 'pm' : 'am'
    h = h % 12 || 12
    const timeLabel = `${h}:${String(m).padStart(2, '0')}${ap}`
    return `• ${c.candidateName} — ${dateLabel} ${timeLabel}`
  }

  const handleAddBlocked = async () => {
    if (!userId || !newBlockRange.from) return
    const reason = newBlockReason.trim() || null
    const isRange = !!newBlockRange.to && newBlockRange.to !== newBlockRange.from

    // Conflict check — if the user is about to block dates that already
    // contain a scheduled/confirmed interview, confirm before proceeding.
    // We don't auto-cancel anything (matches Calendly behaviour); the
    // existing interview row stays and the employer can decide whether
    // to reschedule it manually. This is preventative — surfacing the
    // information at the moment of decision, not after the fact when
    // they happen to look at the calendar.
    const rangeFrom = newBlockRange.from
    const rangeTo = isRange ? newBlockRange.to : newBlockRange.from
    const conflicts = await findInterviewsInRange(rangeFrom, rangeTo)
    if (conflicts.length > 0) {
      const lines = conflicts.map(formatConflictLine).join('\n')
      const heading = conflicts.length === 1
        ? 'This blocks a date that already has 1 interview:'
        : `This blocks dates that already have ${conflicts.length} interviews:`
      const proceed = window.confirm(
        `${heading}\n\n${lines}\n\nExisting interviews stay scheduled — block anyway?`
      )
      if (!proceed) return
    }

    if (!isRange) {
      // Solo single-day block — block_group_id stays NULL so it never
      // groups with anything else in the list.
      const { data, error } = await supabase
        .from('employer_availability_overrides')
        .insert({
          employer_id: userId,
          override_date: newBlockRange.from,
          is_blocked: true,
          reason,
        })
        .select()
        .single()
      if (error) { setMessage({ type: 'error', text: error.message }); return }
      setOverrides(prev => [...prev, {
        id: data.id,
        override_date: data.override_date,
        reason: data.reason,
        block_group_id: null,
      }].sort((a, b) => a.override_date.localeCompare(b.override_date)))
      setNewBlockRange({ from: '', to: '' })
      setNewBlockReason('')
      setTimeout(() => {
        document.getElementById(`blocked-entry-${data.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }

    // Range — enumerate dates, generate one shared block_group_id, insert
    // one row per date in a single round-trip.
    const dates = enumerateDates(newBlockRange.from, newBlockRange.to)
    if (dates.length > 365) {
      setMessage({ type: 'error', text: 'Range is longer than a year — please block in smaller chunks.' })
      return
    }
    const groupId = crypto.randomUUID()
    const rows = dates.map(d => ({
      employer_id: userId,
      override_date: d,
      is_blocked: true,
      reason,
      block_group_id: groupId,
    }))
    const { data, error } = await supabase
      .from('employer_availability_overrides')
      .insert(rows)
      .select()
    if (error) { setMessage({ type: 'error', text: error.message }); return }
    setOverrides(prev => [
      ...prev,
      ...(data || []).map(o => ({
        id: o.id,
        override_date: o.override_date,
        reason: o.reason,
        block_group_id: o.block_group_id ?? null,
      })),
    ].sort((a, b) => a.override_date.localeCompare(b.override_date)))
    setNewBlockRange({ from: '', to: '' })
    setNewBlockReason('')
    setMessage({ type: 'success', text: `Blocked ${dates.length} dates.` })
    setTimeout(() => {
      document.getElementById(`blocked-entry-${groupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  // Group consecutive overrides sharing a block_group_id into one entry.
  // NULL block_group_id is treated as solo and never grouped — explicit
  // per the data-layer plan.
  const blockedEntries = useMemo<BlockEntry[]>(() => {
    const groups = new Map<string, Override[]>()
    const solos: BlockEntry[] = []
    for (const o of overrides) {
      if (!o.block_group_id) {
        solos.push({ kind: 'single', id: o.id!, date: o.override_date, reason: o.reason })
        continue
      }
      const bucket = groups.get(o.block_group_id) || []
      bucket.push(o)
      groups.set(o.block_group_id, bucket)
    }
    const ranges: BlockEntry[] = []
    Array.from(groups.entries()).forEach(([groupId, rows]) => {
      const sorted = rows.slice().sort((a: Override, b: Override) => a.override_date.localeCompare(b.override_date))
      ranges.push({
        kind: 'range',
        groupId,
        from: sorted[0].override_date,
        to: sorted[sorted.length - 1].override_date,
        count: sorted.length,
        reason: sorted[0].reason,
        ids: sorted.map((r: Override) => r.id!).filter(Boolean),
      })
    })
    return [...solos, ...ranges].sort((a, b) => {
      const aStart = a.kind === 'single' ? a.date : a.from
      const bStart = b.kind === 'single' ? b.date : b.from
      return aStart.localeCompare(bStart)
    })
  }, [overrides])

  const handleRemoveEntry = async (entry: BlockEntry) => {
    if (entry.kind === 'single') {
      const { error } = await supabase
        .from('employer_availability_overrides')
        .delete()
        .eq('id', entry.id)
      if (error) { setMessage({ type: 'error', text: error.message }); return }
      setOverrides(prev => prev.filter(o => o.id !== entry.id))
    } else {
      // Range — delete every row sharing the block_group_id in one query.
      const { error } = await supabase
        .from('employer_availability_overrides')
        .delete()
        .eq('block_group_id', entry.groupId)
      if (error) { setMessage({ type: 'error', text: error.message }); return }
      setOverrides(prev => prev.filter(o => o.block_group_id !== entry.groupId))
    }
  }

  const handleCopyFeed = async () => {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleRegenerate = async () => {
    if (!userId) return
    if (!confirm('Regenerate your calendar feed URL? Any existing subscriptions using the old URL will stop receiving updates.')) return
    const res = await fetch('/api/calendar/regenerate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    if (data.feedUrl) {
      setFeedUrl(data.feedUrl)
      setMessage({ type: 'success', text: 'Feed URL regenerated' })
    } else {
      setMessage({ type: 'error', text: data.error || 'Failed to regenerate' })
    }
  }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    setMessage(null)
    try {
      // Validate enabled rows
      for (let i = 0; i < weekly.length; i++) {
        const w = weekly[i]
        if (w.enabled && w.start >= w.end) {
          setMessage({ type: 'error', text: `${DAYS[i].label}: start time must be before end time` })
          setSaving(false)
          return
        }
      }

      // Delete all existing weekly rows for this employer
      const { error: delErr } = await supabase
        .from('employer_availability')
        .delete()
        .eq('employer_id', userId)
      if (delErr) throw delErr

      // Re-insert all 7 days (with is_active flag for each) so the load
      // function always finds rows for every day and can correctly display
      // which are toggled on/off. Previously only active days were saved,
      // which meant disabled days had no row — causing them to show as
      // disabled but losing their start/end times if re-enabled later.
      const rows = weekly.map((w, i) => ({
        employer_id: userId,
        day_of_week: i,
        slot_start: `${w.start}:00`,
        slot_end: `${w.end}:00`,
        duration_minutes: duration,
        buffer_minutes: bufferMinutes,
        min_notice_hours: minNoticeHours,
        max_advance_days: maxAdvanceDays,
        is_active: w.enabled,
      }))

      const { error: insErr } = await supabase.from('employer_availability').insert(rows)
      if (insErr) throw insErr

      setMessage({ type: 'success', text: 'Availability saved successfully!' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner} />
            <p>Loading availability…</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Settings
        </button>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings" className={styles.breadcrumbLink}>Settings</Link>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>Interview Availability</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}><Ico name="calendar" size={20} /></div>
          <div>
            <h1 className={styles.title}>Interview Availability</h1>
            <p className={styles.subtitle}>Set your available days and hours for candidate interview bookings</p>
          </div>
        </div>

        {message && (
          <div
            className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}
            role="alert"
            aria-live="polite"
          >
            {message.type === 'success' ? <>✓ </> : <><Ico name="alert-triangle" size={16} /> </>}{message.text}
          </div>
        )}

        <div className={styles.form}>
          {/* Duration */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Interview duration</h2>
            <p className={styles.sectionDescription}>How long is each interview slot?</p>
            <div className={styles.pillRow}>
              {DURATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`${styles.pill} ${duration === d ? styles.pillActive : ''}`}
                >
                  {d} minutes
                </button>
              ))}
            </div>
          </div>

          {/* Scheduling rules */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Scheduling rules</h2>

            <div style={{ marginBottom: '1.25rem' }}>
              <p className={styles.sectionDescription} style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#0f172a' }}>Buffer between interviews</strong>
                <br />Breathing room between consecutive interviews
              </p>
              <div className={styles.pillRow}>
                {[
                  { v: 0, label: 'None' },
                  { v: 15, label: '15 min' },
                  { v: 30, label: '30 min' },
                  { v: 45, label: '45 min' },
                  { v: 60, label: '60 min' },
                ].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setBufferMinutes(o.v)}
                    className={`${styles.pill} ${bufferMinutes === o.v ? styles.pillActive : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <p className={styles.sectionDescription} style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#0f172a' }}>Minimum notice</strong>
                <br />How far in advance candidates must book
              </p>
              <div className={styles.pillRow}>
                {[
                  { v: 1, label: '1 hour' },
                  { v: 2, label: '2 hours' },
                  { v: 4, label: '4 hours' },
                  { v: 24, label: '24 hours' },
                  { v: 48, label: '48 hours' },
                ].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setMinNoticeHours(o.v)}
                    className={`${styles.pill} ${minNoticeHours === o.v ? styles.pillActive : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={styles.sectionDescription} style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#0f172a' }}>Maximum advance booking</strong>
                <br />How far ahead candidates can book
              </p>
              <div className={styles.pillRow}>
                {[
                  { v: 7, label: '1 week' },
                  { v: 14, label: '2 weeks' },
                  { v: 21, label: '3 weeks' },
                  { v: 28, label: '4 weeks' },
                ].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setMaxAdvanceDays(o.v)}
                    className={`${styles.pill} ${maxAdvanceDays === o.v ? styles.pillActive : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Weekly availability */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Weekly availability</h2>
            <p className={styles.sectionDescription}>Turn on days you&apos;re available and pick a window.</p>
            {DAYS.map((day, idx) => {
              const row = weekly[idx]
              const parseHm = (t: string) => {
                const [h, m] = t.split(':').map(Number)
                return h * 60 + m
              }
              const fmt12 = (hm: string) => {
                const [hStr, mStr] = hm.split(':')
                let h = Number(hStr); const m = Number(mStr)
                const ap = h >= 12 ? 'pm' : 'am'
                h = h % 12 || 12
                return `${h}:${String(m).padStart(2, '0')}${ap}`
              }
              let hint: { text: string; warn: boolean } | null = null
              if (row.enabled) {
                const s = parseHm(row.start)
                const e = parseHm(row.end)
                if (e - s >= duration) {
                  const count = Math.floor((e - s) / duration)
                  const lastStart = s + (count - 1) * duration
                  const lastEnd = lastStart + duration
                  const toHm = (mins: number) =>
                    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
                  hint = {
                    text: `${fmt12(row.start)} – ${fmt12(toHm(lastEnd))} · ${count} slot${count === 1 ? '' : 's'} per day`,
                    warn: false,
                  }
                } else {
                  hint = { text: 'No slots fit this range with the selected duration', warn: true }
                }
              }
              return (
                <div key={day.value}>
                <div className={styles.dayRow}>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={() => toggleDay(idx)}
                      aria-label={`Toggle ${day.label}`}
                    />
                    <span className={styles.slider} />
                  </label>
                  <span className={styles.dayLabel}>{day.label}</span>
                  <select
                    value={row.start}
                    disabled={!row.enabled}
                    onChange={(e) => updateDay(idx, 'start', e.target.value)}
                    className={styles.timeSelect}
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    value={row.end}
                    disabled={!row.enabled}
                    onChange={(e) => updateDay(idx, 'end', e.target.value)}
                    className={styles.timeSelect}
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {hint && (
                  <div
                    style={{
                      marginLeft: 60,
                      fontSize: '0.78rem',
                      color: hint.warn ? '#92400e' : '#6b7280',
                      padding: hint.warn ? '0.3rem 0.5rem' : '0 0 0.4rem 0',
                      background: hint.warn ? '#fef3c7' : 'transparent',
                      border: hint.warn ? '1px solid #fde68a' : 'none',
                      borderRadius: hint.warn ? 6 : 0,
                      marginBottom: hint.warn ? '0.5rem' : 0,
                    }}
                  >
                    {hint.text}
                  </div>
                )}
                </div>
              )
            })}
          </div>

          {/* Blocked dates */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Blocked dates</h2>
            <p className={styles.sectionDescription}>Block out holidays or other days you&apos;re unavailable.</p>
            {blockedEntries.length > 0 && (
              <div className={styles.blockedList}>
                {blockedEntries.map(entry => {
                  const entryKey = entry.kind === 'single' ? entry.id : entry.groupId
                  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                  })
                  const fmtRangeEnd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                  const displayLabel = entry.kind === 'single'
                    ? fmtDate(entry.date)
                    : `${fmtRangeEnd(entry.from)} – ${fmtRangeEnd(entry.to)}`
                  return (
                    <div key={entryKey} id={`blocked-entry-${entryKey}`} className={styles.blockedRow}>
                      <span className={styles.blockedDate}>{displayLabel}</span>
                      <span className={styles.blockedReason}>{entry.reason || 'Blocked'}</span>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => handleRemoveEntry(entry)}
                        aria-label={entry.kind === 'single' ? 'Remove this blocked date' : `Remove this blocked range (${entry.count} days)`}
                        title="Remove"
                      >
                        <span aria-hidden="true" className={styles.removeIcon}>✕</span>
                        <span className={styles.removeLabel}>Remove</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className={styles.addRow}>
              <div className={styles.addDateWrap}>
                <DatePicker
                  mode="range"
                  value={newBlockRange}
                  onChange={setNewBlockRange}
                  id="new-block-date"
                  placeholder="Select date(s)"
                />
              </div>
              <input
                type="text"
                value={newBlockReason}
                onChange={(e) => setNewBlockReason(e.target.value)}
                placeholder="Reason (optional)"
                className={styles.addInput}
              />
              <button
                type="button"
                onClick={handleAddBlocked}
                disabled={!newBlockRange.from}
                className={styles.blockBtn}
              >
                {newBlockRange.to && newBlockRange.to !== newBlockRange.from ? 'Block range' : 'Block date'}
              </button>
            </div>
            <p className={styles.addHint}>
              Tap one day to block a single date, or tap a start day then an end day to block a whole range.
            </p>
          </div>

          {/* Google Calendar two-way sync */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Google Calendar</h2>
            {gcalConnected ? (
              <>
                <p className={styles.sectionDescription}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Connected</span> — Interviews are syncing automatically.
                </p>
                <button
                  type="button"
                  onClick={handleDisconnectGcal}
                  className={styles.regenBtn}
                >
                  Disconnect Google Calendar
                </button>
              </>
            ) : (
              <>
                <p className={styles.sectionDescription}>
                  Interviews will automatically appear in your Google Calendar when booked.
                </p>
                <button
                  type="button"
                  onClick={handleConnectGcal}
                  className={styles.blockBtn}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Ico name="calendar" size={16} /> Connect Google Calendar
                </button>
              </>
            )}
          </div>

          {/* Calendar feed */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Sync interviews to your own calendar</h2>
            <p className={styles.sectionDescription}>
              This is a private URL that any calendar app can subscribe to.
              Interviews booked through Thrive show up automatically; your
              calendar app re-syncs every few hours.
            </p>
            <div className={styles.feedRow}>
              <input
                type="text"
                readOnly
                value={feedUrl}
                className={styles.feedInput}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                aria-label="Calendar subscription URL"
              />
              <button type="button" onClick={handleCopyFeed} className={styles.copyBtn}>
                {copied ? 'Copied' : 'Copy URL'}
              </button>
            </div>

            <div className={styles.feedSteps}>
              <p className={styles.feedStepsIntro}>
                Pick your calendar app and follow the steps below:
              </p>

              {/* Hide the redundant Google "Add by URL" (ICS) option when the
                  employer already has the real Google OAuth two-way sync — the
                  same gcalConnected flag that drives the "Connected" banner.
                  Kept (not deleted) so a not-yet-connected employer still sees it. */}
              {!gcalConnected && (
              <details className={styles.feedDetails} open>
                <summary className={styles.feedSummary}>
                  <span className={styles.feedSummaryIcon} aria-hidden="true"><Ico name="calendar" size={20} /></span>
                  Google Calendar
                </summary>
                <ol className={styles.feedSteplist}>
                  <li>Tap <strong>Copy URL</strong> above.</li>
                  <li>
                    Open{' '}
                    <a
                      href="https://calendar.google.com/calendar/r/settings/addbyurl"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.feedLink}
                    >
                      Google Calendar → Add by URL
                    </a>{' '}
                    (you may need to sign in).
                  </li>
                  <li>Paste the URL into the box and click <strong>Add calendar</strong>.</li>
                </ol>
                <a
                  href="https://calendar.google.com/calendar/r/settings/addbyurl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.feedCta}
                >
                  Open Google Calendar →
                </a>
              </details>
              )}

              <details className={styles.feedDetails}>
                <summary className={styles.feedSummary}>
                  <span className={styles.feedSummaryIcon} aria-hidden="true"><Ico name="apple" size={20} /></span>
                  Apple Calendar (Mac / iPhone / iPad)
                </summary>
                <ol className={styles.feedSteplist}>
                  <li>
                    On Mac, Calendar → <em>File → New Calendar Subscription…</em>{' '}
                    and paste the URL above.
                  </li>
                  <li>
                    On iPhone / iPad, Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, then paste the URL.
                  </li>
                  <li>
                    Or use the one-tap link below — your Calendar app will open with the subscription dialog pre-filled.
                  </li>
                </ol>
                {feedUrl && (
                  <a
                    href={feedUrl.replace(/^https?:\/\//, 'webcal://')}
                    className={styles.feedCta}
                  >
                    Add to Apple Calendar →
                  </a>
                )}
              </details>

              <details className={styles.feedDetails}>
                <summary className={styles.feedSummary}>
                  <span className={styles.feedSummaryIcon} aria-hidden="true"><Ico name="mail" size={20} /></span>
                  Outlook
                </summary>
                <ol className={styles.feedSteplist}>
                  <li>Tap <strong>Copy URL</strong> above.</li>
                  <li>
                    Open{' '}
                    <a
                      href="https://outlook.live.com/calendar/0/addcalendar"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.feedLink}
                    >
                      Outlook → Add calendar
                    </a>
                    , then choose <strong>Subscribe from web</strong>.
                  </li>
                  <li>Paste the URL, give it a name, and click <strong>Import</strong>.</li>
                </ol>
                <a
                  href="https://outlook.live.com/calendar/0/addcalendar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.feedCta}
                >
                  Open Outlook →
                </a>
              </details>
            </div>

            <button type="button" onClick={handleRegenerate} className={styles.regenBtn}>
              Regenerate URL
            </button>
            <p className={styles.feedRegenNote}>
              Regenerating invalidates the old URL. Any calendar still
              subscribed to the old one will stop receiving updates.
            </p>
          </div>

          <div className={styles.actions}>
            <Link href="/settings" className={styles.cancelBtn}>Cancel</Link>
            <button
              type="button"
              onClick={handleSave}
              className={styles.saveBtn}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function AvailabilitySettingsPage() {
  return (
    <Suspense fallback={<main><Header /><div style={{ padding: '2rem' }}>Loading…</div></main>}>
      <AvailabilitySettingsContent />
    </Suspense>
  )
}
