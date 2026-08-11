import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { rolesRoundupEmail } from '@/emails/roles-roundup'
// Same unsubscribe token and the same email.job_digest opt-in as the digest —
// one "stop these emails" answer covers both, which is what a candidate means
// when they click it.
import { generateDigestUnsubscribeToken } from '@/lib/jobDigestToken'
import { BASE_URL } from '@/emails/layout'
import type { DigestJobRow } from '@/lib/jobDigest'
import {
  planFor,
  buildIdf,
  markSent,
  dedupeByEmail,
  parseRoundupState,
  matchModeFor,
  ROLES_PER_EMAIL,
  CADENCE_DAYS,
  ROUNDUP_MEMORY,
  type RoundupCandidateRow,
  type RoundupPlan,
  type ExclusionReason,
} from '@/lib/rolesRoundup'

// "Roles for you this week" — recurring re-engagement over CURRENT inventory.
//
// Modes, POST body { mode }:
//   'dry-run' (default) — full audience split + a real rendered sample.
//                         Sends nothing, writes nothing.
//   'test'              — one email to ONE nominated address. Writes nothing.
//   'send'              — the real thing, and also requires confirm:'SEND'.
//
// CRON_SECRET, fail-closed. GET is status-only and has NO send path at all:
// unlike the digest this is not scheduled to send yet, so there is deliberately
// no way for a scheduler to trigger a campaign here.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// salary_min/salary_period feed the pay penalty; benefits feeds the
// compensating-benefit softener (live-in, no-lates, Mon–Fri). Without these
// columns selected the ranking silently degrades to "no salary stated" for
// everyone, which is a quiet failure rather than a loud one — so they are
// listed next to the fields they exist for.
const CANDIDATE_SELECT =
  'user_id, email, full_name, job_title, job_sector, preferred_areas, notification_preferences, roundup_state, salary_min, salary_period'
const JOB_SELECT =
  'id, title, company, location, salary_min, salary_max, salary_type, category, posted_at, created_at, area_region, area_county, benefits'

type Mode = 'dry-run' | 'test' | 'send'
type JobRow = DigestJobRow & { category?: string | null; benefits?: string[] | null }

const EMPTY_EXCLUSIONS: Record<ExclusionReason, number> = {
  'no-email': 0, 'unconfirmed': 0, 'digest-off': 0, 'no-signal': 0, 'not-due': 0, 'no-matches': 0,
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /roundup_state/.test(error?.message || '')
}

/** Tolerates a not-yet-applied migration for counting/rendering; `send` refuses. */
async function loadCandidates(supabase: SupabaseClient) {
  const full = await supabase.from('candidate_profiles').select(CANDIDATE_SELECT)
  if (!full.error) {
    return { rows: (full.data || []) as unknown as RoundupCandidateRow[], columnMissing: false, error: null }
  }
  if (!isMissingColumn(full.error)) {
    return { rows: [] as RoundupCandidateRow[], columnMissing: false, error: full.error.message }
  }
  const bare = await supabase
    .from('candidate_profiles')
    .select('user_id, email, full_name, job_title, job_sector, preferred_areas, notification_preferences, salary_min, salary_period')
  if (bare.error) return { rows: [] as RoundupCandidateRow[], columnMissing: true, error: bare.error.message }
  const rows = (bare.data || []).map(r => ({ ...(r as object), roundup_state: null })) as unknown as RoundupCandidateRow[]
  return { rows, columnMissing: true, error: null }
}

async function confirmedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const confirmed = new Set<string>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    for (const u of data.users) if (u.email_confirmed_at) confirmed.add(u.id)
    if (data.users.length < 200) break
  }
  return confirmed
}

/**
 * Real, working unsubscribe link — ONLY for a genuine send.
 *
 * Dry runs and test sends must never mint one of these for a real candidate:
 * a dry run's output gets pasted into reports and a test send lands in our own
 * inbox, and in both cases a live token is one click away from opting somebody
 * else out. Those paths use previewUnsubscribeUrl() instead.
 */
function unsubscribeUrlFor(userId: string): string {
  return `${BASE_URL}/api/candidate/digest-unsubscribe?token=${generateDigestUnsubscribeToken(userId)}`
}

