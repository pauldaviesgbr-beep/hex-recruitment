import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'

// A REPORT MUST REACH A PERSON.
//
// Found 16 Oct 2026: ReportControl inserted into content_reports and nothing
// else happened. No trigger, no email, no admin page reads that table, so the
// promise behind Report (Apple Guideline 1.2: reports are acted on) had no one
// behind it. Every report filed so far (6) came from our own test accounts
// while recording takes, so nothing real was missed.
//
// Two routes reach this, so one failing does not lose a report:
//   - /api/report/alert, called by ReportControl straight after the insert;
//   - /api/cron/report-alerts, a daily sweep of anything still not alerted.
//
// CLAIM, THEN SEND. alerted_at is set before the email goes and cleared if the
// send fails, so the two routes can never both email the same report.
//
// The alert goes to Thrive only, never to the reporter or the reported party.
// The reported party is never told a report exists (ReportControl's promise).

export const REPORT_ALERT_TO = process.env.REPORT_ALERT_TO || 'paul@thrivecareer.co.uk'
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const TYPE_WORD: Record<string, string> = { job: 'a job advert', message: 'a conversation', comment: 'a shift comment' }

export type AlertOutcome = 'sent' | 'already' | 'missing' | 'failed'

/** Alert Thrive about one report. Safe to call twice: the second call is 'already'. */
export async function alertReport(reportId: string): Promise<AlertOutcome> {
  const db = getSupabaseAdmin()

  // Claim it. Only a report nobody has been told about can be claimed.
  const { data: claimed } = await db
    .from('content_reports')
    .update({ alerted_at: new Date().toISOString() })
    .eq('id', reportId)
    .is('alerted_at', null)
    .select('id, reporter_id, target_type, target_id, reason, detail, created_at')
  const report = claimed?.[0]
  if (!report) {
    const { data: exists } = await db.from('content_reports').select('id').eq('id', reportId).maybeSingle()
    return exists ? 'already' : 'missing'
  }

  try {
    const { subject, html } = await composeAlert(report)
    const result = await sendEmail(REPORT_ALERT_TO, subject, html, undefined, undefined, { emailType: 'report_alert' })
    if (!result.success) throw new Error('send failed')
    return 'sent'
  } catch {
    // Release the claim so the daily sweep tries again. Nothing logged from the
    // error: it can carry message content.
    await db.from('content_reports').update({ alerted_at: null }).eq('id', report.id)
    return 'failed'
  }
}

/** Every report nobody has been told about, oldest first. Used by the daily sweep. */
export async function unalertedReportIds(limit = 50): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from('content_reports')
    .select('id')
    .is('alerted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  return (data || []).map((r: any) => r.id)
}

async function who(userId: string | null): Promise<string> {
  if (!userId) return 'an account that has since been deleted'
  const db = getSupabaseAdmin()
  const [{ data: cand }, { data: emp }, { data: auth }] = await Promise.all([
    db.from('candidate_profiles').select('full_name, is_test').eq('user_id', userId).maybeSingle(),
    db.from('employer_profiles').select('company_name').eq('user_id', userId).maybeSingle(),
    db.auth.admin.getUserById(userId),
  ])
  const email = auth?.user?.email || 'no email'
  const name = cand?.full_name || emp?.company_name || 'no name on file'
  const kind = emp ? 'employer' : 'candidate'
  return `${name} (${kind}, ${email})${cand?.is_test ? ' — a TEST account' : ''}`
}

async function composeAlert(r: any): Promise<{ subject: string; html: string }> {
  const db = getSupabaseAdmin()
  const rows: string[] = []
  let headline = ''
  let link = ''

  if (r.target_type === 'job') {
    const { data: job } = await db.from('jobs').select('title, company, status').eq('id', r.target_id).maybeSingle()
    headline = job ? `${job.title} · ${job.company}` : 'a job that no longer exists'
    if (job) rows.push(`Advert status: ${esc(job.status)}`)
    link = `${SITE}/job/${r.target_id}`
  } else if (r.target_type === 'message') {
    const { data: conv } = await db.from('conversations')
      .select('participant_1_name, participant_1_role, participant_2_name, participant_2_role, related_job_title')
      .eq('id', r.target_id).maybeSingle()
    headline = conv
      ? `${conv.participant_1_name || 'Unnamed'} (${conv.participant_1_role || '?'}) and ${conv.participant_2_name || 'Unnamed'} (${conv.participant_2_role || '?'})`
      : 'a conversation that no longer exists'
    if (conv?.related_job_title) rows.push(`About: ${esc(conv.related_job_title)}`)
    const { data: msgs } = await db.from('messages')
      .select('sender_name, content, created_at').eq('conversation_id', r.target_id)
      .order('created_at', { ascending: false }).limit(6)
    if (msgs?.length) {
      rows.push('Latest messages, newest first:')
      for (const m of msgs) rows.push(`&nbsp;&nbsp;<b>${esc(m.sender_name)}</b>: ${esc(String(m.content).slice(0, 400))}`)
    }
    link = `${SITE}/admin/messages`
  } else {
    const { data: c } = await db.from('temp_post_comments')
      .select('body, author_name, hidden, post_id').eq('id', r.target_id).maybeSingle()
    const { data: post } = c ? await db.from('temp_posts').select('title').eq('id', c.post_id).maybeSingle() : { data: null }
    headline = c ? `a comment by ${c.author_name || 'Unnamed'}${post ? ` on "${post.title}"` : ''}` : 'a comment that no longer exists'
    if (c) rows.push(`Comment: ${esc(String(c.body).slice(0, 600))}`, `Hidden already: ${c.hidden ? 'yes' : 'no'}`)
    link = `${SITE}/temp-work`
  }

  const reporter = await who(r.reporter_id)
  const subject = `Report: ${TYPE_WORD[r.target_type] || r.target_type} — ${r.reason}`
  const html = `
    <p><b>Someone reported ${esc(TYPE_WORD[r.target_type] || r.target_type)} on Thrive.</b> Apple expects reports to be looked at within 24 hours.</p>
    <p><b>What:</b> ${esc(headline)}<br/>
       <b>Reason:</b> ${esc(r.reason)}<br/>
       ${r.detail ? `<b>Their words:</b> ${esc(r.detail)}<br/>` : ''}
       <b>Reported by:</b> ${esc(reporter)}<br/>
       <b>When:</b> ${esc(new Date(r.created_at).toUTCString())}</p>
    ${rows.length ? `<p>${rows.join('<br/>')}</p>` : ''}
    <p><a href="${esc(link)}">Open it</a></p>
    <p style="color:#64748b">The person reported is not told. Report id ${esc(r.id)}.</p>`
  return { subject, html }
}
