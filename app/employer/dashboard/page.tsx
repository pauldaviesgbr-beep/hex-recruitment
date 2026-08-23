'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import ExampleShowcase from '@/components/onboarding/ExampleShowcase'
import EmployerTour from '@/components/onboarding/EmployerTour'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import Header from '@/components/Header'
import { supabaseJobToJob } from '@/lib/types'
import { STAGE_COLORS, STAGE_LABELS, stageForStatus } from '@/lib/constants/pipelineStages'
import AnswerLine from '@/components/AnswerLine'
import SetupStrip from '@/components/SetupStrip'
// nothingLiveShort is the panel register of the sentence the answer line's row
// 5b says in full at the top of this page. One root string, two lengths.
import { employerAnswerLine, justPostedAnswerLine, nothingLiveShort } from '@/lib/answerLine'
import { readJustPosted, type JustPosted } from '@/lib/justPosted'
import PipelineRows from '@/components/PipelineRows'
// The same function StageDurationBadge uses, so "waiting 4d" on a phone and
// "4 days in Shortlisted" on desktop can never disagree.
import { daysInStage } from '@/lib/stageDuration'
import StageDurationBadge from '@/components/StageDurationBadge'
import JobCardLink from '@/components/JobCardLink'
import CandidateCard from '@/components/CandidateCard'
import type { Candidate } from '@/lib/mockCandidates'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatDate(): { day: string; full: string } {
  const now = new Date()
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const full = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return { day, full }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

const PIPELINE_STAGES = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

function getStatusStyle(status: string): string {
  if (status === 'pending') return 'statusPending'
  if (status === 'reviewing' || status === 'shortlisted') return 'statusReviewing'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'statusInterview'
  if (status === 'rejected') return 'statusRejected'
  return 'statusPending'
}



// ── Skeleton placeholder ────────────────────────────────
function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className={`${styles.skeleton} ${styles.skeletonCard}`} style={{ height }} />
}

