import { NextRequest, NextResponse } from 'next/server'
import { jobExpiredEmail } from '@/emails/job-expired'
import { JOB_EXPIRY_DAYS } from '@/lib/jobExpiry'

import { supabaseAdmin } from '@/lib/supabase-admin'

// RETIRE ADS THAT HAVE BEEN LIVE 60 DAYS. Daily at 10:00 UTC (vercel.json).
//
// READ THIS BEFORE BELIEVING ANYTHING ABOUT EXPIRY IN THIS CODEBASE.
//
// THE CLOCK RUNS FROM posted_at, NOT expires_at. jobs.expires_at is null on
// every row and nothing anywhere writes it — the only expires_at writers are
// boosts and team invites, different tables entirely. A route called job-expiry
// that ignores the column named expires_at is why this behaviour sat unnoticed
// for six weeks: anyone looking for expiry logic looked at the column, found it
// dead, and concluded ads never expire. They do. At 60 days. With an email.
//
// The name is kept rather than changed, because the route IS job expiry — the
// misleading part was never the filename, it was that the mechanism was
// undocumented and in the wrong place to be found. This comment is the fix for
// that; a rename would have moved the surprise rather than removed it.
//
// RECRUITER POSTINGS ARE EXCLUDED, and not as a disguised way of switching this
// off. Scraped listings are reconciled every Tuesday by the Goldenkeys import,
// which asks the source whether each vacancy is still live and reconciles the
// ones that are gone to 'filled'. That source is the authority. Expiring those
// rows on OUR 60-day clock would be us overruling it — and worse, it would not
// even stick: the scrape upserts still-live vacancies with status 'active'
// again, while posted_at is only ever written on insert, so the next morning's
// run would expire them again and email about it again, every week, forever.
//
// A directly-posted ad has no such reconciliation. Nobody is checking whether
// it is still real, so it genuinely should age out. The rule follows from who
// knows the truth about each row.
//
// WITHOUT THE FILTER, on the numbers as at 4 Aug 2026: 23 Goldenkeys listings
// would have been expired on 18 August, 179 more on 10 September, and roughly
// 241 emails would have gone to one recruiter about adverts they never posted
// through the form.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // The SAME constant lib/jobPostingLd publishes as validThrough. Two copies of
  // 60 is how the schema and the cron come to disagree about when a job dies.
  const cutoff = new Date(now.getTime() - JOB_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  const cutoffStr = cutoff.toISOString()

  // Active ads posted more than 60 days ago, EXCLUDING recruiter postings —
  // see the note at the top of this file for why the scrape owns those.
  //
  // `.eq(false)` rather than `.not('is_recruiter_posting','is',true)`: the
  // column is NOT NULL with a false default, so the two are equivalent today,
  // and the explicit form fails closed if that ever changes — a null would be
  // skipped rather than silently expired.
  const { data: expiredJobs, error } = await supabaseAdmin
    .from('jobs')
    .select('id, title, employer_id, posted_at')
    .eq('status', 'active')
    .eq('is_recruiter_posting', false)
    .lt('posted_at', cutoffStr)

  if (error) {
    console.error('[job-expiry] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!expiredJobs || expiredJobs.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  let expired = 0

  for (const job of expiredJobs) {
    // Mark as expired
    const { error: updateErr } = await supabaseAdmin
      .from('jobs')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', job.id)

    if (updateErr) {
      console.error('[job-expiry] update failed for', job.id, updateErr)
      continue
    }

    expired++

    // Look up employer contact for email
    const { data: profile } = await supabaseAdmin
      .from('employer_profiles')
      .select('contact_name, email')
      .eq('user_id', job.employer_id)
      .maybeSingle()

    if (profile?.email) {
      const email = jobExpiredEmail(
        profile.contact_name || '',
        job.title || 'your job listing',
        job.id,
      )
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: profile.email, type: 'raw', data: email }),
      }).catch(() => {})
    }

    // In-app notification
    await supabaseAdmin.from('notifications').insert({
      user_id: job.employer_id,
      title: 'Job Listing Expired',
      message: `Your listing for "${job.title}" has been live for 60 days and has been automatically closed. You can repost it from your jobs page.`,
      type: 'application_update',
      read: false,
      related_id: job.id,
      related_type: 'job',
      link: '/my-jobs',
    })
  }

  console.log(`[job-expiry] done — expired ${expired} jobs`)
  return NextResponse.json({ ok: true, expired })
}
