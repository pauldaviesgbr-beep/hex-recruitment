import 'server-only'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'
import { getCustomTemplate, applyVariables } from '@/lib/customEmailTemplate'
import { applicationStatusEmail } from '@/emails/application-status'
import { DEFAULT_REJECTED_BODY } from '@/lib/declineCopy'
import { WAITING_STATUSES } from '@/lib/applicantStages'

// THE POLITE UPDATE, SENT BY THE SERVER, ONCE (design 25, decision 5).
//
// "Not a fit" marks the application and offers Undo for six seconds. Only
// after that does this run — from the browser when the toast times out, from
// the browser as the page is hidden (sendBeacon), or from the daily catch-up
// cron for anything still owed. Three callers, one send.
//
// ONCE IS ENFORCED BY THE DATABASE, NOT BY THE CALLERS. The first statement
// CLAIMS the row: it stamps decline_notice_sent_at only where the row is still
// rejected, still owed and not yet sent, and returns the row only if it did.
// Two callers racing (the toast timer and the beacon, say) both run it; one
// gets the row and sends, the other gets nothing and stops. A claimed row is
// never sent again even if a later step fails — a missed message is a smaller
// harm than the same rejection arriving twice.
//
// THE STATUS CHANGES AT THE SEND, NOT AT THE TAP. During the Undo window only
// decline_notice_due_at is written (see the Not a fit route for why: making a
// row 'rejected' fires the trigger that cancels interviews and withdraws
// offers). So before claiming, a row that is owed but still waiting is made
// rejected. The route does that itself first, as the employer, so the status
// log names them; this statement then matches nothing. It does the work only
// for the daily catch-up, which has no caller.
//
// UNDO WINS BY CONSTRUCTION. Undo clears decline_notice_due_at, so neither the
// move nor the claim matches and nothing is sent. A withdrawn application is
// never moved or claimed either: it is not a waiting status.
//
// What goes out — the same three things the Decline box sends today:
//   the email (the employer's saved "rejected" template, or the default),
//   the same words as an in-app message from the employer,
//   and the bell notice ("was not selected to move forward").

export type NoticeResult =
  | { sent: true; email: boolean; message: boolean; notification: boolean }
  | { sent: false; reason: 'not_owed' | 'claim_failed'; detail?: string }

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function sendDeclineNotice(applicationId: string): Promise<NoticeResult> {
  const nowIso = new Date().toISOString()
  await supabaseAdmin
    .from('job_applications')
    .update({ status: 'rejected', status_updated_at: nowIso, stage_entered_at: nowIso })
    .eq('id', applicationId)
    .in('status', WAITING_STATUSES)
    .not('decline_notice_due_at', 'is', null)
    .is('decline_notice_sent_at', null)

  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('job_applications')
    .update({ decline_notice_sent_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('status', 'rejected')
    .not('decline_notice_due_at', 'is', null)
    .is('decline_notice_sent_at', null)
    .select('id, candidate_id, job_id, job_title, company')
  if (claimErr) return { sent: false, reason: 'claim_failed', detail: claimErr.message }
  const app = claimed?.[0]
  if (!app) return { sent: false, reason: 'not_owed' }

  const { data: job } = await supabaseAdmin
    .from('jobs').select('employer_id, title, company').eq('id', app.job_id).maybeSingle()
  const employerId: string | null = job?.employer_id ?? null

  const { data: ep } = employerId
    ? await supabaseAdmin.from('employer_profiles').select('company_name').eq('user_id', employerId).maybeSingle()
    : { data: null }
  const { data: cp } = await supabaseAdmin
    .from('candidate_profiles').select('full_name').eq('user_id', app.candidate_id).maybeSingle()

  const jobTitle = app.job_title || job?.title || 'the role'
  const companyName = ep?.company_name || app.company || job?.company || 'the company'
  const candidateName = cp?.full_name || ''
  const vars = { candidateName, jobTitle, companyName }

  const tpl = employerId ? await getCustomTemplate(employerId, 'rejected') : null
  const bodyText = applyVariables(tpl ? tpl.body : DEFAULT_REJECTED_BODY, vars)
  const subject = tpl
    ? applyVariables(tpl.subject, vars)
    : applicationStatusEmail('rejected', companyName, jobTitle, candidateName).subject

  // 1. Email — to the address on the account, not a profile field.
  let emailOk = false
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(app.candidate_id)
  const to = authUser?.user?.email
  if (to) {
    const html = `<p>${escapeHtml(bodyText).replace(/\n/g, '</p><p>')}</p>`
    const res = await sendEmail(to, subject, html, undefined, undefined, { emailType: 'decline_notice' })
    emailOk = res.success
  }

  // 2. The same words as a message from the employer.
  let messageOk = false
  if (employerId) {
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${employerId},participant_2.eq.${app.candidate_id}),and(participant_1.eq.${app.candidate_id},participant_2.eq.${employerId})`)
      .limit(1)
      .maybeSingle()
    let conversationId: string | null = existing?.id ?? null
    const now = new Date().toISOString()
    if (!conversationId) {
      const { data: created } = await supabaseAdmin.from('conversations').insert({
        participant_1: employerId,
        participant_2: app.candidate_id,
        participant_1_name: companyName,
        participant_1_role: 'employer',
        participant_1_company: companyName,
        participant_2_name: candidateName || null,
        participant_2_role: 'candidate',
        related_job_title: jobTitle,
        last_message: bodyText,
        last_message_at: now,
      }).select('id').single()
      conversationId = created?.id ?? null
    }
    if (conversationId) {
      const { error: msgErr } = await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        sender_id: employerId,
        sender_name: companyName,
        sender_role: 'employer',
        content: bodyText,
        is_read: false,
      })
      messageOk = !msgErr
      if (existing) {
        await supabaseAdmin.from('conversations')
          .update({ last_message: bodyText, last_message_at: now }).eq('id', conversationId)
      }
    }
  }

  // 3. The bell notice — the same words /api/notifications/notify uses.
  const { error: noteErr } = await supabaseAdmin.from('notifications').insert({
    user_id: app.candidate_id,
    type: 'application_update',
    title: 'Application Update',
    message: `Your application for ${jobTitle} at ${companyName} was not selected to move forward.`,
    read: false,
    related_id: app.id,
    related_type: 'application',
    link: '/applications',
  })

  return { sent: true, email: emailOk, message: messageOk, notification: !noteErr }
}
