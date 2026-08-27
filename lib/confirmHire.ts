import { supabase } from './supabase'
import { notify } from './notify'
import { greetingName } from '@/lib/displayName'

export interface ConfirmHireParams {
  applicationId: string
  jobId: string
  candidateId: string
  candidateName: string | null
  candidateEmail: string | null
  jobTitle: string
  company: string
}

/**
 * Single source of truth for confirming a hire. Used by BOTH the applications
 * card "Confirm Hire" button and the pipeline Hired gate so the two perform an
 * identical hire (no duplication). Writes: job_applications.status='hired',
 * jobs.status='filled', a candidate notification, the status email, and a
 * confirmation conversation message.
 *
 * It does NOT show a confirm() dialog or refresh any UI — callers own those.
 * Throws if there's no session.
 */
export async function confirmHire(p: ConfirmHireParams): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  // Update application status to 'hired'
  await supabase
    .from('job_applications')
    .update({ status: 'hired', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
    .eq('id', p.applicationId)

  // Update job status to 'filled'
  await supabase
    .from('jobs')
    .update({ status: 'filled' })
    .eq('id', p.jobId)

  // Send notification to candidate
  await notify('hire_confirmed', { applicationId: p.applicationId })

  // Send email notification (fire-and-forget)
  fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: p.candidateEmail,
      type: 'application_status',
      data: { status: 'hired', companyName: p.company, jobTitle: p.jobTitle },
    }),
  }).catch(() => {})

  // Send message via the employer↔candidate conversation for this job
  const messageContent = [
    `Hello ${greetingName(p.candidateName)},`,
    '',
    `Congratulations! Your hire for the ${p.jobTitle} position at ${p.company} has been officially confirmed.`,
    '',
    'We look forward to welcoming you to the team!',
    '',
    'Best regards,',
    p.company,
  ].join('\n')

  let conversationId: string | null = null
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${p.candidateId}),and(participant_1.eq.${p.candidateId},participant_2.eq.${session.user.id})`)
    .eq('related_job_id', p.jobId)
    .maybeSingle()

  if (existingConv) {
    conversationId = existingConv.id
  } else {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        participant_1: session.user.id,
        participant_2: p.candidateId,
        participant_1_name: p.company,
        participant_1_role: 'employer',
        participant_1_company: p.company,
        participant_2_name: p.candidateName,
        participant_2_role: 'candidate',
        related_job_id: p.jobId,
        related_job_title: p.jobTitle,
        last_message: messageContent,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single()
    conversationId = newConv?.id || null
  }

  if (conversationId) {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: session.user.id,
      sender_name: p.company,
      sender_role: 'employer',
      content: messageContent,
      is_read: false,
    })
    if (existingConv) {
      await supabase.from('conversations').update({
        last_message: messageContent,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId)
    }
  }
}
