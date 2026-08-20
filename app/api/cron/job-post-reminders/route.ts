import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import {
  groupReminders, reminderSubject, reminderBody, daysLive,
  REMIND_AFTER_DAYS, REMIND_AGAIN_AFTER_DAYS,
  type ReminderJobRow,
} from '@/lib/jobReminders'

/**
 * "IS THIS ADVERT STILL OPEN?" — the sender.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS ROUTE IS NOT ON A SCHEDULE, AND THAT IS DELIBERATE.
 *
 * It is not in vercel.json. Adding it there is a decision to start emailing
 * real employers, and it is Paul's to make, not something that should arrive as
 * a side effect of a deploy.
 *
 * Measured before it was written, which is the only reason it is safe to have
 * in the repo at all: a 30-day rule TODAY is due on 12 adverts belonging to ONE
 * employer — adrian@host-staffing.co.uk — who is a real third party, not Paul
 * and not a test account. The standing rule here is that nothing reaches an
 * address that is not Paul's or a test account's without his say-so, so:
 *
 *   GET   → DRY RUN, always. Reports exactly who it would reach and why.
 *           A GET can be triggered by a scheduler, a probe, a link preview or a
 *           mistake, so it may never send. The discoverability flip's GET does
 *           run live, and that is right for it — it changes our own rows.
 *           This one leaves the building.
 *   POST  → sends, and only with mode:'send' AND confirm:'SEND'. Both, because
 *           one of them is easy to send by accident.
 *
 * NOTHING HERE EVER CHANGES A JOB'S STATUS. We do not know the role is filled;
 * we are asking. Closing stays the employer's decision.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

/** Never more than this many employers emailed in one run. */
const MAX_EMPLOYERS_PER_RUN = 25

const SELECT = 'id, title, status, posted_at, source_url, last_reminder_sent_at, employer_id, views'

// `admin` is typed loosely on purpose: ReturnType<typeof createClient> pins
// generic parameters that do not match what createClient() actually returns here,
// and the alternative is generating database types for one helper.
async function collect(admin: any, now: Date) {
  // Only live adverts are ever candidates, so the scan stays small.
  const { data, error } = await admin.from('jobs').select(SELECT).eq('status', 'active')
  if (error) throw new Error(error.message)

  const rows = (data || []) as unknown as ReminderJobRow[]
  const reminders = groupReminders(rows, now)

  // Resolve the addresses in one query rather than per employer.
  const ids = reminders.map(r => r.employerId)
  const emails = new Map<string, { email: string; company: string | null }>()
  if (ids.length) {
    const { data: profiles } = await admin
      .from('employer_profiles')
      .select('user_id, email, company_name')
      .in('user_id', ids)
    for (const p of (profiles || []) as any[]) {
      if (p.email) emails.set(p.user_id, { email: p.email, company: p.company_name ?? null })
    }
  }

  return { scanned: rows.length, reminders, emails }
}

export async function GET() {
  try {
    const admin = createClient(supabaseUrl, supabaseKey)
    const now = new Date()
    const { scanned, reminders, emails } = await collect(admin, now)

    return NextResponse.json({
      mode: 'dry-run',
      note: 'GET never sends. POST with mode:"send" and confirm:"SEND" to actually email.',
      at: now.toISOString(),
      rules: { remindAfterDays: REMIND_AFTER_DAYS, remindAgainAfterDays: REMIND_AGAIN_AFTER_DAYS },
      activeAdvertsScanned: scanned,
      employersWhoWouldBeEmailed: reminders.length,
      // NAMED, not counted. "It would email 1 employer" is not something anyone
      // can act on; an address is.
      wouldReach: reminders.map(r => ({
        employerId: r.employerId,
        email: emails.get(r.employerId)?.email ?? '(no address on the profile — would be skipped)',
        company: emails.get(r.employerId)?.company ?? null,
        adverts: r.jobs.length,
        truncated: r.truncated,
        subject: reminderSubject(r),
        oldestDaysLive: Math.max(...r.jobs.map(j => daysLive(j, now))),
        titles: r.jobs.map(j => j.title),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    const auth = request.headers.get('authorization')
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    // BOTH, because either one alone is easy to send by accident.
    if (body?.mode !== 'send' || body?.confirm !== 'SEND') {
      return NextResponse.json(
        {
          error: 'Refusing to send.',
          need: 'mode:"send" and confirm:"SEND"',
          hint: 'GET this route first and read wouldReach — it names every address.',
        },
        { status: 400 },
      )
    }

    const admin = createClient(supabaseUrl, supabaseKey)
    const now = new Date()
    const { scanned, reminders, emails } = await collect(admin, now)

    const sent: { employerId: string; email: string; adverts: number }[] = []
    const skipped: { employerId: string; reason: string }[] = []
    const failed: { employerId: string; error: string }[] = []

    for (const reminder of reminders.slice(0, MAX_EMPLOYERS_PER_RUN)) {
      const who = emails.get(reminder.employerId)
      if (!who?.email) {
        skipped.push({ employerId: reminder.employerId, reason: 'no address on the employer profile' })
        continue
      }

      const subject = reminderSubject(reminder)
      const text = reminderBody(reminder, now, BASE_URL)
      const html = `<pre style="font:14px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap">${
        text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }</pre>`

      const result = await sendEmail(who.email, subject, html, undefined, text, {
        emailType: 'job_post_reminder',
      } as any)

      if (!result.success) {
        failed.push({ employerId: reminder.employerId, error: result.error || 'send failed' })
        continue
      }

      // STAMPED ONLY AFTER A SUCCESSFUL SEND. Stamping first would mean a failed
      // send silently buys itself another 30 days of silence.
      const { error: stampError } = await admin
        .from('jobs')
        .update({ last_reminder_sent_at: now.toISOString() })
        .in('id', reminder.jobs.map(j => j.id))
      if (stampError) {
        failed.push({ employerId: reminder.employerId, error: `sent but not stamped: ${stampError.message}` })
        continue
      }

      sent.push({ employerId: reminder.employerId, email: who.email, adverts: reminder.jobs.length })
      console.log(`[job-post-reminders] emailed ${who.email} about ${reminder.jobs.length} advert(s)`)
    }

    // ONE RECEIPT LINE PER INVOCATION, because a quiet day and a dead schedule
    // look identical otherwise — the lesson the flip route already carries.
    console.log(
      `[job-post-reminders] run at ${now.toISOString()}: scanned ${scanned}, ` +
      `due ${reminders.length}, sent ${sent.length}, skipped ${skipped.length}, failed ${failed.length}`)

    return NextResponse.json({
      mode: 'send',
      at: now.toISOString(),
      activeAdvertsScanned: scanned,
      employersDue: reminders.length,
      sent,
      skipped,
      failed,
      cappedAt: MAX_EMPLOYERS_PER_RUN,
      note: reminders.length > MAX_EMPLOYERS_PER_RUN
        ? `Only the first ${MAX_EMPLOYERS_PER_RUN} were emailed this run.`
        : undefined,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