/**
 * A REAL, VALID token that cannot unsubscribe anybody — signed for the all-zero
 * user id, which is a legitimate UUID shape and never a real row, so redeeming
 * it lands on 'notfound' and changes nothing.
 *
 * It used to be the literal string SAMPLE_TOKEN_NOT_VALID, which was fine while
 * the URL only appeared as a footer link a human might click. It is not fine now
 * that it also goes in the List-Unsubscribe-Post header: Gmail and Outlook POST
 * that URL themselves, unattended, and a header pointing at a URL that fails
 * verification is worse than no header — we would be advertising a one-click
 * unsubscribe that doesn't work and having the provider find out.
 *
 * Signing it properly means a test send carries a header that is structurally
 * and cryptographically correct, so it can be verified from a received message,
 * while still being incapable of opting out a real candidate.
 */
function previewUnsubscribeUrl(): string {
  return unsubscribeUrlFor('00000000-0000-0000-0000-000000000000')
}

/**
 * Browse link. Only ever uses parameters the board actually reads.
 *
 * It previously sent `?area=Greater London,Kent` and `?q=Executive Chef`, and
 * /jobs reads NEITHER — it accepts `search`, `city` and `id`. Both were silently
 * ignored, so every "browse" link in every roundup landed on the unfiltered
 * board. `search` is the one that genuinely filters, so profile-matched
 * candidates now get a real search for their job title.
 *
 * Area-matched candidates go to the plain board, because the filter behind their
 * match — preferred-area tokens, including "unresolved matches everyone" — is
 * not expressible in any URL the board understands. Linking to something
 * approximately right would be worse than linking to everything and saying so.
 */
function browseUrlFor(plan: RoundupPlan): string {
  const title = (plan.row.job_title || '').trim()
  if (plan.mode !== 'area' && title) {
    return `${BASE_URL}/jobs?search=${encodeURIComponent(title)}`
  }
  return `${BASE_URL}/jobs`
}

/** Returns the rendered email AND the unsubscribe URL it was built with, so the
 *  List-Unsubscribe header and the footer link can never disagree about where
 *  they point. */
function renderPlan(plan: RoundupPlan, opts: { live: boolean }) {
  const unsubscribeUrl = opts.live
    ? unsubscribeUrlFor(plan.row.user_id)
    : previewUnsubscribeUrl()
  return {
    ...rolesRoundupEmail({
      candidateName: plan.row.full_name,
      mode: plan.mode,
      areaNames: plan.areaNames,
      roleLabel: plan.row.job_title,
      jobs: plan.jobs,
      totalMatches: plan.totalMatches,
      unsubscribeUrl,
      browseUrl: browseUrlFor(plan),
    }),
    unsubscribeUrl,
  }
}

async function build(supabase: SupabaseClient, now: Date) {
  const { rows, columnMissing, error } = await loadCandidates(supabase)
  if (error) return { error, columnMissing, plans: [] as RoundupPlan[], exclusions: EMPTY_EXCLUSIONS, rows: [] as RoundupCandidateRow[], jobs: [] as JobRow[], collapsed: 0 }

  const jobsResult = await supabase.from('jobs').select(JOB_SELECT).eq('status', 'active')
  if (jobsResult.error) {
    return { error: jobsResult.error.message, columnMissing, plans: [] as RoundupPlan[], exclusions: EMPTY_EXCLUSIONS, rows, jobs: [] as JobRow[], collapsed: 0 }
  }
  const jobs = (jobsResult.data || []) as unknown as JobRow[]
  const idf = buildIdf(jobs)
  const confirmed = await confirmedUserIds(supabase)

  const built: RoundupPlan[] = []
  const exclusions = { ...EMPTY_EXCLUSIONS }
  for (const row of rows) {
    const { plan, reason } = planFor(row, jobs, idf, confirmed, now)
    if (plan) built.push(plan)
    else if (reason) exclusions[reason] += 1
  }

  // Applied here rather than at the send site so dry-run, test and send all
  // report and act on the same recipient list.
  const { kept: plans, collapsed } = dedupeByEmail(built)

  return { error: null, columnMissing, plans, exclusions, rows, jobs, collapsed }
}

