'use client'

/**
 * THE APPLICANTS LIST (design 24 section 4; design 25; Claude Design's answers
 * of 15 Nov 2026). It replaces the pipeline board and the Offers page: one
 * list, stage chips, one next-step button per person, "Not a fit", Undo.
 *
 * Lives at /applied, the page build 30's Applicants tab already loads, so it
 * reaches the app without a new build. /applied?app=<id> is the same view with
 * an applicant open: beside the list from 768 wide, on its own on a phone.
 *
 * ── UNDO, AND WHEN THINGS BECOME FINAL ─────────────────────────────────────
 * Every move offers Undo for six seconds (UNDO_MS). NO STATUS IS WRITTEN UNTIL
 * UNDO HAS RUN OUT, because writing one fires trg_cascade_application_status:
 * Mark hired accepts the latest offer and closes live interviews, Not a fit
 * cancels interviews and withdraws a pending offer — and no Undo could put
 * those back. So Undo only ever has to undo the screen.
 *   Shortlist / Mark hired   shown at once; written (as the employer) and the
 *                            candidate's bell notice sent when Undo runs out.
 *   Not a fit                the server records the update as OWED (that
 *                            column fires nothing) and QUEUES ITS OWN SEND
 *                            eight seconds later, so a closed tab delays
 *                            nothing. This page also sends when Undo runs out,
 *                            or at once if the employer leaves first (beacon
 *                            for a hidden page). The server sends once,
 *                            whatever calls; the status changes at that send.
 * Leaving the page (navigating away, hiding it) makes the pending move final.
 * A second move while a toast is up finishes the first one immediately, so
 * there is only ever one Undo on screen and it always means the last thing.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import MakeOfferModal from '@/components/MakeOfferModal'
import DeclineModal from '@/components/DeclineModal'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import {
  LISTED_STAGES, NEXT_STEP, STAGE_LABEL, OVERDUE_DAYS, UNDO_MS, EMPTY_ALL,
  daysWaiting, emptyStage, isListed, stageOf, toastMoved, toastNotAFit, waitLabel,
  type ListedStage,
} from '@/lib/applicantStages'
import { useApplicants, initialsOf, type ApplicantRow } from './useApplicants'
import ApplicantDetail from './ApplicantDetail'
import styles from './Applicants.module.css'

type Toast = { text: string; undo?: () => void | Promise<void>; finish?: () => void }

export default function ApplicantsView() {
  const router = useRouter()
  const params = useSearchParams()
  // THE OPEN APPLICANT IS A QUERY PARAMETER, NOT A ROUTE. /applied/[id] would be
  // a different page, so opening someone would unmount this one and make a
  // pending Not a fit final at once, Undo and all. ?app= keeps the list, its
  // toast and what it owes mounted.
  const selectedId = params?.get('app') || null
  const data = useApplicants()
  const { rows, setRows, jobs, loading } = data

  const stageParam = params?.get('stage') as ListedStage | null
  const [stage, setStage] = useState<'all' | ListedStage>(stageParam && (LISTED_STAGES as readonly string[]).includes(stageParam) ? stageParam : 'all')
  const [jobFilter, setJobFilter] = useState<string>('live')

  const [toast, setToast] = useState<Toast | null>(null)
  // The live toast also sits in a ref, so finishing it runs its side effect
  // exactly once. Doing it inside a state updater would not: React may call an
  // updater twice, and the candidate would get two bell notices.
  const toastRef = useRef<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The toast is fixed over the foot of the page, so while it shows the page
  // gets that much more room at the bottom — measured, because the message can
  // wrap to two lines — and the last card's buttons can always scroll clear.
  const toastEl = useRef<HTMLDivElement | null>(null)
  const [toastSpace, setToastSpace] = useState(0)
  useLayoutEffect(() => {
    setToastSpace(toast && toastEl.current ? Math.ceil(toastEl.current.getBoundingClientRect().height) + 16 : 0)
  }, [toast])
  // Not a fit updates still owed by this page. Sent on expiry, on leaving, on hiding.
  const owed = useRef<Set<string>>(new Set())

  const [scheduleRow, setScheduleRow] = useState<ApplicantRow | null>(null)
  const [offerRow, setOfferRow] = useState<ApplicantRow | null>(null)
  const [declineRow, setDeclineRow] = useState<ApplicantRow | null>(null)

  const liveJobIds = useMemo(() => new Set(jobs.filter(j => j.status === 'active').map(j => j.id)), [jobs])

  // ── which applications are in view ──
  // Default: live adverts only (decision 6). A closed advert's applicants are
  // reachable by choosing that advert.
  const inJob = useCallback((r: ApplicantRow) =>
    jobFilter === 'live' ? liveJobIds.has(r.jobId) : r.jobId === jobFilter, [jobFilter, liveJobIds])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    LISTED_STAGES.forEach(s => { c[s] = 0 })
    rows.forEach(r => { if (inJob(r) && isListed(r.stage)) { c[r.stage]++; c.all++ } })
    return c
  }, [rows, inJob])

  const visible = useMemo(() => rows
    .filter(r => inJob(r) && isListed(r.stage) && (stage === 'all' || r.stage === stage))
    .sort((a, b) => (daysWaiting(b.stageEnteredAt) ?? -1) - (daysWaiting(a.stageEnteredAt) ?? -1)),
  [rows, inJob, stage])

  const selected = useMemo(() => rows.find(r => r.id === selectedId) || null, [rows, selectedId])

  // ── sending what is owed ──
  const sendOwed = useCallback((id: string, how: 'fetch' | 'beacon') => {
    if (!owed.current.has(id)) return
    owed.current.delete(id)
    const url = `/api/applications/${id}/not-a-fit`
    const body = JSON.stringify({ action: 'send' })
    if (how === 'beacon' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))
    } else {
      fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {})
    }
  }, [])

  const finishToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = null
    const t = toastRef.current
    toastRef.current = null
    setToast(null)
    t?.finish?.()
  }, [])

  useEffect(() => {
    // Hidden or closing: owed updates go by beacon FIRST (nothing else reliably
    // runs then), and only then is the toast finished — so its finish finds
    // nothing left to send, and a pending Shortlist / Mark hired is written.
    const flush = () => {
      Array.from(owed.current).forEach(id => sendOwed(id, 'beacon'))
      finishToast()
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      // Leaving the page inside the Undo window: Undo is no longer possible.
      finishToast()
      Array.from(owed.current).forEach(id => sendOwed(id, 'fetch'))
    }
  }, [sendOwed, finishToast])

  const showToast = useCallback((t: Toast) => {
    // One Undo at a time: whatever was showing becomes final now.
    finishToast()
    toastRef.current = t
    setToast(t)
    toastTimer.current = setTimeout(finishToast, UNDO_MS)
  }, [finishToast])

  const patchRow = (id: string, patch: Partial<ApplicantRow>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))

  const nameFor = (r: ApplicantRow) => r.name || 'This applicant'

  // ── Shortlist / Mark hired: shown now, written when Undo runs out ──
  const move = (r: ApplicantRow, to: 'shortlisted' | 'hired') => {
    const prev = { status: r.status, stage: r.stage, stageEnteredAt: r.stageEnteredAt }
    const restore = () => patchRow(r.id, { status: prev.status, stage: prev.stage, stageEnteredAt: prev.stageEnteredAt })
    patchRow(r.id, { status: to, stage: stageOf(to), stageEnteredAt: new Date().toISOString() })
    showToast({
      text: toastMoved(nameFor(r), stageOf(to)),
      // Nothing was written, so Undo only puts the screen back.
      undo: restore,
      // Undo is gone: write it (as the employer — RLS applies, the status log
      // names them), and only then tell the candidate.
      finish: () => {
        const now = new Date().toISOString()
        supabase.from('job_applications')
          .update({ status: to, stage_entered_at: now, status_updated_at: now })
          .eq('id', r.id)
          .eq('status', prev.status)
          .select('id')
          .then(({ data: done, error }) => {
            if (error || !done?.length) {
              restore()
              showToast({ text: `Couldn't move ${nameFor(r)}. Please try again.` })
              return
            }
            notify('status_changed', { applicationId: r.id, extra: { status: to } }).catch(() => {})
          })
      },
    })
  }

  // ── Not a fit ──
  const notAFit = async (r: ApplicantRow) => {
    if (data.reviewRejection) { setDeclineRow(r); return }
    const res = await fetch(`/api/applications/${r.id}/not-a-fit`, { method: 'POST', body: JSON.stringify({ action: 'decline' }) })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      showToast({ text: `Couldn't mark ${nameFor(r)} as not a fit. Please try again.` })
      return
    }
    // Owed, not applied: the stored status is untouched until the send.
    const prev = { stage: r.stage, stageEnteredAt: r.stageEnteredAt }
    patchRow(r.id, { stage: 'not_a_fit', stageEnteredAt: new Date().toISOString(), noticeOwed: true })
    owed.current.add(r.id)
    showToast({
      text: toastNotAFit(nameFor(r)),
      undo: async () => {
        owed.current.delete(r.id)
        const u = await fetch(`/api/applications/${r.id}/not-a-fit`, { method: 'POST', body: JSON.stringify({ action: 'undo' }) })
        if (u.ok) {
          patchRow(r.id, { stage: prev.stage, stageEnteredAt: prev.stageEnteredAt, noticeOwed: false })
        } else {
          showToast({ text: `The update to ${nameFor(r)} had already been sent.` })
        }
      },
      finish: () => {
        if (owed.current.has(r.id)) sendOwed(r.id, 'fetch')
        patchRow(r.id, { status: 'rejected', noticeOwed: false, noticeSent: true })
      },
    })
  }

  const next = (r: ApplicantRow) => {
    if (!isListed(r.stage)) return
    const step = NEXT_STEP[r.stage]
    if ('to' in step) move(r, step.to)
    else if (step.flow === 'interview') setScheduleRow(r)
    else setOfferRow(r)
  }

  const openRow = (r: ApplicantRow) => router.push(`/applied?app=${r.id}`, { scroll: false })

  const liveJobs = jobs.filter(j => j.status === 'active')
  const closedJobs = jobs.filter(j => j.status !== 'active')
  const hasApplicantsAnywhere = rows.length > 0

  return (
    <main className={styles.page}>
      <Header />
      <div
        className={`${styles.layout} ${selectedId ? styles.hasSelection : ''}`}
        style={toastSpace ? { paddingBottom: `calc(32px + ${toastSpace}px)` } : undefined}
      >
        <section className={styles.listPane} aria-label="Applicants">
          <h1 className={styles.title}>Applicants</h1>

          <div className={styles.controls}>
            <label className={styles.jobFilter}>
              <span className={styles.srOnly}>Job ad</span>
              {/* What the pill SHOWS: an ordinary span, so a long title ends in
                  "…" in WebKit too. The select over it is transparent. */}
              <span className={styles.jobFilterShown} aria-hidden="true">
                {jobFilter === 'live' ? 'All job ads' : (jobs.find(j => j.id === jobFilter)?.title || 'Job ad')}
              </span>
              <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
                <option value="live">All job ads</option>
                {liveJobs.length > 0 && (
                  <optgroup label="Live">
                    {liveJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </optgroup>
                )}
                {closedJobs.length > 0 && (
                  <optgroup label="Closed">
                    {closedJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </optgroup>
                )}
              </select>
            </label>

            {/* CONTROLS WRAP (the house rule; agreed with Claude Design): 40
                tall, 8 apart, never a sideways-scrolling row. */}
            <div className={styles.chips} role="group" aria-label="Stage">
              {(['all', ...LISTED_STAGES] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  className={styles.chip}
                  aria-pressed={stage === s}
                  onClick={() => setStage(s)}
                >
                  <span>{s === 'all' ? 'All' : STAGE_LABEL[s]}</span>
                  <span className={styles.chipCount}>{counts[s] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className={styles.empty}>Loading applicants…</p>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              <p>{stage === 'all' ? EMPTY_ALL : emptyStage(stage)}</p>
              {!hasApplicantsAnywhere && liveJobs.length === 0 && (
                <Link href="/my-jobs" className={styles.primaryLink}>Post a job</Link>
              )}
            </div>
          ) : (
            <ul className={styles.cards}>
              {visible.map(r => {
                const days = daysWaiting(r.stageEnteredAt)
                const step = isListed(r.stage) ? NEXT_STEP[r.stage] : null
                return (
                  <li key={r.id} className={`${styles.card} ${r.id === selectedId ? styles.cardSelected : ''}`}>
                    <button type="button" className={styles.cardTop} onClick={() => openRow(r)}>
                      <span className={styles.avatar} aria-hidden="true">{initialsOf(r.name)}</span>
                      <span className={styles.cardWho}>
                        <span className={styles.cardName}>{r.name || 'Name not given'}</span>
                        <span className={styles.cardSub}>
                          <span className={styles.cardJob}>{r.jobTitle}</span>
                          <span className={styles.cardStage}>&nbsp;· {STAGE_LABEL[r.stage]}</span>
                        </span>
                      </span>
                      <span className={`${styles.wait} ${days !== null && days >= OVERDUE_DAYS ? styles.waitOverdue : ''}`}>
                        {waitLabel(days)}
                      </span>
                    </button>
                    <div className={styles.cardActions}>
                      {step && (
                        <button type="button" className={styles.nextBtn} onClick={() => next(r)}>{step.label}</button>
                      )}
                      <button type="button" className={styles.notFitLink} onClick={() => notAFit(r)}>Not a fit</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={styles.detailPane} aria-label="Applicant">
          {selected ? (
            <ApplicantDetail row={selected} onNext={next} onNotAFit={notAFit} />
          ) : selectedId && !loading ? (
            <div className={styles.detailEmpty}>
              <Link href="/applied" className={styles.backLink}>‹ Applicants</Link>
              <p>This application isn't on your account, or has been removed.</p>
            </div>
          ) : (
            <div className={styles.detailPlaceholder}>
              <p>Choose someone to see their application.</p>
            </div>
          )}
        </section>
      </div>

      {/* OUTSIDE BOTH PANES, fixed at the foot of the screen: on a phone the
          list pane is hidden while an applicant is open, and a toast inside it
          was an Undo nobody could see (Applicants.module.css, .toast). */}
      {toast && (
        <div className={styles.toast} role="status" ref={toastEl}>
          <span className={styles.toastText}>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className={styles.toastUndo}
              onClick={async () => {
                // Undo instead of finishing: the finish never runs.
                const t = toastRef.current
                if (toastTimer.current) clearTimeout(toastTimer.current)
                toastTimer.current = null
                toastRef.current = null
                setToast(null)
                await t?.undo?.()
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {scheduleRow && data.ownerId && (
        <ScheduleInterviewModal
          isOpen
          onClose={() => setScheduleRow(null)}
          applicationId={scheduleRow.id}
          jobId={scheduleRow.jobId}
          jobTitle={scheduleRow.jobTitle}
          company={data.companyName}
          candidateId={scheduleRow.candidateId}
          candidateName={scheduleRow.name || ''}
          candidateEmail={scheduleRow.email || undefined}
          onSuccess={(outcome) => {
            const first = scheduleRow.name?.split(' ')[0] || 'them'
            setScheduleRow(null)
            showToast({
              text: outcome === 'sent'
                ? `Moved to Interview. Booking link sent to ${first}.`
                : `Moved to Interview, but we couldn't email ${first} the booking link. It's in their Thrive messages.`,
            })
            data.reload()
          }}
        />
      )}

      {offerRow && data.ownerId && (
        <MakeOfferModal
          isOpen
          onClose={() => setOfferRow(null)}
          applicationId={offerRow.id}
          jobId={offerRow.jobId}
          jobTitle={offerRow.jobTitle}
          company={data.companyName}
          candidateId={offerRow.candidateId}
          candidateName={offerRow.name || ''}
          candidateEmail={offerRow.email || undefined}
          onSuccess={(outcome) => {
            const first = offerRow.name?.split(' ')[0] || 'them'
            setOfferRow(null)
            showToast({
              text: outcome === 'sent'
                ? `Offer sent to ${first}. Moved to Offer.`
                : `Offer sent to ${first}, but we couldn't email them. They'll see it in Thrive.`,
            })
            data.reload()
          }}
        />
      )}

      {declineRow && data.ownerId && (
        <DeclineModal
          applicationId={declineRow.id}
          candidateId={declineRow.candidateId}
          candidateEmail={declineRow.email}
          candidateName={declineRow.name || ''}
          jobTitle={declineRow.jobTitle}
          companyName={data.companyName}
          employerId={data.ownerId}
          onClose={() => setDeclineRow(null)}
          onDeclined={() => {
            const n = declineRow.name || 'This applicant'
            setDeclineRow(null)
            showToast({ text: `Marked ${n} as not a fit and sent your message.` })
            data.reload()
          }}
        />
      )}
    </main>
  )
}
