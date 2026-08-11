import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { jobDigestEmail } from '@/emails/job-digest'
import { generateDigestUnsubscribeToken } from '@/lib/jobDigestToken'
import { BASE_URL } from '@/emails/layout'
import {
  planFor,
  candidatePrefs,
  windowStart,
  FIRST_RUN_LOOKBACK_DAYS,
  MAX_JOBS_PER_EMAIL,
  type DigestCandidateRow,
  type DigestJobRow,
  type DigestPlan,
  type ExclusionReason,
} from '@/lib/jobDigest'

// "New jobs in your areas" — the candidate re-engagement digest.
//
// Modes, POST body { mode }:
//   'dry-run' (default) — work out exactly who would be emailed and with which
//                         jobs, render one real sample, then stop. Sends
//                         nothing, writes nothing. Safe to run repeatedly.
//   'test'              — send one rendered digest to ONE nominated address.
//                         Writes nothing. No real candidate is contacted.
//   'send'              — the real thing. Also requires confirm:'SEND'.
//
// Guarded by CRON_SECRET, fail-closed, and POST-only for the sending modes: a
// GET that mailed people would be one link-prefetch from an accidental campaign.
// GET exists as a read-only status view.
//
// Vercel's scheduler issues a GET, so the schedule in vercel.json points at
// ?mode=send&confirm=SEND — see the note on the GET handler below.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const CANDIDATE_SELECT =
  'user_id, email, full_name, preferred_areas, notification_preferences, last_digest_sent_at'
const JOB_SELECT =
  'id, title, company, location, salary_min, salary_max, salary_type, posted_at, created_at, area_region, area_county'

type Mode = 'dry-run' | 'test' | 'send'

const EMPTY_EXCLUSIONS: Record<ExclusionReason, number> = {
  'no-email': 0, 'unconfirmed': 0, 'digest-off': 0, 'no-areas': 0, 'not-due': 0, 'no-new-jobs': 0,
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /last_digest_sent_at/.test(error?.message || '')
}

/**
 * Load candidates, tolerating a not-yet-applied migration.
 *
 * Counting and rendering survive without the column — every candidate simply
 * reads as "never sent". Sending does NOT: with nowhere to record the send we
 * would mail people and then mail them the same jobs again on the next run.
 * So only `send` fails, and it fails loudly.
 */
async function loadCandidates(supabase: SupabaseClient) {
  const full = await supabase.from('candidate_profiles').select(CANDIDATE_SELECT)
  if (!full.error) {
    return { rows: (full.data || []) as unknown as DigestCandidateRow[], columnMissing: false, error: null }
  }
  if (!isMissingColumn(full.error)) {
    return { rows: [] as DigestCandidateRow[], columnMissing: false, error: full.error.message }
  }
  const bare = await supabase
    .from('candidate_profiles')
    .select('user_id, email, full_name, preferred_areas, notification_preferences')
  if (bare.error) return { rows: [] as DigestCandidateRow[], columnMissing: true, error: bare.error.message }
  const rows = (bare.data || []).map(r => ({ ...(r as object), last_digest_sent_at: null })) as unknown as DigestCandidateRow[]
  return { rows, columnMissing: true, error: null }
}

/** user_ids whose email address is confirmed. Paged, because listUsers is. */
async function confirmedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const confirmed = new Set<string>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    for (const u of data.users) {
      if (u.email_confirmed_at) confirmed.add(u.id)
    }
    if (data.users.length < 200) break
  }
  return confirmed
}

/**
 * Real, working unsubscribe link — ONLY for a genuine send. A dry run's output
 * gets pasted into reports and a test send lands in our own inbox; in both cases
 * a live token is one click from opting a real candidate out.
 */
function unsubscribeUrlFor(userId: string): string {
  return `${BASE_URL}/api/candidate/digest-unsubscribe?token=${generateDigestUnsubscribeToken(userId)}`
}

/**
 * A REAL, VALID token that cannot unsubscribe anybody — signed for the all-zero
 * user id, which is a legitimate UUID shape and never a real row, so redeeming
 * it lands on 'notfound' and changes nothing.
 *
 * It used to be the literal string SAMPLE_TOKEN_NOT_VALID. That was fine while
 * the URL was only a footer link a human might click, and is not fine now that
 * it also goes in the List-Unsubscribe-Post header: Gmail and Outlook POST that
 * URL themselves, unattended, and a header pointing at a URL that fails
 * verification is worse than no header at all.
 *
 * The fallback test path below already did exactly this. This just stops the
 * two disagreeing.
 */