function summarise(rows: RoundupCandidateRow[], jobs: JobRow[], plans: RoundupPlan[], exclusions: Record<ExclusionReason, number>, columnMissing: boolean, collapsed = 0) {
  return {
    migrationApplied: !columnMissing,
    candidatesTotal: rows.length,
    activeJobs: jobs.length,
    wouldEmailCount: plans.length,
    /** Plans dropped because another plan targeted the same address. */
    duplicateAddressesCollapsed: collapsed,
    audienceSplit: {
      areaMatched: plans.filter(p => p.mode === 'area').length,
      profileMatched: plans.filter(p => p.mode === 'profile').length,
      recycled: plans.filter(p => p.recycled).length,
    },
    // How many candidates COULD ever qualify, ignoring cadence and opt-in —
    // the ceiling this product has to work with.
    signalCeiling: {
      area: rows.filter(r => matchModeFor(r) === 'area').length,
      profile: rows.filter(r => matchModeFor(r) === 'profile').length,
      none: rows.filter(r => matchModeFor(r) === null).length,
    },
    excluded: exclusions,
    rolesPerEmail: ROLES_PER_EMAIL,
    cadenceDays: CADENCE_DAYS,
    antiRepeatMemory: ROUNDUP_MEMORY,
  }
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
  const { error, columnMissing, plans, exclusions, rows, jobs, collapsed } = await build(supabase, now)

  if (error) return NextResponse.json({ error: 'Failed to build roundup: ' + error }, { status: 500 })
  if (columnMissing && mode === 'send') {
    return NextResponse.json(
      {
        error: 'candidate_profiles.roundup_state does not exist — refusing to send. ' +
          'Apply supabase/migrations/20260727081532_candidate_roundup_state.sql first, ' +
          'otherwise every week would repeat the same eight roles.',
      },
      { status: 409 },
    )
  }

  const summary = { mode, ...summarise(rows, jobs, plans, exclusions, columnMissing, collapsed) }

  // ── dry run ────────────────────────────────────────────────────────
  if (mode === 'dry-run') {
    const sample = plans[0] ? renderPlan(plans[0], { live: false }) : null
    return NextResponse.json({
      ...summary,
      wouldEmail: plans.map(p => ({
        email: p.row.email,
        name: p.row.full_name,
        mode: p.mode,
        areas: p.areaNames,
        roleLabel: p.row.job_title,
        rolesListed: p.jobs.length,
        totalMatches: p.totalMatches,
        recycled: p.recycled,
        firstEver: !parseRoundupState(p.row.roundup_state).lastSentAt,
        titles: p.jobs.map(j => j.title),
      })),
      sample: sample ? { subject: sample.subject, html: sample.html } : null,
      sent: 0,
      note: 'Dry run — no email sent, no row written.',
    })
  }

  // ── test ───────────────────────────────────────────────────────────
  if (mode === 'test') {
    // Prefer the plan belonging to the address we're testing to, when that
    // address is itself a recipient. Rendering plans[0] meant the reviewer read
    // a stranger's email: the first plan happened to belong to a candidate with
    // no stated salary, so it showed none of the pay ranking we were reviewing.
    // Your own list is the one you can actually judge.
    const target = body.testTo.trim().toLowerCase()
    const realPlan = plans.find(p => (p.row.email || '').trim().toLowerCase() === target) || plans[0]
    if (!realPlan) {
      return NextResponse.json(
        { ...summary, sent: 0, error: 'Nobody is currently due, so there is no real plan to render. Re-run when someone qualifies.' },
        { status: 409 },
      )
    }
    const { subject, html, unsubscribeUrl } = renderPlan(realPlan, { live: false })
    // Test subjects carry a timestamp so Gmail cannot thread them together.
    //
    // Repeated tests with an identical subject land in one Gmail conversation,
    // and Gmail then TRIMS the content it considers repeated — the "…" markers,
    // and a large collapsed gap where the body should be. That looks exactly
    // like a broken template on a phone, and it cost us an afternoon deciding
    // which it was. A real candidate gets one email in no thread and never sees
    // it; only we do, because only we receive the same email repeatedly.
    //
    // Test mode only. The real send keeps the clean subject.
    const testSubject = `${subject} [test ${now.toISOString().slice(11, 19)}Z]`
    // The test carries the header too, with the inert-but-valid token, so this
    // path proves the header end to end without risking a real opt-out.
    const result = await sendEmail(body.testTo, testSubject, html, undefined, undefined, { unsubscribeUrl, emailType: 'roundup_test' })
    // Same rule as the real send: a test that didn't send is not a 200. This
    // one returned "HTTP 200, sent: 0" while Resend was rejecting the key, and
    // the only reason it was caught is that somebody read the body carefully.
    return NextResponse.json({
      ...summary,
      testTo: body.testTo,
      renderedFor: {
        name: realPlan.row.full_name,
        isOwnList: (realPlan.row.email || '').trim().toLowerCase() === body.testTo.trim().toLowerCase(),
        mode: realPlan.mode,
        areas: realPlan.areaNames,
        roleLabel: realPlan.row.job_title,
      },
      sent: result.success ? 1 : 0,
      sendError: result.error,
      note: 'Test send only — no real candidate was contacted and no row was written. The unsubscribe link in this email is inert, so clicking it cannot opt anybody out.',
    }, { status: result.success ? 200 : 500 })
  }

  // ── send ───────────────────────────────────────────────────────────
  const sentTo: string[] = []
  const failed: { email: string | null; error?: string }[] = []

  for (const plan of plans) {
    const { subject, html, unsubscribeUrl } = renderPlan(plan, { live: true })
    const result = await sendEmail(plan.row.email!, subject, html, undefined, undefined, { unsubscribeUrl, emailType: 'roundup' })
    if (!result.success) {
      failed.push({ email: plan.row.email, error: result.error })
      continue
    }
    // Stamp only after a confirmed send. A failed stamp means they may see the
    // same roles next week — the right way to fail, versus stamping first and
    // silently skipping a week nobody received.
    const next = markSent(parseRoundupState(plan.row.roundup_state), plan.jobs.map(j => j.id), now)
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ roundup_state: next })
      .eq('user_id', plan.row.user_id)
    if (writeError) {
      console.error('[roles-roundup] emailed but not stamped', plan.row.user_id, writeError.message)
      failed.push({ email: plan.row.email, error: 'emailed but not stamped: ' + writeError.message })
      continue
    }
    sentTo.push(plan.row.email!)
  }

  // A FAILED SEND MUST NOT LOOK LIKE A SUCCESSFUL RUN.
  //
  // This returned 200 whatever happened, so a run where every single email
  // bounced was indistinguishable — to Vercel, to the logs, to us — from a
  // clean one. Vercel's cron monitoring only surfaces non-2xx responses, so
  // there was nothing for it to catch. That is exactly how a bad Resend key
  // would have gone unnoticed week after week.
  //
  // PARTIAL failures count too. One address failing out of fifteen is how you
  // quietly lose the same candidate every week; if it is worth knowing about at
  // fifteen, it is worth knowing about at one.
  //
  // Safe to do because Vercel does not retry: "Vercel will not retry an
  // invocation if a cron job fails" (docs/cron-jobs/manage-cron-jobs). So a
  // non-2xx raises the alarm without re-mailing the people who did receive it.
  // Duplicate delivery is possible independently of this — cron delivery is
  // best-effort and can invoke the same run twice — but isDue()'s 7-day cadence
  // and the markSent() stamp already make a second run in the same week a no-op.
  const status = failed.length > 0 ? 500 : 200
  console.log('[roles-roundup]', JSON.stringify({
    mode, planned: plans.length, sent: sentTo.length, failed: failed.length,
  }))
  return NextResponse.json(
    {
      ...summary,
      sent: sentTo.length,
      sentTo,
      failed,
      ...(failed.length > 0 && {
        error: `${failed.length} of ${plans.length} sends failed — see failed[] and the runtime logs`,
      }),
    },
    { status },
  )
}

/** Status only. There is deliberately no send path on GET for this route. */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = new Date()
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error, columnMissing, plans, exclusions, rows, jobs, collapsed } = await build(supabase, now)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({
    mode: 'status',
    ...summarise(rows, jobs, plans, exclusions, columnMissing, collapsed),
    sent: 0,
    note: 'Status only — this route never sends on GET.',
  })
}
