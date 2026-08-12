import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { REPLY_TO, type ActivationContext, type ActivationEmail } from '@/emails/activation-context'
import { activationDay1Email } from '@/emails/activation-day1'
import { activationDay3Email } from '@/emails/activation-day3'
import { activationDay7Email } from '@/emails/activation-day7'
import { activationDay14Email } from '@/emails/activation-day14'
import { activationDay30Email } from '@/emails/activation-day30'

/**
 * The employer activation sequence. Runs daily at 09:00 UTC (vercel.json).
 *
 * ── WHY THIS WAS REWRITTEN ──
 *
 * It has returned {"sent":0} on every invocation since it was written, and the
 * reason was one line:
 *
 *     .select('user_id, created_at, employer_profiles!inner(email, ...)')
 *
 * There is NO foreign key between employer_subscriptions and employer_profiles
 * — both reference auth.users(id) independently, and neither references the
 * other. PostgREST therefore rejects the WHOLE request:
 *
 *     HTTP 400  PGRST200  "Could not find a relationship between
 *     'employer_subscriptions' and 'employer_profiles' in the schema cache"
 *
 * Measured, not inferred: that response was fetched from production before this
 * rewrite. `error` was truthy on all five passes, `continue` fired five times,
 * and the route answered {"sent":0} — which is indistinguishable from "nobody
 * was due today". The cron was green in Vercel the entire time.
 *
 * ── WHY TWO LOOKUPS RATHER THAN ADDING THE FOREIGN KEY ──
 *
 * Adding employer_subscriptions.user_id -> employer_profiles(user_id) would
 * work today (employer_profiles_user_id_key UNIQUE exists, and zero live rows
 * would violate it) and would make the embed above legal. It is still the wrong
 * fix: lib/authCallback.ts:279 upserts employer_subscriptions BEFORE
 * employer_profiles in the pre-pivot signup path, which is kept alive for the
 * flag-off future. An FK would make that ordering illegal and break employer
 * signup the day that flag flips. Two lookups cost one extra round trip and
 * cannot do that.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ACTIVATION_DAYS = [1, 3, 7, 14, 30] as const

const EMAIL_BUILDERS: Record<number, (ctx: ActivationContext) => ActivationEmail> = {
  1: activationDay1Email,
  3: activationDay3Email,
  7: activationDay7Email,
  14: activationDay14Email,
  30: activationDay30Email,
}

const DAY_MS = 1000 * 60 * 60 * 24

export async function GET(req: NextRequest) {
  // Verify cron secret — fail-closed: reject if secret is missing or doesn't match
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // ── 1. Who is due today? ────────────────────────────────────────────────
  const { data: subs, error: subsError } = await supabase
    .from('employer_subscriptions')
    .select('user_id, created_at')
    .eq('subscription_tier', 'free')

  if (subsError) {
    // Loudly, and with a non-2xx. The old route swallowed exactly this and
    // reported success, which is how four and a half months went by.
    console.error('[activation] subscriptions lookup failed:', subsError.message)
    return NextResponse.json({ error: 'subscriptions lookup failed' }, { status: 500 })
  }

  const now = Date.now()

  // EXACT day match, deliberately. A run that is missed — the route erroring,
  // Vercel skipping, the whole sequence being off for months as it has been —
  // must NOT be made up later. daysSince is floored elapsed time, so each
  // employer crosses each integer exactly once and a gap is simply a gap.
  // There is no "days >= N and not yet sent" branch anywhere in this file and
  // there must not be one: the alternative is that enabling the sequence fires
  // five months of backlog into nine real inboxes at once.
  const due: { userId: string; day: number }[] = []
  for (const s of subs || []) {
    const daysSince = Math.floor((now - new Date(s.created_at).getTime()) / DAY_MS)
    if ((ACTIVATION_DAYS as readonly number[]).includes(daysSince)) {
      due.push({ userId: s.user_id, day: daysSince })
    }
  }

  if (due.length === 0) return NextResponse.json({ sent: 0, due: 0 })

  const dueIds = due.map(d => d.userId)

  // ── 2. Their profile (second lookup, joined in JS on user_id) ───────────
  const { data: profiles, error: profileError } = await supabase
    .from('employer_profiles')
    .select('user_id, email, company_name, approval_status')
    .in('user_id', dueIds)

  if (profileError) {
    console.error('[activation] profile lookup failed:', profileError.message)
    return NextResponse.json({ error: 'profile lookup failed' }, { status: 500 })
  }

  const profileByUser = new Map((profiles || []).map(p => [p.user_id, p]))

  // ── 3. Their jobs, and the applications to them ─────────────────────────
  // Both batched across everyone due today rather than per employer.
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, employer_id, title, location, posted_at, created_at')
    .in('employer_id', dueIds)

  const jobsByUser = new Map<string, typeof jobs>()
  for (const j of jobs || []) {
    const list = jobsByUser.get(j.employer_id) || []
    list.push(j)
    jobsByUser.set(j.employer_id, list as any)
  }

  const jobIds = (jobs || []).map(j => j.id)
  const { data: applications } = jobIds.length
    ? await supabase.from('job_applications').select('job_id, status').in('job_id', jobIds)
    : { data: [] as { job_id: string; status: string | null }[] }

  const jobOwner = new Map((jobs || []).map(j => [j.id, j.employer_id]))
  const appStats = new Map<string, { total: number; pending: number; hired: number }>()
  for (const a of applications || []) {
    const owner = jobOwner.get(a.job_id)
    if (!owner) continue
    const s = appStats.get(owner) || { total: 0, pending: 0, hired: 0 }
    s.total++
    // 'pending' is the ONLY status the employer has not set — every other value
    // in job_applications.status is the result of them moving the candidate.
    // Deliberately NOT viewed_at: the applications page stamps that on load, so
    // it measures a glance rather than a response. See emails/activation-context.ts.
    if (a.status === 'pending') s.pending++
    if (a.status === 'hired') s.hired++
    appStats.set(owner, s)
  }

  // ── 4. What have we already sent them? ──────────────────────────────────
  // Belt and braces against a double invocation on the same day. The exact-day
  // match above is the primary guard; this one survives the cron firing twice.
  const recipients = (profiles || []).map(p => p.email).filter(Boolean) as string[]
  const { data: alreadySent } = recipients.length
    ? await supabase
        .from('email_log')
        .select('recipient, email_type')
        .in('recipient', recipients)
        .eq('success', true)
        .like('email_type', 'activation_day%')
    : { data: [] as { recipient: string; email_type: string }[] }

  const sentKeys = new Set((alreadySent || []).map(r => `${r.recipient}|${r.email_type}`))

  // ── 5. Build and send ───────────────────────────────────────────────────
  let sent = 0
  const skipped: Record<string, number> = {}
  const note = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1 }

  for (const { userId, day } of due) {
    const profile = profileByUser.get(userId)
    if (!profile) { note('no-profile'); continue }
    if (!profile.email) { note('no-email'); continue }

    // NULL approval_status is the pre-pivot legacy case and is accepted.
    if (profile.approval_status && profile.approval_status !== 'approved') {
      note('not-approved'); continue
    }

    const emailType = `activation_day${day}`
    if (sentKeys.has(`${profile.email}|${emailType}`)) { note('already-sent'); continue }

    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    if (!authUser?.user?.email_confirmed_at) { note('unconfirmed'); continue }

    // Most recently posted advert — the one they'd recognise if we name it.
    //
    // roleTown comes from jobs.location, which holds WHATEVER PLACE THE
    // EMPLOYER TYPED and is printed verbatim on the card and the job page. On
    // the six employer-posted rows live today it is a town four times ("Bath",
    // "Bristol", "London", "Reading") and a county twice ("West Sussex"). Both
    // read correctly in "your Head Chef in ___", which is the only thing it is
    // used for here, so no normalising is attempted.
    //
    // NOT jobs.area, and NOT jobs.area_county. `area` is the printed county
    // ("Somerset" against location "Bath") and `area_county` is an id
    // ("somerset"). All three are `string` and the compiler cannot tell a field
    // that displays from a field that keys — this pairing was read off live
    // rows, not off the column names.
    const theirJobs = (jobsByUser.get(userId) || []) as NonNullable<typeof jobs>
    const latest = [...theirJobs].sort((a, b) =>
      new Date(b.posted_at || b.created_at).getTime() - new Date(a.posted_at || a.created_at).getTime()
    )[0]

    const stats = appStats.get(userId) || { total: 0, pending: 0, hired: 0 }

    const ctx: ActivationContext = {
      companyName: profile.company_name?.trim() || 'there',
      hasPostedJob: theirJobs.length > 0,
      applicationCount: stats.total,
      unactionedCount: stats.pending,
      hasHired: stats.hired > 0,
      roleTitle: latest?.title?.trim() || null,
      roleTown: latest?.location?.trim() || null,
    }

    const built = EMAIL_BUILDERS[day](ctx)

    // A builder returning null is a DECISION not to send, not a failure — day
    // 14 does this for employers who never posted, who have already had three
    // emails asking the same question.
    if (!built) { note(`no-email-for-state-day${day}`); continue }

    const result = await sendEmail(profile.email, built.subject, built.html, REPLY_TO, undefined, {
      emailType,
    })
    if (result.success) sent++
    else note('send-failed')
  }

  // One receipt line per invocation. Vercel keeps under a day of runtime logs,
  // so this is only readable for a few hours — but "the cron ran and nobody was
  // due" and "the cron ran and every send failed" must not look the same again.
  console.log(`[activation] due=${due.length} sent=${sent} skipped=${JSON.stringify(skipped)}`)

  return NextResponse.json({ sent, due: due.length, skipped })
}
