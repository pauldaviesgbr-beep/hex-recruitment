'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Ico } from '@/components/icons'
import styles from './ReportControl.module.css'

// ONE REPORT CONTROL, USED EVERYWHERE.
//
// ── WHY THIS IS A SHARED COMPONENT AND NOT A BLOCK OF JSX ────────────────
//
// A candidate can reach a job advert through SEVEN different renderers:
// /job/[id], the inline detail panes on /jobs, /jobs/recommended,
// /jobs/sector/[sector], /jobs/[city] and /saved-jobs, and this modal's own
// parent, components/JobDetailModal. On 1 Sept 2026 the right-to-work line was
// added to two of those seven and an employer was told it was live — because
// nobody knew there were seven.
//
// So the report control is ONE component. Seven copies of a reason list is
// seven chances for them to drift, and `reportcontrol:prove` asserts that every
// advert renderer mounts this and not a variant of it.
//
// ── THE WRITE GOES STRAIGHT TO THE DATABASE, ON PURPOSE ──────────────────
//
// There is no /api/report. `content_reports` has an RLS policy that allows an
// authenticated person to insert a row as themselves and read only their own
// back — so the rule lives in one place, at the database, where a route could
// not be forgotten or bypassed. A route would add a second definition of who
// may file a report, which is the failure this codebase spent 1 Sept 2026
// cataloguing.

export type ReportTarget = 'job' | 'message'

// THE REASONS ARE FIXED, NOT FREE TEXT. A free-text-only report is unreadable
// in aggregate and gives the person no idea what we act on. The detail box is
// optional and additional.
const REASONS: Record<ReportTarget, string[]> = {
  job: [
    'It looks fake or misleading',
    'It is not a real job',
    'It asks for money or personal documents',
    'It is offensive or discriminatory',
    'It is a duplicate of another advert',
    'Something else',
  ],
  message: [
    'It is abusive or threatening',
    'It is offensive or discriminatory',
    'It is spam or a scam',
    'It asks for money or personal documents',
    'Something else',
  ],
}

const LABEL: Record<ReportTarget, string> = {
  job: 'Report this job',
  message: 'Report this conversation',
}

export default function ReportControl({
  targetType,
  targetId,
  className,
}: {
  targetType: ReportTarget
  targetId: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!reason) { setError('Choose a reason so we know what to look at.'); return }
    setSending(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in to report something.')
        setSending(false)
        return
      }
      // reporter_id is set explicitly AND enforced by RLS (reporter_id =
      // auth.uid()). Sending it is not the security boundary — the policy is.
      const { error: insErr } = await supabase.from('content_reports').insert({
        reporter_id: session.user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        detail: detail.trim() || null,
      })
      if (insErr) throw insErr
      setDone(true)
    } catch (e: any) {
      // NAMED, NOT SWALLOWED. A report that silently fails is worse than no
      // report control: the person believes they have told us.
      setError(e?.message || 'We could not send that. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const close = () => {
    setOpen(false)
    // Reset only if it was never sent, so re-opening after a success still
    // shows the confirmation rather than an empty form they might fill twice.
    if (!done) { setReason(''); setDetail(''); setError(null) }
  }

  return (
    <>
      <button
        type="button"
        className={className || styles.trigger}
        onClick={() => setOpen(true)}
        data-report-control={targetType}
      >
        <Ico name="flag" size={16} /> {done ? 'Reported' : LABEL[targetType]}
      </button>

      {open && (
        <div className={styles.backdrop} role="presentation" onClick={close}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reportControlTitle"
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              <>
                <h2 id="reportControlTitle" className={styles.title}>Thanks — we have it</h2>
                <p className={styles.body}>
                  Someone will look at this. We do not tell the other party who reported them.
                </p>
                <button type="button" className={styles.primary} onClick={close}>Close</button>
              </>
            ) : (
              <>
                <h2 id="reportControlTitle" className={styles.title}>{LABEL[targetType]}</h2>
                <p className={styles.body}>
                  Tell us what is wrong and we will look at it. We do not tell the other party
                  who reported them.
                </p>

                <fieldset className={styles.reasons}>
                  <legend className={styles.legend}>What is the problem?</legend>
                  {REASONS[targetType].map(r => (
                    <label key={r} className={styles.reason}>
                      <input
                        type="radio"
                        name="reportReason"
                        value={r}
                        checked={reason === r}
                        onChange={() => { setReason(r); setError(null) }}
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </fieldset>

                <label className={styles.detailLabel} htmlFor="reportDetail">
                  Anything else? (optional)
                </label>
                <textarea
                  id="reportDetail"
                  className={styles.detail}
                  rows={3}
                  value={detail}
                  onChange={e => setDetail(e.target.value)}
                  maxLength={1000}
                />

                {error && <p className={styles.error} role="alert">{error}</p>}

                <div className={styles.actions}>
                  {/* type="button" throughout, and no <form>. This page carries a
                      header, a chat widget and a cookie banner that all use
                      type="submit"; a form here would put this control into that
                      pile where a stray Enter could reach it. */}
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={submit}
                    disabled={sending || !reason}
                  >
                    {sending ? 'Sending…' : 'Send report'}
                  </button>
                  <button type="button" className={styles.secondary} onClick={close} disabled={sending}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
