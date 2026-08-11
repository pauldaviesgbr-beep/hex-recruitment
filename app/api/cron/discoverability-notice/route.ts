import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { discoverabilityNoticeEmail } from '@/emails/discoverability-notice'
import { generateStayHiddenToken, stayHiddenUrl } from '@/lib/stayHiddenToken'
import {
  parseNotice,
  markNotified,
  isEligibleForNotice,
  exclusionReason,
  formatDeadline,
  OPT_OUT_WINDOW_DAYS,
  type CandidateNoticeRow,
  type ExclusionReason,
} from '@/lib/discoverabilityNotice'

// STEP ONE of notify-then-flip: send the notice. This route never changes
// anybody's visibility — it only tells them it's going to change and records
// that we said so. The flip is /api/cron/discoverability-flip, and it refuses
// to act on any row this route hasn't stamped.
//
// Modes, POST body { mode }:
//   'dry-run' (default) — count, classify, render a sample. Sends nothing,
//                         writes nothing. Safe to run any number of times.
//   'test'              — send the rendered email to ONE nominated address.
//                         Writes nothing. Real candidates are not contacted.
//   'send'              — the real thing. Requires confirm:'SEND' as well, so
//                         a mistyped mode can't mass-mail 9 people.
//
// Guarded by CRON_SECRET, fail-closed, and POST-only: a GET that sent email
// would be one link-prefetch away from an accidental campaign.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SELECT = 'user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice'
const SELECT_WITHOUT_NOTICE = 'user_id, email, full_name, job_title, cv_url, is_discoverable'

type Mode = 'dry-run' | 'test' | 'send'

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /discoverability_notice/.test(error?.message || '')
}

/**
 * Load candidates, tolerating a not-yet-applied migration.
 *
 * Counting and rendering work fine without the column — nobody has been
 * notified yet, so every notice is empty anyway. Sending does NOT: without
 * somewhere to stamp notifiedAt we'd email people and have no record we did,
 * and the flip step would then refuse them forever. So `send` fails loudly
 * instead, and only `send`.
 */
