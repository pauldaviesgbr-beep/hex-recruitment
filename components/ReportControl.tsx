'use client'

import { useEffect, useState } from 'react'
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

// THE THREE SURFACES THAT CARRY CONTENT A USER CAN MEET.
//
// `comment` was missing from the first pass because the build was scoped to
// what could be FILMED, and a shift comment could not be — there has never been
// one. That was the wrong test: our own age-rating declaration to Apple lists
// shift comments as user-generated content, so omitting it would have had us
// declaring user content in one document and denying it in another.
//
// KEEP THIS IN STEP WITH THE DATABASE. content_reports.target_type has a CHECK
// constraint listing the same three values; a fourth added here without the
// migration is refused at insert time, which is the loud direction — but it
// would be refused only once somebody tapped it.
export type ReportTarget = 'job' | 'message' | 'comment'

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
  comment: [
    'It is abusive or threatening',
    'It is offensive or discriminatory',
    'It is spam or an advert',
    'It shares someone’s personal details',
    'Something else',
  ],
}

const LABEL: Record<ReportTarget, string> = {
  job: 'Report this job',
  message: 'Report this conversation',
  comment: 'Report',
}

// ICON-ONLY IS FOR A BAR, NOT FOR PROSE.
//
// In the conversation header this and BlockControl were two full-text buttons
// sharing one row with a back arrow, an avatar, the correspondent's name and
// their role. Measured on an iPhone 14 Pro profile: unwrapped the two need
// 303px of a 393px bar, so BOTH wrapped to 2.8 lines each and dragged the name
// and the role into wrapping with them — a 137px header, 20.8% of the visible
// screen, on the one screen a reviewer reads while deciding whether Thrive has
// working moderation.
//
// So the header gets icons and the SHEET keeps the words: the sheet's title is
// already the full label, so nothing is lost and nothing is duplicated. This
// is the conventional phone pattern and it is also the pattern this page had
// before the two labelled controls replaced it — `.headerActionBtn` was still
// declared in page.module.css, applied to nothing.
//
// AN ICON-ONLY CONTROL MUST CARRY ITS NAME. `aria-label` and `title` both get
// the same label a sighted person would have read, so the accessible name does
// not change with the presentation.
export default function ReportControl({
  targetType,
  targetId,
  className,
  iconOnly = false,
}: {
  targetType: ReportTarget
  targetId: string
  className?: string
  iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // WHICH MOUNT WROTE IT. `done` says a report exists; it does not say whether
  // THIS mount is the one that filed it, and the two need different words.
  // Without this, re-opening a reported target showed "Thanks — we have it" —
  // an acknowledgement of something just done — so a second tap looked exactly
  // like a second successful filing. On 6 Sept 2026 that is precisely what
  // happened on camera: two taps, two identical thanks screens, and ONE row in
  // content_reports. The refusal was correct and the screen made it invisible.
  const [justSent, setJustSent] = useState(false)
  const [reportedAt, setReportedAt] = useState<string | null>(null)

  // "REPORTED" MUST SURVIVE A REMOUNT, so it is READ BACK, not remembered.
  // `done` alone is component memory: it never survived navigating away and
  // back, on any surface, since the control was built — every proof passed
  // because every proof read the label on the mount that wrote it. Found
  // 3 Sept 2026 by a person re-opening an advert they had just reported and
  // seeing "Report this job". RLS already grants the reporter SELECT on
  // their own rows — blockrefuses proves "the reporter can read their own
  // back" through a real session on every verify — so this asks the table
  // the same question the submit answered.
  //
  // .limit(1) and read the array, NOT maybeSingle(): the pre-read-back era
  // allowed duplicate filings, so a second row must render as "Reported",
  // not as a thrown "multiple rows" error.
  useEffect(() => {
    let stale = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || stale) return
      const { data } = await supabase.from('content_reports')
        .select('id, created_at')
        .eq('reporter_id', session.user.id)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (!stale && (data?.length ?? 0) > 0) {
        setDone(true)
        setReportedAt(data![0].created_at as string)
      }
    })()
    return () => { stale = true }
  }, [targetType, targetId])

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
      setJustSent(true)
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
        /* THE STATE IS ITS OWN ATTRIBUTE. `data-report-control` carries the
           TYPE and reportcontrol:prove keys on it, so the state cannot be
           overloaded onto it without breaking a check that is about placement. */
        data-reported={done ? 'yes' : 'no'}
        aria-pressed={done}
        aria-label={iconOnly ? (done ? 'Reported' : LABEL[targetType]) : undefined}
        title={iconOnly ? (done ? 'Reported' : LABEL[targetType]) : undefined}
      >
        {iconOnly
          ? <Ico name="flag" size={20} />
          : <><Ico name="flag" size={16} /> {done ? 'Reported' : LABEL[targetType]}</>}
      </button>

      {open && (
        /* THE BACKDROP IS DEAF WHILE SENDING, same as Cancel. It used to be
           live for the whole flight of the insert, so one stray tap closed
           the sheet silently and the thanks screen rendered into nothing —
           the person's report landed and nothing ever said so. */
        <div className={styles.backdrop} role="presentation" onClick={sending ? undefined : close}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reportControlTitle"
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              /* TWO DIFFERENT SENTENCES FOR TWO DIFFERENT FACTS. "Thanks — we
                 have it" acknowledges something just done; saying it to
                 somebody re-opening a target they reported yesterday tells
                 them they have just filed again, which is false. The second
                 branch is a RECALL, and it says when. */
              <>
                <h2 id="reportControlTitle" className={styles.title}>
                  {justSent ? 'Thanks — we have it' : 'You have already reported this'}
                </h2>
                <p className={styles.body}>
                  {justSent
                    ? 'Someone will look at this. We do not tell the other party who reported them.'
                    : `We have your report${reportedAt ? ` from ${new Date(reportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''} and someone will look at it. There is no need to send it again.`}
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