function previewUnsubscribeUrl(): string {
  return unsubscribeUrlFor('00000000-0000-0000-0000-000000000000')
}

/** Returns the rendered email AND the unsubscribe URL it was built with, so the
 *  List-Unsubscribe header and the footer link can never point at different
 *  places. */
function renderPlan(plan: DigestPlan, opts: { live: boolean }) {
  const unsubscribeUrl = opts.live
    ? unsubscribeUrlFor(plan.row.user_id)
    : previewUnsubscribeUrl()
  return {
    ...jobDigestEmail({
      candidateName: plan.row.full_name,
      areaNames: plan.areaNames,
      jobs: plan.jobs,
      overflow: plan.overflow,
      unsubscribeUrl,
    }),
    unsubscribeUrl,
  }
}

async function build(supabase: SupabaseClient, now: Date) {
  const { rows, columnMissing, error } = await loadCandidates(supabase)
  if (error) return { error, columnMissing, plans: [], exclusions: EMPTY_EXCLUSIONS, rows: [], activeJobs: [] as DigestJobRow[] }

  const jobsResult = await supabase.from('jobs').select(JOB_SELECT).eq('status', 'active')
  if (jobsResult.error) {
    return { error: jobsResult.error.message, columnMissing, plans: [], exclusions: EMPTY_EXCLUSIONS, rows, activeJobs: [] as DigestJobRow[] }
  }
  const activeJobs = (jobsResult.data || []) as unknown as DigestJobRow[]

  const confirmed = await confirmedUserIds(supabase)

  const plans: DigestPlan[] = []
  const exclusions = { ...EMPTY_EXCLUSIONS }
  for (const row of rows) {
    const { plan, reason } = planFor(row, activeJobs, confirmed, now)
    if (plan) plans.push(plan)
    else if (reason) exclusions[reason] += 1
  }

  return { error: null, columnMissing, plans, exclusions, rows, activeJobs }
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

  const now = new Date()
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error, columnMissing, plans, exclusions, rows, activeJobs } = await build(supabase, now)

  if (error) return NextResponse.json({ error: 'Failed to build digest: ' + error }, { status: 500 })
  if (columnMissing && mode === 'send') {
    return NextResponse.json(
      {
        error: 'candidate_profiles.last_digest_sent_at does not exist — refusing to send. ' +
          'Apply supabase/migrations/20260727071903_candidate_last_digest_sent_at.sql first, ' +
          'otherwise every run would resend the same jobs.',
      },
      { status: 409 },
    )
  }

  const summary = {
    mode,
    migrationApplied: !columnMissing,
    candidatesTotal: rows.length,
    activeJobs: activeJobs.length,
    newestJobCreatedAt: activeJobs.reduce<string | null>(
      (max, j) => (j.created_at && (!max || j.created_at > max) ? j.created_at : max), null),
    wouldEmailCount: plans.length,
    excluded: exclusions,
    firstRunLookbackDays: FIRST_RUN_LOOKBACK_DAYS,
    maxJobsPerEmail: MAX_JOBS_PER_EMAIL,
  }

  // ── dry run: decide everything, touch nothing ──────────────────────
  if (mode === 'dry-run') {
    const sample = plans[0] ? renderPlan(plans[0], { live: false }) : null
    return NextResponse.json({
      ...summary,
      wouldEmail: plans.map(p => ({
        email: p.row.email,
        name: p.row.full_name,
        areas: p.areaNames,
        frequency: candidatePrefs(p.row).frequency,
        jobCount: p.jobs.length,
        overflow: p.overflow,
        since: windowStart(p.row, now).toISOString(),
        firstEver: !p.row.last_digest_sent_at,
        jobTitles: p.jobs.map(j => j.title),
      })),
      sample: sample ? { subject: sample.subject, html: sample.html } : null,
      sent: 0,
      note: 'Dry run — no email sent, no row written.',
    })
  }

  // ── test: one address, nothing recorded ────────────────────────────
  if (mode === 'test') {
    // Prefer a real candidate's plan so the test shows genuine listings. Fall
    // back to the newest active jobs when nobody is currently due, so a test
    // is still possible on a quiet week — labelled in the response so the
    // rendered email is never mistaken for a real audience.
    const realPlan = plans[0]
    const fallbackJobs = [...activeJobs]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, MAX_JOBS_PER_EMAIL)

    if (!realPlan && fallbackJobs.length === 0) {
      return NextResponse.json({ ...summary, sent: 0, error: 'No active jobs at all — nothing to render.' }, { status: 409 })
    }

    const fallbackUnsubscribeUrl = previewUnsubscribeUrl()
    const { subject, html, unsubscribeUrl } = realPlan
      ? renderPlan(realPlan, { live: false })
      : {
          ...jobDigestEmail({
            candidateName: typeof body.testName === 'string' ? body.testName : 'Alex',
            areaNames: ['your areas'],
            jobs: fallbackJobs,
            overflow: 0,
            // Signed for a non-existent user: genuinely clickable, exercises the
            // real route, cannot unsubscribe anybody.
            unsubscribeUrl: fallbackUnsubscribeUrl,
          }),
          unsubscribeUrl: fallbackUnsubscribeUrl,
        }

    // The test carries the header too, with the inert-but-valid token, so this
    // path proves the header end to end without risking a real opt-out.
    const result = await sendEmail(body.testTo, subject, html, undefined, undefined, { unsubscribeUrl, emailType: 'job_digest_test' })
    return NextResponse.json({
      ...summary,
      testTo: body.testTo,
      renderedFrom: realPlan ? 'a real candidate plan' : 'newest active jobs (nobody is currently due)',
      sent: result.success ? 1 : 0,
      sendError: result.error,
      note: 'Test send only — no real candidate was contacted and no row was written.',
    })
  }

  // ── send: the real thing ───────────────────────────────────────────
  const sentTo: string[] = []
  const failed: { email: string | null; error?: string }[] = []

  for (const plan of plans) {
    const { subject, html, unsubscribeUrl } = renderPlan(plan, { live: true })
    const result = await sendEmail(plan.row.email!, subject, html, undefined, undefined, { unsubscribeUrl, emailType: 'job_digest' })
    if (!result.success) {
      failed.push({ email: plan.row.email, error: result.error })
      continue
    }

    // Stamp only after a confirmed send. If this write fails the candidate has
    // been emailed but not stamped, so the next run may repeat those jobs —
    // annoying, but the right way round: the alternative is stamping first and
    // silently swallowing a digest nobody received.
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ last_digest_sent_at: now.toISOString() })
      .eq('user_id', plan.row.user_id)
    if (writeError) {
      console.error('[job-digest] emailed but not stamped', plan.row.user_id, writeError.message)
      failed.push({ email: plan.row.email, error: 'emailed but not stamped: ' + writeError.message })
      continue
    }
    sentTo.push(plan.row.email!)
  }

  return NextResponse.json({
    ...summary,
    sent: sentTo.length,
    sentTo,
    failed,
    note: 'Digest sent. Each recipient is stamped, so the next run only considers jobs created after this one.',
  })
}