// ═════════════════════════════════════════════════════════
// ── Pipeline touch slider (non-passive touch listeners) ──
function PipelineSlider({ stages, stageColors, statusCounts, candidatesByStage, styles }: {
  stages: readonly string[]
  stageColors: Record<string, string>
  statusCounts: Record<string, number>
  candidatesByStage: Record<string, any[]>
  styles: Record<string, string>
}) {
  const router = useRouter()
  const CARD_W = 163
  const VISIBLE = 2.2
  const maxOffset = Math.max(0, (stages.length - VISIBLE) * CARD_W)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ offset: 0, startX: 0, startY: 0, startOffset: 0, lastX: 0, lastT: 0, vel: 0, isHoriz: null as boolean | null, didMove: false, rafId: 0 })

  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v))
  const setTransform = (x: number) => { if (trackRef.current) trackRef.current.style.transform = `translateX(-${x}px)` }
  const snapTo = (target: number) => {
    const snapped = clamp(Math.round(target / CARD_W) * CARD_W)
    let cur = state.current.offset
    const step = () => {
      cur += (snapped - cur) * 0.12
      if (Math.abs(snapped - cur) < 0.5) { state.current.offset = snapped; setTransform(snapped); return }
      state.current.offset = cur; setTransform(cur)
      state.current.rafId = requestAnimationFrame(step)
    }
    state.current.rafId = requestAnimationFrame(step)
  }

  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.rafId)
      s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY
      s.startOffset = s.offset; s.lastX = s.startX; s.lastT = Date.now()
      s.vel = 0; s.isHoriz = null; s.didMove = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX
      const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2
      }
      if (!s.isHoriz) return
      e.preventDefault()
      s.didMove = true
      const now = Date.now(); const dt = now - s.lastT
      if (dt > 0) s.vel = (s.lastX - e.touches[0].clientX) / dt
      s.lastX = e.touches[0].clientX; s.lastT = now
      s.offset = clamp(s.startOffset + dx); setTransform(s.offset)
    }
    const onEnd = (e: TouchEvent) => {
      if (!s.isHoriz) return
      if (!s.didMove || Math.abs(s.startX - e.changedTouches[0].clientX) < 8) {
        const idx = Math.round(s.offset / CARD_W)
        const stage = stages[idx]
        if (stage) router.push(`/my-jobs?filter=${stage === 'interview' ? 'interviewing' : stage === 'offered' ? 'offers' : stage}`)
        return
      }
      snapTo(s.offset + s.vel * 350)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [maxOffset, stages, router])

  return (
    <div style={{ overflow: 'hidden', margin: '0 -1rem', padding: '0 1rem' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: '0.5rem', willChange: 'transform' }}>
        {stages.map(s => {
          const count = statusCounts[s] || 0
          const candidates = candidatesByStage[s] || []
          const hasCandidates = candidates.length > 0
          return (
            <Link key={s} href="/pipeline" className={`${styles.pipelineCard} ${hasCandidates ? styles.pipelineCardActive : ''}`}>
              <div className={styles.pipelineCardTop}>
                <span className={styles.pipelineCardCount}>{count}</span>
                <span className={styles.pipelineCardStage}>{STATUS_LABELS[s]}</span>
              </div>
              <div className={styles.pipelineCardCandidates}>
                {candidates.length === 0 ? (
                  <span className={styles.pipelineCardEmpty}>No candidates</span>
                ) : (
                  candidates.slice(0, 2).map((app: any, i: number) => (
                    <div key={i} className={styles.pipelineCardCandidate}>
                      <span className={styles.pipelineCardName}>{app.candidate_name || 'Candidate'}</span>
                      <span className={styles.pipelineCardJob}>{app.job_title || ''}</span>
                    </div>
                  ))
                )}
                {candidates.length > 3 && (
                  <span className={styles.pipelineCardMore}>+{candidates.length - 3} more</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Active Jobs — the employer's own posts. A VERTICAL LIST on a phone, a
// 3-up grid on desktop; nothing scrolls sideways at either. Each tile taps to
// that post's management (its applicants view), NOT the candidate apply page.
//
// THE ‹ › ARROWS ARE GONE, not hidden. They existed to nudge a horizontal
// scroller that no longer exists at any width — CSS already hid them above 961
// and below 768, so they were live in a 192px band and dead everywhere else.
// Two aria-labelled buttons that scroll nothing are worse than no buttons: a
// screen reader still announces "Scroll jobs left".
function ActiveJobsScroller({ jobs, styles }: { jobs: any[]; styles: Record<string, string> }) {
  return (
    <div className={styles.jobScrollWrap}>
      <div className={styles.jobScroller}>
        {jobs.map((job: any) => (
          // The real image-led job card; tap MANAGES the post (edit), not apply.
          // The overlay keeps the management stats (apps · views) visible.
          <JobCardLink key={job.id} job={job} href={`/post-job?edit=${job.id}`} className={styles.jobCardItem}>
            <span className={styles.jobOverlay}>{job.application_count || 0} apps · {job.views || 0} views</span>
          </JobCardLink>
        ))}
      </div>
    </div>
  )
}

// ApplicantScroller lived here — the horizontal row of CandidateCards used by
// the Recent Applicants panel. DELETED WITH ITS ONLY TWO CALL SITES rather than
// left orphaned: an unused component that still compiles is the thing someone
// re-mounts in six months without knowing it was removed on purpose. The people
// it showed are in the pipeline's own columns on desktop and one tap away on
// phone. Recoverable from git if the panel ever comes back.

// ── Candidate profile card slider (swipe one at a time) ──
function CandidateCardSlider({ apps, totalApplications, styles }: {
  apps: any[]
  totalApplications: number
  styles: Record<string, string>
}) {
  const [current, setCurrent] = React.useState(0)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ startX: 0, startY: 0, isHoriz: null as boolean | null, didMove: false })
  const getInitials = (name: string) => (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const avatarColors = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#3b82f6','#ec4899','#14b8a6','#e11d48']
  const statusColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#fef3c7', text: '#92400e' }, reviewing: { bg: '#dbeafe', text: '#1e40af' },
    shortlisted: { bg: '#ede9fe', text: '#5b21b6' }, interview: { bg: '#cffafe', text: '#0e7490' },
    offered: { bg: '#d1fae5', text: '#065f46' }, hired: { bg: '#dcfce7', text: '#14532d' },
    rejected: { bg: '#fee2e2', text: '#991b1b' },
  }
  const statusLabels: Record<string, string> = {
    pending: 'Applied', reviewing: 'Reviewing', shortlisted: 'Shortlisted',
    interview: 'Interview', offered: 'Offered', hired: 'Hired', rejected: 'Rejected',
  }
  React.useEffect(() => {
    const el = trackRef.current; if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => { s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY; s.isHoriz = null; s.didMove = false }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX; const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2 }
      if (!s.isHoriz) return; e.preventDefault(); s.didMove = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!s.isHoriz || !s.didMove) return
      const dx = s.startX - e.changedTouches[0].clientX
      if (dx > 40 && current < apps.length - 1) setCurrent(c => c + 1)
      if (dx < -40 && current > 0) setCurrent(c => c - 1)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [current, apps.length])

  if (apps.length === 0) return null
  const app = apps[current]
  const initials = getInitials(app.candidate_name || 'C')
  const bgColor = avatarColors[current % avatarColors.length]
  const sc = statusColors[app.status] || { bg: '#f3f4f6', text: '#374151' }
  const label = statusLabels[app.status] || app.status
  const skills = Array.isArray(app.candidate_skills) ? app.candidate_skills.slice(0, 3) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.75rem' }}>
        <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500 }}>
          {current + 1} of {apps.length}  &middot;  {totalApplications} total
        </span>
        {apps.length > 1 && (
          <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>&larr; swipe &rarr;</span>
        )}
      </div>
      <div ref={trackRef} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' as const, overflow: 'hidden' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' as const }}>
          {/* ── HEADER: Photo + Name + Facts ── */}
          <div style={{ display: 'flex', gap: '0.75rem', padding: '1.25rem 1rem 1rem', alignItems: 'flex-start' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {app.candidate_photo ? <img src={app.candidate_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{app.candidate_name || 'Candidate'}</div>
              {app.candidate_job_title && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{app.candidate_job_title}</div>}
              <span style={{ display: 'inline-block', fontSize: '0.62rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 4, background: sc.bg, color: sc.text, marginTop: '0.2rem' }}>{label}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.4rem', flexShrink: 0, textAlign: 'right' as const }}>
              {app.candidate_city && <span style={{ fontSize: '0.72rem', color: '#64748b' }}><Ico name="map-pin" size={16} /> {app.candidate_city}</span>}
              {app.candidate_years_exp && <span style={{ fontSize: '0.72rem', color: '#64748b' }}><Ico name="timer" size={16} /> {app.candidate_years_exp} yrs exp</span>}
              {app.candidate_availability && <span style={{ fontSize: '0.72rem', color: '#64748b' }}><Ico name="check" size={16} /> {app.candidate_availability}</span>}
              {app.candidate_sector && <span style={{ fontSize: '0.72rem', color: '#64748b' }}><Ico name="building" size={16} /> {app.candidate_sector}</span>}
            </div>
          </div>

          {/* ── BIO ── */}
          <div style={{ padding: '0 1rem 1rem' }}>
            {app.candidate_bio ? (
              <p style={{ fontSize: '0.8rem', color: '#334155', fontStyle: 'italic', lineHeight: 1.5, margin: 0, padding: '0.75rem', background: '#f8fafc', borderRadius: 8, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                &ldquo;{app.candidate_bio.slice(0, 150)}{app.candidate_bio.length > 150 ? '...' : ''}&rdquo;
              </p>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#cbd5e1', fontStyle: 'italic', margin: 0 }}>No bio added — candidate hasn&apos;t completed their profile yet</p>
            )}
          </div>

          {/* ── SKILLS ── */}
          {skills.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', padding: '0 1rem 0.875rem' }}>
              {skills.map((skill: string, i: number) => (
                <span key={i} style={{ fontSize: '0.68rem', padding: '4px 12px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>{skill}</span>
              ))}
            </div>
          )}

          {/* ── APPLIED FOR ── */}
          <div style={{ padding: '0 1rem 1rem' }}>
            <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: 0 }}>
              Applied for: {app.job_title || ''} &middot; {formatRelativeTime(app.created_at)}
            </p>
          </div>

          {/* ── ACTIONS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #e5e7eb' }}>
            <Link href={`/candidates/${app.candidate_id}`} onClick={(e: any) => e.stopPropagation()} style={{ padding: '0.875rem', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', textDecoration: 'none', borderRight: '1px solid #e5e7eb', borderBottomLeftRadius: '16px' }}>View Profile</Link>
            <Link href={`/messages?candidate=${app.candidate_id}`} onClick={(e: any) => e.stopPropagation()} style={{ padding: '0.875rem', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#FFE500', background: '#0f172a', textDecoration: 'none', display: 'block', borderBottomRightRadius: '16px' }}>Message</Link>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.3rem', marginTop: '0.75rem' }}>
        {apps.map((_: any, i: number) => (
          <button key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? '20px' : '7px', height: '7px', borderRadius: '4px', background: i === current ? '#0f172a' : '#cbd5e1', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.2s' }} />
        ))}
      </div>
    </div>
  )
}

// ── Job swipe cards slider (non-passive touch) ──
function JobSlider({ jobs }: { jobs: any[] }) {
  const CARD_W = 176
  const maxOffset = Math.max(0, (jobs.length - 2.2) * CARD_W)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ offset: 0, startX: 0, startY: 0, startOffset: 0, lastX: 0, lastT: 0, vel: 0, isHoriz: null as boolean | null, didMove: false, rafId: 0 })

  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v))
  const setTransform = (x: number) => { if (trackRef.current) trackRef.current.style.transform = `translateX(-${x}px)` }
  const snapTo = (target: number) => {
    const snapped = clamp(Math.round(target / CARD_W) * CARD_W)
    let cur = state.current.offset
    const step = () => {
      cur += (snapped - cur) * 0.12
      if (Math.abs(snapped - cur) < 0.5) { state.current.offset = snapped; setTransform(snapped); return }
      state.current.offset = cur; setTransform(cur)
      state.current.rafId = requestAnimationFrame(step)
    }
    state.current.rafId = requestAnimationFrame(step)
  }

  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.rafId)
      s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY
      s.startOffset = s.offset; s.lastX = s.startX; s.lastT = Date.now()
      s.vel = 0; s.isHoriz = null; s.didMove = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX
      const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2
      }
      if (!s.isHoriz) return
      e.preventDefault()
      s.didMove = true
      const now = Date.now(); const dt = now - s.lastT
      if (dt > 0) s.vel = (s.lastX - e.touches[0].clientX) / dt
      s.lastX = e.touches[0].clientX; s.lastT = now
      s.offset = clamp(s.startOffset + dx); setTransform(s.offset)
    }
    const onEnd = () => {
      if (!s.isHoriz || !s.didMove) return
      snapTo(s.offset + s.vel * 350)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [maxOffset])

  return (
    <div style={{ overflow: 'hidden', margin: '0 -1.25rem', paddingBottom: '0.75rem' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: '0.5rem', willChange: 'transform', paddingLeft: '1.25rem', paddingRight: '3rem', paddingBottom: '0.75rem' }}>
        {jobs.map(job => {
          const appCount = job.application_count || 0
          const fillPct = Math.min((appCount / 20) * 100, 100)
          return (
            <Link key={job.id} href="/my-jobs" style={{ flex: '0 0 164px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.75rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {job.title}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{job.views || 0}</div>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase' as const }}>Views</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{appCount}</div>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase' as const }}>Apps</div>
                </div>
              </div>
              <div style={{ height: 3, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#FFE500', borderRadius: 2, width: `${fillPct}%` }} />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Messages slider ──
function MessagesSlider({ conversations }: { conversations: any[] }) {
  const CARD_W = 230
  const maxOffset = Math.max(0, (conversations.length - 1.4) * CARD_W)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ offset: 0, startX: 0, startY: 0, startOffset: 0, lastX: 0, lastT: 0, vel: 0, isHoriz: null as boolean | null, didMove: false, rafId: 0 })
  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v))
  const setTransform = (x: number) => { if (trackRef.current) trackRef.current.style.transform = `translateX(-${x}px)` }
  const snapTo = (target: number) => {
    const snapped = clamp(Math.round(target / CARD_W) * CARD_W)
    let cur = state.current.offset
    const step = () => {
      cur += (snapped - cur) * 0.12
      if (Math.abs(snapped - cur) < 0.5) { state.current.offset = snapped; setTransform(snapped); return }
      state.current.offset = cur; setTransform(cur)
      state.current.rafId = requestAnimationFrame(step)
    }
    state.current.rafId = requestAnimationFrame(step)
  }
  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.rafId)
      s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY
      s.startOffset = s.offset; s.lastX = s.startX; s.lastT = Date.now()
      s.vel = 0; s.isHoriz = null; s.didMove = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX
      const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2 }
      if (!s.isHoriz) return
      e.preventDefault(); s.didMove = true
      const now = Date.now(); const dt = now - s.lastT
      if (dt > 0) s.vel = (s.lastX - e.touches[0].clientX) / dt
      s.lastX = e.touches[0].clientX; s.lastT = now
      s.offset = clamp(s.startOffset + dx); setTransform(s.offset)
    }
    const onEnd = () => { if (!s.isHoriz || !s.didMove) return; snapTo(s.offset + s.vel * 350) }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [maxOffset])
  const getInitials = (name: string) => (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ overflow: 'hidden', margin: '0 -1rem', padding: '0 1rem' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: '0.5rem', willChange: 'transform' }}>
        {conversations.map(conv => (
          <Link key={conv.id} href={`/messages?conversation=${conv.id}`} style={{ flex: '0 0 220px', minWidth: 220, background: conv.unreadCount > 0 ? '#fffbeb' : '#fff', border: conv.unreadCount > 0 ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>
                  {getInitials(conv.participantName)}
                </div>
                {conv.unreadCount > 0 && (
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.participantName}</div>
                <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{formatRelativeTime(conv.lastMessageAt)}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
              {conv.lastMessage || 'No messages yet'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function EmployerDashboardPage() {
  const router = useRouter()
  const { conversations, totalUnreadCount } = useMessages()

  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 960)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [companyDescription, setCompanyDescription] = useState('')
  const [hasAvailability, setHasAvailability] = useState(false)
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null)
  const [freeUntil, setFreeUntil] = useState<string | null>(null)
  const [dismissChecklist, setDismissChecklist] = useState(false)
  // Onboarding example showcase is shown ONLY while the tour is running, so the
  // dashboard stays clean before and after (EmployerTour dispatches show/hide).
  const [showTourExamples, setShowTourExamples] = useState(false)

  // Stats
  const [totalJobs, setTotalJobs] = useState(0)
  const [activeJobs, setActiveJobs] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalViews, setTotalViews] = useState(0)
  const [newJobsThisWeek, setNewJobsThisWeek] = useState(0)
  // Count of applications the employer hasn't yet opened (viewed_at IS NULL).
  // Drops automatically as they review applications, since the per-job
  // applications page auto-stamps viewed_at on open.
  const [unviewedAppsCount, setUnviewedAppsCount] = useState(0)

  // Data
  const [applications, setApplications] = useState<any[]>([])

  // THE "NEW SINCE LAST VISIT" ANCHOR.
  //
  // Read once on load and then immediately overwritten with now(), so the
  // comparison is against the PREVIOUS visit rather than this one. Held in
  // state because the write has to happen before the page can render — read it
  // late and every application looks old the moment you arrive.
  //
  // Lives in employer_profiles.ui_state, a jsonb blob added for exactly this
  // and for the setup strip's dismissal. Not notification_preferences, which is
  // about what we send.
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)

  // Setup-strip dismissal. PER ACCOUNT, not per browser — the strip is about
  // what this employer has finished setting up, which does not change because
  // they opened a different laptop. Same ui_state blob as the visit anchor,
  // which is why that column was worth taking rather than localStorage.
  const [setupDismissed, setSetupDismissed] = useState(false)
  const dismissSetup = useCallback(() => {
    setSetupDismissed(true)   // optimistic: the strip goes now, not after a round trip
    if (!user?.id) return
    supabase.from('employer_profiles').select('ui_state').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => supabase.from('employer_profiles')
        .update({ ui_state: { ...((data?.ui_state as object) || {}), setupDismissedAt: new Date().toISOString() } })
        .eq('user_id', user.id))
      .then(undefined, () => { /* a failed dismissal must never break the page */ })
  }, [user?.id])
  const [jobsData, setJobsData] = useState<any[]>([])

  // Show the onboarding example showcase only while the tour is running.
  useEffect(() => {
    const show = () => setShowTourExamples(true)
    const hide = () => setShowTourExamples(false)
    window.addEventListener('thrive-tour:show', show)
    window.addEventListener('thrive-tour:hide', hide)
    return () => {
      window.removeEventListener('thrive-tour:show', show)
      window.removeEventListener('thrive-tour:hide', hide)
    }
  }, [])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let safetyTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const loadDashboardData = async (session: Session) => {
      if (cancelled) return
      if (session.user.user_metadata?.role !== 'employer') {
        router.replace('/dashboard')
        return
      }

      setUser(session.user)
      // Multi-user: dashboard data (jobs, availability, subscription, profile)
      // is keyed employer_id / user_id = OWNER user_id. Resolve the owner of the
      // employer this user is active in — owner → own id (unchanged).
      const userId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      // Provisional name from the session; overridden by the resolved employer's
      // profile below so a team member sees the EMPLOYER'S name, not their own
      // (a member has no company_name in their metadata → would show "Your Company").
      setCompanyName(session.user.user_metadata?.company_name || 'Your Company')

      // Fetch company name/logo from the RESOLVED employer's profile (owner's row).
      try {
        const { data: empProfile } = await supabase
          .from('employer_profiles')
          .select('company_name, logo_url, description, ui_state')
          .eq('user_id', userId)
          .maybeSingle()

        // Read the previous visit, then stamp this one. Order matters: the
        // answer line compares against the value read here, so writing first
        // would make every application look old the instant you arrived.
        const ui = (empProfile?.ui_state as Record<string, string> | null) || {}
        setLastSeenAt(ui.dashboardSeenAt || null)
        // Without this the strip reappears on every load, which is worse than
        // never having gone: dismissing it would look broken rather than
        // temporary.
        setSetupDismissed(!!ui.setupDismissedAt)
        supabase.from('employer_profiles')
          .update({ ui_state: { ...((empProfile?.ui_state as object) || {}), dashboardSeenAt: new Date().toISOString() } })
          .eq('user_id', userId)
          .then(undefined, () => { /* a failed stamp must never break the page */ })
        if (empProfile?.company_name) {
          setCompanyName(empProfile.company_name)
        }
        if (empProfile?.logo_url) {
          setCompanyLogo(empProfile.logo_url)
        } else if (session.user.user_metadata?.logo_url) {
          setCompanyLogo(session.user.user_metadata.logo_url)
        }
        if (empProfile?.description) {
          setCompanyDescription(empProfile.description)
        }
      } catch { /* employer_profiles may not exist */ }

      // Fetch availability — any active rows mean the employer is set up
      try {
        const { count } = await supabase
          .from('employer_availability')
          .select('id', { count: 'exact', head: true })
          .eq('employer_id', userId)
          .eq('is_active', true)
        setHasAvailability((count || 0) > 0)
      } catch { /* table may not exist */ }

      // Fetch subscription tier
      try {
        const { data: subData } = await supabase
          .from('employer_subscriptions')
          .select('subscription_tier, trial_ends_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (subData) {
          setSubscriptionTier(subData.subscription_tier || null)
          if (subData.subscription_tier === 'free') {
            setFreeUntil(subData.trial_ends_at || null)
          }
        }
      } catch { /* subscription table may not exist */ }

      // Fetch employer's jobs
      try {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, title, status, views, posted_at, company, company_logo_url, company_banner_url, salary_min, salary_max, salary_type, location, area, category, is_recruiter_posting')
          .eq('employer_id', userId)
          .order('posted_at', { ascending: false })

        if (jobs) {
          setTotalJobs(jobs.length)
          setActiveJobs(jobs.filter(j => j.status === 'active').length)

          const views = jobs.reduce((sum: number, j: any) => sum + (j.views || 0), 0)
          setTotalViews(views)

          // Compute "new jobs this week" badge
          const now = new Date()
          const dayOfWeek = now.getDay() // 0=Sun
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
          const weekStart = new Date(now)
          weekStart.setHours(0, 0, 0, 0)
          weekStart.setDate(now.getDate() + mondayOffset)
          const jobsThisWeek = jobs.filter(j => j.posted_at && new Date(j.posted_at) >= weekStart).length
          setNewJobsThisWeek(jobsThisWeek)

          // Fetch ALL applications for these jobs (no limit — need accurate total count)
          const jobIds = jobs.map(j => j.id)
          if (jobIds.length > 0) {
            try {
              const { data: appData } = await supabase
                .from('job_applications')
                .select('id, job_id, job_title, company, status, created_at, candidate_id, viewed_at, stage_entered_at')
                .in('job_id', jobIds)
                .order('created_at', { ascending: false })

              if (appData) {
                setTotalApplications(appData.length)

                // Badge = applications still awaiting first review.
                // The per-job applications page auto-stamps viewed_at when
                // the employer opens it, so this count decreases naturally
                // each time they review an application.
                const unviewed = appData.filter(a => !a.viewed_at).length
                setUnviewedAppsCount(unviewed)

                // Build per-job application count map for enriching jobsData
                const appCountByJob: Record<string, number> = {}
                appData.forEach((a: any) => {
                  appCountByJob[a.job_id] = (appCountByJob[a.job_id] || 0) + 1
                })

                // Enrich jobs with real application counts. Map through
                // supabaseJobToJob so the Active Jobs cards can render the real
                // image-led job card; keep views + application_count for the overlay.
                const enrichedJobs = jobs.map(j => ({
                  ...supabaseJobToJob(j),
                  views: j.views || 0,
                  application_count: appCountByJob[j.id] || 0,
                }))
                setJobsData(enrichedJobs)

                // Keep only the most recent 50 for the pipeline/recent apps display
                const recentApps = appData.slice(0, 50)
                setApplications(recentApps)

                // Enrich with candidate names
                const candidateIds = Array.from(new Set(recentApps.map((a: any) => a.candidate_id).filter(Boolean)))
                if (candidateIds.length > 0) {
                  try {
                    const { data: profiles } = await supabase
                      .from('candidate_profiles')
                      .select('user_id, full_name, profile_picture_url, city, availability, years_experience, job_title, job_sector, skills, bio, cv_url')
                      .in('user_id', candidateIds)

                    if (profiles) {
                      const nameMap: Record<string, string> = {}
                      const profileExtras: Record<string, any> = {}
                      profiles.forEach((p: any) => {
                        nameMap[p.user_id] = p.full_name
                        profileExtras[p.user_id] = {
                          photo: p.profile_picture_url || null,
                          city: p.city || null,
                          availability: p.availability || null,
                          yearsExp: p.years_experience || null,
                          jobTitle: p.job_title || null,
                          sector: p.job_sector || null,
                          skills: p.skills || [],
                          bio: p.personal_bio || p.bio || null,
                          cvUrl: p.cv_url || null,
                        }
                      })
                      setApplications(prev => prev.map(a => ({
                        ...a,
                        candidate_name: nameMap[a.candidate_id] || 'Candidate',
                        candidate_photo: profileExtras[a.candidate_id]?.photo || null,
                        candidate_city: profileExtras[a.candidate_id]?.city || null,
                        candidate_availability: profileExtras[a.candidate_id]?.availability || null,
                        candidate_years_exp: profileExtras[a.candidate_id]?.yearsExp || null,
                        candidate_job_title: profileExtras[a.candidate_id]?.jobTitle || null,
                        candidate_sector: profileExtras[a.candidate_id]?.sector || null,
                        candidate_skills: profileExtras[a.candidate_id]?.skills || [],
                        candidate_bio: profileExtras[a.candidate_id]?.bio || null,
                        candidate_cv_url: profileExtras[a.candidate_id]?.cvUrl || null,
                      })))
                    }
                  } catch { /* candidate_profiles may not exist */ }
                }
              } else {
                // No applications — still set jobsData with zero counts
                setJobsData(jobs.map(j => ({ ...supabaseJobToJob(j), views: j.views || 0, application_count: 0 })))
              }
            } catch {
              // job_applications table may not exist — set jobsData with zero counts
              setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
            }
          } else {
            setJobsData([])
          }
        }
      } catch { /* jobs table query failed */ }

      setLoading(false)
    }

    const init = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()

        if (userType !== 'employer') {
          router.replace('/dashboard')
          return
        }

        setUser(mockUser)
        setCompanyName(mockUser?.user_metadata?.company_name || 'Your Company')

        // Load company logo from localStorage profile
        const savedProfile = localStorage.getItem('employerProfile')
        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          if (profile.logoUrl) setCompanyLogo(profile.logoUrl)
        }

        setTotalJobs(8)
        setActiveJobs(5)
        setTotalApplications(34)
        setTotalViews(287)
        setApplications([
          { id: '1', candidate_name: 'Sarah Johnson', job_title: 'Head Chef', status: 'pending', created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: '2', candidate_name: 'Michael Brown', job_title: 'Sous Chef', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '3', candidate_name: 'Emma Wilson', job_title: 'Pastry Chef', status: 'interview', created_at: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: '4', candidate_name: 'James Taylor', job_title: 'Kitchen Porter', status: 'hired', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: '5', candidate_name: 'Olivia Davis', job_title: 'Waitress', status: 'rejected', created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
        ])
        setJobsData([
          { id: 'j1', title: 'Head Chef', status: 'active', views: 84, application_count: 12 },
          { id: 'j2', title: 'Sous Chef', status: 'active', views: 67, application_count: 9 },
          { id: 'j3', title: 'Pastry Chef', status: 'active', views: 52, application_count: 7 },
        ])
        setLoading(false)
        return
      }

      // PRODUCTION MODE
      // Client and server share one cookie-backed session store, so
      // getSession() reads what the server wrote.
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // The server layout just rendered this page, so a valid session DOES
        // exist server-side. Right after an OAuth redirect the cookie can be
        // momentarily unreadable for a tick — retry once before bouncing.
        await new Promise((r) => setTimeout(r, 400))
        session = (await supabase.auth.getSession()).data.session
      }
      if (session) {
        await loadDashboardData(session)
        return
      }

      // No cookies either — check if we're still inside an OAuth flow (the
      // oauth_intended_role cookie is set by the sign-in button and cleared
      // when the callback completes).
      const oauthCookie = typeof window !== 'undefined'
        ? document.cookie.includes('oauth_intended_role')
        : false

      if (!oauthCookie) {
        router.push('/login/employer')
        return
      }

      // Still mid-OAuth — fall back to auth-state subscription as a last resort
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, authSession) => {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && authSession) {
            subscription.unsubscribe()
            if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
            await loadDashboardData(authSession)
          }
        }
      )
      unsubscribe = () => subscription.unsubscribe()

      // Safety timeout — if no session after 15s, redirect
      safetyTimer = setTimeout(() => {
        subscription.unsubscribe()
        if (!cancelled) router.push('/login/employer')
      }, 15000)
    }

    init()
    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
      if (safetyTimer) clearTimeout(safetyTimer)
    }
  }, [router])

  // ── Simulator tick ──────────────────────────────────────
  // Fires once the employer dashboard has a real user. The simulator endpoint
  // is throttled server-side (60s) so navigating in and out repeatedly is a
  // no-op. Hobby plan can't run sub-daily crons, so this stands in for one.
  useEffect(() => {
    if (DEV_MODE) return
    if (!user) return
    fetch('/api/simulate/run', { method: 'POST' }).catch(() => {})
  }, [user])

  // ── Derived data ────────────────────────────────────────

  // BUCKETED THROUGH THE DECLARED MAPPER, not the raw string.
  //
  // Both of these used to key straight off application.status and send anything
  // unrecognised to 'pending' — silently. So a status this widget hasn't heard
  // of doesn't go missing, which would at least be visible; it appears in
  // Applied, which looks correct and is wrong.
  //
  // stageForStatus is the same mapper /pipeline and the applications header use,
  // so all three now agree by construction rather than by three copies of a
  // switch happening to match. 'pending' is deliberately not one of its stages —
  // it returns null — so the fallback stays explicit here rather than implied.
  const bucketOf = (status: string | null | undefined): string => {
    const s = (status || '').toLowerCase()
    if (s === 'pending' || s === 'applied' || !s) return 'pending'
    return stageForStatus(s) ?? 'pending'
  }

  // THE ANSWER LINE'S STATE. Everything here comes from data the page already
  // loads — the applications query already selects status, created_at and
  // stage_entered_at, and candidate names are already resolved for the Recent
  // Applicants cards. Rows 1, 2, 5 and 6 therefore cost no new queries.
  //
  // Rows 3 and 4 (interview today/tomorrow, unread messages) are not wired:
  // this page queries neither interviews nor conversations, so each would add
  // one. Four rows working beats six half-wired.
  // Consumed once, on mount, by the tab that just published. Null on every
  // ordinary visit, which is why the answer line below is unchanged for
  // everyone who did not arrive here straight from posting.
  const [justPosted, setJustPosted] = useState<JustPosted | null>(null)
  useEffect(() => { setJustPosted(readJustPosted()) }, [])

  const answerLineModel = useMemo(() => {
    // THE ONE EVENT THAT OUTRANKS THE STATE. An employer who has just pressed
    // publish is owed confirmation before they are told what is quiet — and
    // for exactly one view, because readJustPosted has already consumed the
    // flag by the time this runs.
    if (justPosted) return justPostedAnswerLine(justPosted.title)

    // Longest-stalled shortlisted candidate. Longest rather than first, because
    // the one that has waited most is the one not deciding has hurt most.
    let stalled: { name: string; days: number } | null = null
    for (const a of applications) {
      if ((a.status || '').toLowerCase() !== 'shortlisted') continue
      const entered = a.stage_entered_at || a.status_updated_at || a.created_at
      if (!entered) continue
      // Date-only difference, so a card moved late yesterday reads as 1 day
      // rather than 0 — matching StageDurationBadge's semantics on the same page.
      const d = Math.floor((Date.now() - new Date(entered).getTime()) / 86_400_000)
      if (!stalled || d > stalled.days) stalled = { name: a.candidate_name, days: d }
    }

    const newApplications = lastSeenAt
      ? applications.filter(a => a.created_at && new Date(a.created_at) > new Date(lastSeenAt)).length
      : 0

    return employerAnswerLine({
      stalled,
      newApplications,
      totalJobs,
      activeJobs,
      // Held back until 11 August — see VIEWS_COMPARABLE_FROM. Passed anyway so
      // the clause turns itself on rather than needing a code change.
      viewsThisWeek: null,
    })
  }, [applications, lastSeenAt, totalJobs, activeJobs, justPosted])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    PIPELINE_STAGES.forEach(s => { counts[s] = 0 })
    applications.forEach(a => { counts[bucketOf(a.status)]++ })
    return counts
  }, [applications])

  const candidatesByStage = useMemo(() => {
    const map: Record<string, typeof applications> = {}
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    applications.forEach(app => { map[bucketOf(app.status)].push(app) })
    return map
  }, [applications])

  // ── The phone pipeline's six rows ────────────────────────────────
  //
  // Same counts as the desktop columns, from the same statusCounts — this does
  // not recompute the pipeline, it re-renders it.
  //
  // THE NOTE IS PLAIN LANGUAGE, NOT A SECOND COUNT. "2 new" and "waiting 4d"
  // tell an employer something the number on the left does not; "3 candidates"
  // would just be the number again in words.
  //
  // Rendered only where it is TRUE and USEFUL, in that order of preference:
  //   "N new"      applications that arrived since they last opened this page
  //   "waiting Nd" otherwise, the LONGEST anyone has sat in this stage — the
  //                one that has been waiting longest is the one that matters,
  //                not the average
  // and nothing at all for an empty stage, or for a stage where everyone
  // arrived today. An empty note reads better than a padded one.
  const pipelineRows = useMemo(() => {
    const since = lastSeenAt ? new Date(lastSeenAt).getTime() : null
    return PIPELINE_STAGES.filter(s => s !== 'rejected').map(s => {
      const label = s === 'pending' ? 'Applied' : (STAGE_LABELS[s as keyof typeof STAGE_LABELS] || STATUS_LABELS[s] || s)
      const inStage = candidatesByStage[s] || []
      const count = statusCounts[s] || 0

      let note: string | null = null
      if (count > 0) {
        const fresh = since === null ? 0 : inStage.filter(a => {
          const t = new Date(a.created_at || a.appliedAt || '').getTime()
          return Number.isFinite(t) && t > since
        }).length
        if (fresh > 0) {
          note = `${fresh} new`
        } else {
          // daysInStage is the same function StageDurationBadge uses, so this
          // cannot disagree with the "N days in Shortlisted" pill on desktop.
          const longest = inStage.reduce((max, a) =>
            a.stage_entered_at ? Math.max(max, daysInStage(a.stage_entered_at)) : max, 0)
          if (longest > 0) note = `waiting ${longest}d`
        }
      }

      return {
        key: s,
        label,
        count,
        note,
        // Lands on the pipeline board with that column scrolled into view.
        // Zero-count stages route too — an empty stage list is a real answer.
        href: `/pipeline#stage-${s}`,
      }
    })
  }, [candidatesByStage, statusCounts, lastSeenAt])

  const activeJobsList = useMemo(() =>
    jobsData.filter(j => j.status === 'active').slice(0, 10)
  , [jobsData])

  const recentConversations = useMemo(() =>
    [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  , [conversations])

  const staleApplications = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    return applications.filter(a =>
      a.status === 'pending' && new Date(a.created_at || a.appliedAt || '').getTime() < cutoff
    ).length
  }, [applications])

  const dateInfo = formatDate()

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main className={styles.pageBackground}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.welcomeHeader}>
            <div className={styles.welcomeLeft}>
              <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
              <div style={{ flex: 1 }}>
                <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: '220px' }} />
                <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} style={{ width: '150px' }} />
              </div>
            </div>
          </div>
          <SkeletonCard height={60} />
          <div className={styles.grid}>
            <div className={styles.colLeft}>
              <SkeletonCard height={260} />
              <SkeletonCard height={200} />
            </div>
            <div className={styles.colRight}>
              <SkeletonCard height={200} />
              <SkeletonCard height={180} />
            </div>
          </div>
        </div>
      </main>
    )
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <main className={styles.pageBackground}>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── THE ANSWER LINE ────────────────────────────────
            First thing on the page, above the greeting banner and the KPI
            strip. The dashboard's job is to answer "what needs me today" and
            it previously took five blocks before any news.

            Item 1 of the handoff's build order: it lands here without touching
            anything below it, which is why it ships first and alone. The five
            blocks it is meant to replace are still present — collapsing them is
            item 3, deliberately a separate change. */}
        <div style={{ marginBottom: '1rem' }}>
          <AnswerLine model={answerLineModel} />
        </div>


        {/* ── SETUP STRIP ────────────────────────────────
            THREE ONBOARDING DEVICES BECOME ONE. This replaces the "Get started
            with Thrive" checklist, the "Enable interview scheduling" banner —
            which was already item 4 of that same checklist, so the page nagged
            twice about one thing — and the tour button's own row.

            Completed items disappear rather than showing as ticked, so the
            strip shrinks as they work and removes itself at four of four. The
            greeting banner is gone entirely and the KPI strip has moved below
            the pipeline: this page is read for ninety seconds between services,
            and none of that was news. */}
        {!setupDismissed && (
          <SetupStrip
            items={[
              { key: 'logo', label: 'Add your company logo', href: '/settings', done: !!companyLogo },
              { key: 'job', label: 'Post your first job', href: '/post-job', done: totalJobs > 0 },
              { key: 'profile', label: 'Complete your company profile', href: '/settings', done: companyDescription.length > 50 },
              { key: 'availability', label: 'Set up interview availability', href: '/settings/availability', done: hasAvailability },
            ]}
            onDismiss={dismissSetup}
            tour={<EmployerTour isEmpty={totalJobs === 0} />}
          />
        )}

        {/* ── EXAMPLE SHOWCASE (display-only) — teaches the empty dashboard.
            Shown ONLY while the guided tour is running (and only for an account
            with no jobs), so the dashboard stays clean before/after. All data is
            fake and never touches the DB. ── */}
        {totalJobs === 0 && showTourExamples && <ExampleShowcase />}

        {/* ── STALE APPLICATIONS NUDGE ────────────────── */}
        {/* Whole banner links to /applied (the "New Applications" awaiting-review
            queue) — staleApplications counts pending apps older than 2 weeks. */}
        {staleApplications > 0 && (
          <Link href="/applied" className={styles.staleNudge}>
            <span className={styles.staleNudgeIcon}><Ico name="clock" size={20} /></span>
            <div className={styles.staleNudgeText}>
              <strong>{staleApplications} application{staleApplications !== 1 ? 's' : ''}</strong> {staleApplications !== 1 ? 'have' : 'has'} been waiting for review for over 2 weeks.
            </div>
            <span className={styles.staleNudgeLink}>Review now →</span>
          </Link>
        )}



        <div className={styles.grid}>

          {/* ── FULL WIDTH: Pipeline ── */}
          <div className={styles.colFull}>
            <div className={`${styles.card} ${styles.aBlue}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Application Pipeline</h2>
                <Link href="/pipeline" className={styles.cardLink}>View All</Link>
              </div>
              {/* PHONE: six full-width rows. DESKTOP: the Kanban columns,
                  untouched. Two renderings of one pipeline, switched on the
                  same isMobile the rest of this page uses — not a CSS
                  display:none pair, because the desktop columns mount real
                  candidate cards and rendering both would double the work on
                  the device least able to afford it. */}
              <div className={styles.cardBody} style={isMobile ? { padding: 0 } : undefined}>
                {isMobile ? (
                  <PipelineRows rows={pipelineRows} />
                ) : (
                <div className={styles.pipelineScroller}>
                  {PIPELINE_STAGES.filter(s => s !== 'rejected').map(s => {
                    // Mirror the /pipeline board: a stage column (coloured header +
                    // count pill) with the real candidate cards (initials avatar,
                    // name, role, "N days in stage" badge, Review →). Read-only.
                    const color = s === 'pending' ? '#f59e0b' : (STAGE_COLORS[s as keyof typeof STAGE_COLORS] || '#6b7280')
                    const label = s === 'pending' ? 'Applied' : (STAGE_LABELS[s as keyof typeof STAGE_LABELS] || STATUS_LABELS[s] || s)
                    const count = statusCounts[s] || 0
                    const candidates = candidatesByStage[s] || []
                    return (
                      <div key={s} className={styles.pipeCol}>
                        <div className={styles.pipeColHead} style={{ borderTopColor: color }}>
                          <span className={styles.pipeColLabel}>{label}</span>
                          <span className={styles.pipeColCount} style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{count}</span>
                        </div>
                        <div className={styles.pipeColBody}>
                          {candidates.length === 0 ? (
                            <span className={styles.pipeColEmpty}>No candidates</span>
                          ) : candidates.slice(0, 2).map((app: any) => (
                            <Link key={app.id} href="/pipeline" className={styles.pipeCard}>
                              <div className={styles.pipeCardTop}>
                                <span className={styles.pipeAvatar} style={{ background: color }}>{getInitials(app.candidate_name || 'C')}</span>
                                <div className={styles.pipeCardInfo}>
                                  <span className={styles.pipeCardName}>{app.candidate_name || 'Candidate'}</span>
                                  <span className={styles.pipeCardRole}>{app.candidate_job_title || app.job_title || ''}</span>
                                </div>
                              </div>
                              {app.stage_entered_at && (
                                <StageDurationBadge stageEnteredAt={app.stage_entered_at} stageLabel={label} stageColor={color} />
                              )}
                              <span className={styles.pipeReview}>Review &rarr;</span>
                            </Link>
                          ))}
                          {candidates.length > 2 && <Link href="/pipeline" className={styles.pipeColMore}>+{candidates.length - 2} more</Link>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            </div>
          </div>


          {/* ── KPI ROW — BELOW THE PIPELINE, NOT ABOVE IT.
              Not deleted, demoted. These four numbers were the second thing on
              the page and none of them is news: they are reference, and they
              belong after the thing an employer came to look at.

              HIDDEN ENTIRELY WHEN EVERY VALUE IS ZERO. Four zeroes teach a new
              employer nothing and take a whole row to say it. ── */}
          {(activeJobs > 0 || totalApplications > 0 || (statusCounts['interview'] || 0) > 0 || totalViews > 0) && (
          <div className={styles.colFull}>
        {/* ── STATS STRIP ── */}
        <div className={styles.statsStrip} data-tour="stats">
          <button className={styles.statPill} onClick={() => router.push('/my-jobs')}>
            <span className={styles.statPillNum}>{activeJobs}</span>
            <span className={styles.statPillLabel}>Active Jobs</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/my-jobs')}>
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span className={styles.statPillNum}>{totalApplications}</span>
              {unviewedAppsCount > 0 && (
                <span
                  title={`${unviewedAppsCount} awaiting your review`}
                  style={{ position: 'absolute', top: -4, right: -12, minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #fff' }}
                >
                  {unviewedAppsCount > 99 ? '99+' : unviewedAppsCount}
                </span>
              )}
            </span>
            <span className={styles.statPillLabel}>Applications</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/my-jobs?filter=interviewing')}>
            <span className={styles.statPillNum}>{statusCounts['interview'] || 0}</span>
            <span className={styles.statPillLabel}>Interviewing</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/messages')}>
            <span className={styles.statPillNum}>{totalViews}</span>
            <span className={styles.statPillLabel}>Views</span>
          </button>
        </div>
          </div>
          )}

          {/* ── Active Jobs — full width: the horizontal image-card scroller uses the
              width well and removes the empty gap a short left column left behind. ── */}
          <div className={styles.colFull}>
            <div className={`${styles.card} ${styles.aYellow}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Active Jobs</h2>
                {/* Shifts have never had a route from the dashboard. Rather than
                    build a second panel here, this points at the one place that
                    now carries both — /my-jobs leads on to /temp-work/manage. */}
                <span style={{ display: 'inline-flex', gap: '0.9rem', alignItems: 'baseline' }}>
                  <Link href="/temp-work/manage" className={styles.cardLink}>Shifts</Link>
                  <Link href="/my-jobs" className={styles.cardLink}>Manage Jobs</Link>
                </span>
              </div>
              <div className={styles.cardBody}>
                {activeJobsList.length > 0 ? (
                  <ActiveJobsScroller jobs={activeJobsList} styles={styles} />
                ) : (
                  /* TWO STATES, NOT ONE. "Post your first listing" was shown to
                     every employer with nothing ACTIVE — including one with four
                     jobs and three applicants on screen directly above it, whose
                     roles were simply all filled.

                     Telling someone who has hired to post their first job is the
                     fifth instance of copy describing a state the account is not
                     in, after the reply button, the /my-jobs section, the
                     interviews empty state and the manage-page subtitle.

                     totalJobs is already loaded for the tour and the checklist,
                     so the two states were always distinguishable. */
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128188;</div>
                    {totalJobs === 0 ? (
                      <p>No active jobs. Post your first listing!</p>
                    ) : (
                      /* FOUR WORDS, and shorter than it used to be. The answer
                         line at the top of this page now carries the full
                         sentence naming the cause; this is the same fact 800px
                         further down, and saying it twice at length is
                         repetition on a page built to remove it. Same root
                         string as the answer line, so they cannot drift.

                         The register was already argued once here: an earlier
                         draft added "They're still on Manage Job Ads whenever
                         you want to repost" — true, and a three-line paragraph
                         on a phone, pointing at a "Manage Jobs" link two
                         centimetres above it in this card's own header. Every
                         other empty state in this column is four words. */
                      <p>{nothingLiveShort()}</p>
                    )}
                    <Link href="/post-job" className={styles.cardLink}>
                      {totalJobs === 0 ? 'Post a Job' : 'Post another role'} &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Recent Applicants — WIDE left column: the rich CandidateCard scroller
              needs the width (it was cramped in the narrow right column), and it sits
              under the full-width Active Jobs row. ── */}
          {/* ── Recent Applicants: ABSORBED, NOT DELETED ──────────────────
              The named candidate cards live inside the Applied and Shortlisted
              columns of the pipeline above on desktop, and behind a row tap on
              phone. This card showed the same people a second time, in a
              second horizontal scroller.

              TWO NESTED HORIZONTAL SCROLLERS ON ONE 390 SCREEN was the actual
              failure — a sideways swipe inside a vertically scrolling page,
              twice. Converting the pipeline to rows and leaving this one in
              place would have halved the problem and called it fixed.

              Both renderings go: this desktop column and the isMobile block
              that used to repeat it below. ── */}

          {/* ── Recent Messages — narrow right column (a list fits cleanly here) ── */}
          <div className={styles.colRight}>
            <div className={`${styles.card} ${styles.aCyan}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Messages</h2>
                <Link href="/messages" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recentConversations.length > 0 ? (
                  <div className={styles.msgList}>
                    {recentConversations.map((conv: any) => (
                      <Link href="/messages" key={conv.id} className={styles.msgItem}>
                        <div className={styles.msgAvatarWrap}>
                          <div className={styles.msgAvatar}>
                            {conv.participantName ? getInitials(conv.participantName) : '?'}
                          </div>
                          <span className={conv.unreadCount > 0 ? styles.msgOnline : styles.msgOffline} />
                        </div>
                        <div className={styles.msgContent}>
                          <p className={styles.msgSender}>
                            {conv.unreadCount > 0 && <span className={styles.unreadDot} />}
                            {conv.participantName}
                          </p>
                          <p className={styles.msgPreview}>{conv.lastMessage}</p>
                        </div>
                        <span className={styles.msgTime}>{formatRelativeTime(conv.lastMessageAt)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128172;</div>
                    <p>No messages yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Jobs is rendered once in the full-width colFull block above
              (it spans the row on desktop as a grid, and on mobile via the same
              .jobScroller, which is a scroller ≤960). No separate mobile block —
              a duplicate one previously rendered Active Jobs twice on mobile. */}

          {/* The mobile Candidate card slider was the SECOND of the two nested
              horizontal scrollers. Removed with its desktop twin — see the note
              where that column used to be. The people it showed are one tap
              away through the pipeline rows above. */}

          {/* ── MOBILE ONLY: Messages stacked list ── */}
          {isMobile && (
            <div className={styles.colFull}>
              <div className={`${styles.card} ${styles.aCyan}`}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Recent Messages</h2>
                  <Link href="/messages" className={styles.cardLink}>View All</Link>
                </div>
                <div className={styles.cardBody}>
                  {recentConversations.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', width: '100%' }}>
                      {recentConversations.map((conv: any) => (
                        <Link href="/messages" key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: conv.unreadCount > 0 ? '#fffbeb' : '#fff', border: conv.unreadCount > 0 ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: '12px', textDecoration: 'none', color: 'inherit', boxSizing: 'border-box' as const, width: '100%', overflow: 'hidden' }}>
                          <div style={{ position: 'relative' as const, flexShrink: 0 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>
                              {(conv.participantName || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            {conv.unreadCount > 0 && <div style={{ position: 'absolute' as const, top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{conv.unreadCount}</div>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{conv.participantName}</div>
                            <div style={{ fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'calc(100vw - 140px)' }}>{conv.lastMessage || 'No messages yet'}</div>
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.62rem', lineHeight: 1.4, padding: '0.15rem 0.45rem', borderRadius: 999, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{formatRelativeTime(conv.lastMessageAt)}</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>&#128172;</div>
                      <p>No messages yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}