async function loadRows(supabase: SupabaseClient) {
  const full = await supabase.from('candidate_profiles').select(SELECT)
  if (!full.error) {
    return { rows: (full.data || []) as unknown as CandidateNoticeRow[], columnMissing: false, error: null }
  }
  if (!isMissingColumn(full.error)) {
    return { rows: [] as CandidateNoticeRow[], columnMissing: false, error: full.error.message }
  }
  const bare = await supabase.from('candidate_profiles').select(SELECT_WITHOUT_NOTICE)
  if (bare.error) return { rows: [] as CandidateNoticeRow[], columnMissing: true, error: bare.error.message }
  const rows = (bare.data || []).map(r => ({ ...(r as object), discoverability_notice: null })) as unknown as CandidateNoticeRow[]
  return { rows, columnMissing: true, error: null }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const mode: Mode = body?.mode === 'send' || body?.mode === 'test' ? body.mode : 'dry-run'

  if (mode === 'send' && body?.confirm !== 'SEND') {
    return NextResponse.json(
      { error: "mode 'send' also requires confirm:'SEND' — refusing to mail real candidates without it" },
      { status: 400 },
    )
  }
  if (mode === 'test' && (typeof body?.testTo !== 'string' || !body.testTo.includes('@'))) {
    return NextResponse.json({ error: "mode 'test' requires testTo:'you@example.com'" }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { rows, columnMissing, error } = await loadRows(supabase)
  if (error) {
    return NextResponse.json({ error: 'Failed to load candidates: ' + error }, { status: 500 })
  }
  if (columnMissing && mode === 'send') {
    return NextResponse.json(
      {
        error: 'candidate_profiles.discoverability_notice does not exist — refusing to send. ' +
          'Apply supabase/migrations/20260726100000_candidate_discoverability_notice.sql first, ' +
          'otherwise candidates would be emailed with no record that notice was given.',
      },
      { status: 409 },
    )
  }

  const hidden = rows.filter(r => !r.is_discoverable)
  const allEligible = hidden.filter(isEligibleForNotice)

  // ── onlyEmail: SEND TO EXACTLY ONE PERSON ─────────────────────────
  //
  // Without this there is no way to test the real send path. `testTo` belongs
  // to test mode, which mints the all-zero token — so the only way to exercise
  // a REAL token was to mail the whole cohort. That is how a proposed
  // one-person experiment turned out to be a dispatch to thirteen real
  // candidates who would not have included the person asking for it.
  //
  // IT REFUSES RATHER THAN FALLING THROUGH. If the address matches nobody the
  // request is rejected with the eligible count, and NOT ONE email is sent. A
  // scoping parameter that silently does not apply is worse than no parameter:
  // the failure mode is the exact accident it exists to prevent.
  const onlyEmail = typeof body?.onlyEmail === 'string' ? body.onlyEmail.trim().toLowerCase() : null
  const eligible = onlyEmail
    ? allEligible.filter(r => (r.email || '').trim().toLowerCase() === onlyEmail)
    : allEligible

  if (onlyEmail && eligible.length === 0) {
    return NextResponse.json({
      error: `onlyEmail '${onlyEmail}' matched none of the ${allEligible.length} eligible candidates — refusing to send.`,
      eligibleCount: allEligible.length,
      sent: 0,
    }, { status: 400 })
  }

  // Counts by reason — "13 excluded" only means something if you can say why.
  const excluded: Record<ExclusionReason, number> = {
    'already-discoverable': 0, 'nothing-to-show': 0, 'no-email': 0, 'already-notified': 0, 'opted-out': 0,
  }
  for (const r of hidden) {
    const reason = exclusionReason(r)
    if (reason) excluded[reason] += 1
  }

  const summary = {
    mode,
    candidatesTotal: rows.length,
    discoverableAlready: rows.length - hidden.length,
    hiddenTotal: hidden.length,
    eligible: eligible.length,
    excluded,
    optOutWindowDays: OPT_OUT_WINDOW_DAYS,
    migrationApplied: !columnMissing,
  }

  // ── dry run: render one sample, touch nothing ──────────────────────
  if (mode === 'dry-run') {
    const sampleDeadline = new Date(Date.now() + OPT_OUT_WINDOW_DAYS * 86_400_000).toISOString()
    const sample = eligible[0]
      ? discoverabilityNoticeEmail({
          candidateName: eligible[0].full_name,
          deadlineText: formatDeadline(sampleDeadline),
          // A deliberately unusable placeholder: a dry run must not mint a
          // working opt-out link for a real candidate.
          stayHiddenUrl: stayHiddenUrl('SAMPLE_TOKEN_NOT_VALID'),
        })
      : null
    return NextResponse.json({
      ...summary,
      wouldEmail: eligible.map(r => ({ email: r.email, name: r.full_name, hasJobTitle: Boolean(r.job_title?.trim()), hasCv: Boolean(r.cv_url?.trim()) })),
      sample: sample ? { subject: sample.subject, html: sample.html } : null,
      sent: 0,
      note: 'Dry run — no email sent, no row written.',
    })
  }

  // ── test: one address, nothing recorded ────────────────────────────
  if (mode === 'test') {
    const deadline = new Date(Date.now() + OPT_OUT_WINDOW_DAYS * 86_400_000).toISOString()
    const { subject, html } = discoverabilityNoticeEmail({
      candidateName: typeof body.testName === 'string' ? body.testName : 'Alex',
      deadlineText: formatDeadline(deadline),
      // Signed for a non-existent user so the link is genuinely clickable and
      // exercises the real route, but cannot opt anybody out.
      stayHiddenUrl: stayHiddenUrl(generateStayHiddenToken('00000000-0000-0000-0000-000000000000')),
    })
    const result = await sendEmail(body.testTo, subject, html, undefined, undefined, { emailType: 'discoverability_notice_test' })
    return NextResponse.json({
      ...summary,
      testTo: body.testTo,
      sent: result.success ? 1 : 0,
      sendError: result.error,
      note: 'Test send only — no real candidate was contacted and no row was written.',
    })
  }

  // ── send: the real campaign ────────────────────────────────────────
  const sentTo: string[] = []
  const failed: { email: string | null; error?: string }[] = []

  for (const row of eligible) {
    const notice = markNotified()
    const { subject, html } = discoverabilityNoticeEmail({
      candidateName: row.full_name,
      deadlineText: formatDeadline(notice.deadlineAt!),
      stayHiddenUrl: stayHiddenUrl(generateStayHiddenToken(row.user_id)),
    })

    const result = await sendEmail(row.email!, subject, html, undefined, undefined, { emailType: 'discoverability_notice' })
    if (!result.success) {
      failed.push({ email: row.email, error: result.error })
      continue
    }

    // Stamp only after a confirmed send. If this write fails the candidate has
    // been emailed but not recorded — which blocks their flip rather than
    // causing an unannounced one, the right way round to fail.
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ discoverability_notice: notice })
      .eq('user_id', row.user_id)
    if (writeError) {
      console.error('[discoverability-notice] emailed but not stamped', row.user_id, writeError.message)
      failed.push({ email: row.email, error: 'emailed but not stamped: ' + writeError.message })
      continue
    }
    sentTo.push(row.email!)
  }

  return NextResponse.json({
    ...summary,
    sent: sentTo.length,
    sentTo,
    failed,
    note: `Notice sent. Nobody is visible yet — run the flip after the ${OPT_OUT_WINDOW_DAYS}-day window.`,
  })
}

// A GET that reports without sending, so the campaign can be inspected safely.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { rows, columnMissing, error } = await loadRows(supabase)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const notified = rows.filter(r => parseNotice(r.discoverability_notice).notifiedAt)
  return NextResponse.json({
    migrationApplied: !columnMissing,
    candidatesTotal: rows.length,
    hidden: rows.filter(r => !r.is_discoverable).length,
    eligibleNow: rows.filter(isEligibleForNotice).length,
    notified: notified.length,
    optedOut: notified.filter(r => parseNotice(r.discoverability_notice).optedOutAt).length,
    flipped: notified.filter(r => parseNotice(r.discoverability_notice).flippedAt).length,
  })
}