/**
 * Read-only status by default — safe to open, sends nothing.
 *
 * Vercel Cron issues a GET with the CRON_SECRET as a bearer token and cannot
 * send a body, so the scheduled entry carries ?mode=send&confirm=SEND. The same
 * two-key requirement as POST applies: a bare GET, or one missing either
 * parameter, only reports.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const wantsSend = url.searchParams.get('mode') === 'send' && url.searchParams.get('confirm') === 'SEND'

  const now = new Date()
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error, columnMissing, plans, exclusions, rows, activeJobs } = await build(supabase, now)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const summary = {
    migrationApplied: !columnMissing,
    candidatesTotal: rows.length,
    activeJobs: activeJobs.length,
    dueNow: plans.length,
    excluded: exclusions,
  }

  if (!wantsSend) {
    return NextResponse.json({ ...summary, mode: 'status', sent: 0, note: 'Status only — nothing sent.' })
  }
  if (columnMissing) {
    return NextResponse.json({ ...summary, error: 'last_digest_sent_at missing — refusing to send.' }, { status: 409 })
  }

  const sentTo: string[] = []
  const failed: { email: string | null; error?: string }[] = []
  for (const plan of plans) {
    const { subject, html, unsubscribeUrl } = renderPlan(plan, { live: true })
    const result = await sendEmail(plan.row.email!, subject, html, undefined, undefined, { unsubscribeUrl, emailType: 'job_digest' })
    if (!result.success) {
      failed.push({ email: plan.row.email, error: result.error })
      continue
    }
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ last_digest_sent_at: now.toISOString() })
      .eq('user_id', plan.row.user_id)
    if (writeError) {
      console.error('[job-digest] emailed but not stamped', plan.row.user_id, writeError.message)
      failed.push({ email: plan.row.email, error: 'emailed but not stamped: ' + writeError.message })
      continue
    }
    sentTo.push(plan.row.email!)
  }

  return NextResponse.json({ ...summary, mode: 'send', sent: sentTo.length, sentTo, failed })
}
