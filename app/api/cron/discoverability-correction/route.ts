import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { discoverabilityNoticeCorrectedEmail } from '@/emails/discoverability-notice-corrected'
import { generateStayHiddenToken, stayHiddenUrl } from '@/lib/stayHiddenToken'
import {
  parseNotice,
  markCorrected,
  isEligibleForCorrection,
  correctionExclusion,
  formatDeadline,
  OPT_OUT_WINDOW_DAYS,
  type CandidateNoticeRow,
  type CorrectionExclusion,
} from '@/lib/discoverabilityNotice'

// THE CORRECTION TO THE 26 JULY NOTICE.
//
// Nine people were told one click would keep their profile hidden. The link in
// that email pointed at the results page rather than the route that verifies a
// token, so every click rendered "invalid" and nothing was recorded. Ten days.
// This route tells the ones who have not since opted out that the link failed,
// gives them a working one, and moves their deadline to a real fortnight.
//
// A SEPARATE ROUTE FROM discoverability-notice, DELIBERATELY. Adding a mode to
// that one would mean the cohort depended on a branch, and a mistyped mode
// could mail the wrong set of people. Here the selector is the only one this
// file has, so it CANNOT reach anybody who was not notified in July.
//
// FRESH TOKENS, and this is the reason the whole thing is a send rather than a
// database update. The July tokens live 21 days from minting and expire on
// 16 August 12:18 UTC — eleven days from the correction, three days short of a
// fortnight. Reusing them would mean promising a date the link cannot reach,
// which is the fault we are apologising for, in a new costume. A token minted
// now outlives a 14-day deadline by a week, and their old link keeps working
// until 16 August as a harmless extra.
//
// Modes, POST body { mode }:
//   'dry-run' (default) — who it would reach and why the rest are excluded.
//                         Sends nothing, writes nothing.
//   'send'              — the real thing. Also requires confirm:'CORRECT'.
//   onlyEmail           — restrict to exactly one address, and REFUSE if it
//                         matches nobody rather than falling through to all.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SELECT = 'user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice'

async function loadRows(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('candidate_profiles').select(SELECT)
  if (error) return { rows: [] as CandidateNoticeRow[], error: error.message }
  return { rows: (data || []) as unknown as CandidateNoticeRow[], error: null }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const live = body?.mode === 'send'

  if (live && body?.confirm !== 'CORRECT') {
    return NextResponse.json(
      { error: "mode 'send' also requires confirm:'CORRECT' — refusing to mail real candidates without it" },
      { status: 400 },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { rows, error } = await loadRows(supabase)
  if (error) return NextResponse.json({ error: 'Failed to load candidates: ' + error }, { status: 500 })

  const allEligible = rows.filter(isEligibleForCorrection)

  const onlyEmail = typeof body?.onlyEmail === 'string' ? body.onlyEmail.trim().toLowerCase() : null
  const eligible = onlyEmail
    ? allEligible.filter(r => (r.email || '').trim().toLowerCase() === onlyEmail)
    : allEligible

  if (onlyEmail && eligible.length === 0) {
    return NextResponse.json({
      error: `onlyEmail '${onlyEmail}' matched none of the ${allEligible.length} candidates in the correction cohort — refusing to send.`,
      cohortSize: allEligible.length,
      sent: 0,
    }, { status: 400 })
  }

  // Why everybody else is out. Counted only across rows that were notified in
  // the first place — the 30-odd who never were are not "excluded" from a
  // correction, they are simply not part of this at all.
  const notified = rows.filter(r => parseNotice(r.discoverability_notice).notifiedAt)
  const excluded: Record<CorrectionExclusion, number> = {
    'not-notified': 0, 'opted-out': 0, 'already-corrected': 0,
    'already-discoverable': 0, 'nothing-to-show': 0, 'no-email': 0,
  }
  for (const r of notified) {
    const reason = correctionExclusion(r)
    if (reason) excluded[reason] += 1
  }

  const summary = {
    mode: live ? 'send' : 'dry-run',
    everNotified: notified.length,
    cohort: allEligible.length,
    targeted: eligible.length,
    excluded,
    optOutWindowDays: OPT_OUT_WINDOW_DAYS,
  }

  if (!live) {
    const sampleDeadline = new Date(Date.now() + OPT_OUT_WINDOW_DAYS * 86_400_000).toISOString()
    const sample = eligible[0]
      ? discoverabilityNoticeCorrectedEmail({
          candidateName: eligible[0].full_name,
          deadlineText: formatDeadline(sampleDeadline),
          // Unusable on purpose: a dry run must not mint a working opt-out
          // link for a real candidate.
          stayHiddenUrl: stayHiddenUrl('SAMPLE_TOKEN_NOT_VALID'),
        })
      : null
    return NextResponse.json({
      ...summary,
      wouldEmail: eligible.map(r => ({
        email: r.email,
        name: r.full_name,
        notifiedAt: parseNotice(r.discoverability_notice).notifiedAt,
        deadlineNow: parseNotice(r.discoverability_notice).deadlineAt,
        deadlineAfter: sampleDeadline,
      })),
      sample: sample ? { subject: sample.subject, html: sample.html } : null,
      sent: 0,
      note: 'Dry run — no email sent, no row written.',
    })
  }

  const sentTo: string[] = []
  const failed: { email: string | null; error?: string }[] = []

  for (const row of eligible) {
    const current = parseNotice(row.discoverability_notice)
    const next = markCorrected(current)
    const { subject, html } = discoverabilityNoticeCorrectedEmail({
      candidateName: row.full_name,
      deadlineText: formatDeadline(next.deadlineAt!),
      stayHiddenUrl: stayHiddenUrl(generateStayHiddenToken(row.user_id)),
    })

    const result = await sendEmail(row.email!, subject, html, undefined, undefined, { emailType: 'discoverability_correction' })
    if (!result.success) {
      failed.push({ email: row.email, error: result.error })
      continue
    }

    // Stamped only after a confirmed send, and the deadline moves in the same
    // write as correctedAt — a candidate who has been told the new date must
    // not be flippable on the old one.
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ discoverability_notice: next })
      .eq('user_id', row.user_id)
    if (writeError) {
      console.error('[discoverability-correction] emailed but not stamped', row.user_id, writeError.message)
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
    note: `Correction sent. Deadlines moved to ${OPT_OUT_WINDOW_DAYS} days from now; notifiedAt untouched.`,
  })
}

// Report without sending.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { rows, error } = await loadRows(supabase)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const notified = rows.filter(r => parseNotice(r.discoverability_notice).notifiedAt)
  return NextResponse.json({
    everNotified: notified.length,
    cohort: rows.filter(isEligibleForCorrection).length,
    optedOut: notified.filter(r => parseNotice(r.discoverability_notice).optedOutAt).length,
    corrected: notified.filter(r => parseNotice(r.discoverability_notice).correctedAt).length,
  })
}
