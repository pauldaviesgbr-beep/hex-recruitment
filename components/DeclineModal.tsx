'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'

// Default decline copy used when an employer has not saved a custom
// "rejected" template. {{jobTitle}} and {{companyName}} are substituted
// before display via applyVars below; whatever the user finally edits in
// the textarea is sent as the single source of truth (email + in-app
// conversation message).
const DEFAULT_REJECTED_BODY = "Thank you for applying for the {{jobTitle}} role at {{companyName}}. Due to a high number of applications, we've decided not to move forward with yours at this time, as we don't feel your experience is quite the right match for what we're looking for. We genuinely appreciate the time you took to apply and wish you all the best in your search."

// Local copy of lib/customEmailTemplate.ts:applyVariables — that module
// instantiates a service-role Supabase client at the top level and is
// server-only, so we re-implement the regex substitution here for the
// client component.
function applyVars(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

interface DeclineModalProps {
  applicationId: string
  candidateId: string
  candidateEmail: string | null
  candidateName: string
  jobTitle: string
  companyName: string
  employerId: string
  onClose: () => void
  onDeclined?: () => void
}

export default function DeclineModal({
  applicationId,
  candidateId,
  candidateEmail,
  candidateName,
  jobTitle,
  companyName,
  employerId,
  onClose,
  onDeclined,
}: DeclineModalProps) {
  const [rejectMessage, setRejectMessage] = useState('')
  const [rejectInitialMessage, setRejectInitialMessage] = useState('')
  const [rejectIsCustomTemplate, setRejectIsCustomTemplate] = useState(false)
  const [rejectTemplateLoading, setRejectTemplateLoading] = useState(true)
  const [rejectSending, setRejectSending] = useState(false)

  // Fetch the employer's saved "rejected" template (if any) and pre-fill
  // the textarea. Falls back to DEFAULT_REJECTED_BODY when no custom
  // template exists.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('employer_email_templates')
          .select('body, is_active')
          .eq('employer_id', employerId)
          .eq('template_type', 'rejected')
          .maybeSingle()

        if (cancelled) return

        const useCustom = !!(data && data.is_active && data.body)
        const rawBody = useCustom ? (data!.body as string) : DEFAULT_REJECTED_BODY
        const filled = applyVars(rawBody, {
          candidateName,
          jobTitle,
          companyName,
        })
        setRejectMessage(filled)
        setRejectInitialMessage(filled)
        setRejectIsCustomTemplate(useCustom)
      } finally {
        if (!cancelled) setRejectTemplateLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [employerId, candidateName, jobTitle, companyName])

  const handleDeclineAndSend = async () => {
    if (!rejectMessage.trim()) return
    setRejectSending(true)
    try {
      // 1. Mark the application as rejected.
      const { error } = await supabase
        .from('job_applications')
        .update({ status: 'rejected', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
        .eq('id', applicationId)
      if (error) {
        alert('Failed to update status. Please try again.')
        return
      }

      // 2. Bell-notification for the candidate.
      await notify('status_changed', { applicationId, extra: { status: 'rejected' } })

      // 3. Send the decline email with the user-edited body. bodyOverride
      //    forces /api/email/send to use this exact text (and HTML-escape
      //    it server-side) instead of the standard application_status
      //    template path.
      if (candidateEmail) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidateEmail,
            type: 'application_status',
            data: {
              status: 'rejected',
              companyName,
              jobTitle,
              candidateName,
              employerId,
              bodyOverride: rejectMessage.trim(),
            },
          }),
        }).catch(() => {})
      }

      // 4. Mirror the same body to an in-app conversation message so the
      //    candidate sees identical decline copy in their messages tab.
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${employerId},participant_2.eq.${candidateId}),and(participant_1.eq.${candidateId},participant_2.eq.${employerId})`)
        .maybeSingle()

      let conversationId = existingConv?.id
      if (!conversationId) {
        const { data: newConv } = await supabase.from('conversations').insert({
          participant_1: employerId,
          participant_2: candidateId,
          participant_1_name: companyName,
          participant_1_role: 'employer',
          participant_1_company: companyName,
          participant_2_name: candidateName,
          participant_2_role: 'candidate',
          related_job_title: jobTitle,
          last_message: rejectMessage.trim(),
          last_message_at: new Date().toISOString(),
        }).select('id').single()
        conversationId = newConv?.id
      }

      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: employerId,
          sender_name: companyName,
          sender_role: 'employer',
          content: rejectMessage.trim(),
          is_read: false,
        })
        if (existingConv) {
          await supabase.from('conversations').update({
            last_message: rejectMessage.trim(),
            last_message_at: new Date().toISOString(),
          }).eq('id', conversationId)
        }
      }

      onDeclined?.()
    } catch {
      // Surfaced via the supabase update alert above; swallow downstream.
    } finally {
      setRejectSending(false)
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Safe-area-inset envelope — same iOS-Safari-clip rationale as
        // ScheduleInterviewModal.module.css. Decline content includes a
        // 7-row textarea so this modal is the tallest of the inline
        // ones; max(1rem, env()) ensures the notch can't clip the
        // header on a short viewport.
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      }}
      onClick={() => !rejectSending && onClose()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 480,
          width: '100%',
          maxHeight: 'calc(100dvh - 2rem)',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700 }}>Decline application</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          {candidateName} — {jobTitle}
        </p>

        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
          Message to candidate
        </label>
        <textarea
          value={rejectMessage}
          onChange={e => setRejectMessage(e.target.value)}
          rows={7}
          disabled={rejectTemplateLoading || rejectSending}
          placeholder={rejectTemplateLoading ? 'Loading template…' : ''}
          style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', resize: 'vertical', lineHeight: 1.5, background: rejectTemplateLoading ? '#f8fafc' : '#fff' }}
        />

        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.5rem 0 0' }}>
          {rejectTemplateLoading
            ? 'Loading your template…'
            : rejectIsCustomTemplate
              ? 'Using your saved Declined template. '
              : 'Using the default decline copy. '}
          {!rejectTemplateLoading && (
            <Link
              href="/settings/email-templates"
              onClick={(e) => {
                if (rejectMessage !== rejectInitialMessage) {
                  const ok = window.confirm('You have unsaved edits in this message. Leave to edit your saved template?')
                  if (!ok) e.preventDefault()
                }
              }}
              style={{ color: '#0f172a', textDecoration: 'underline' }}
            >
              Edit your template
            </Link>
          )}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={onClose}
            disabled={rejectSending}
            style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
          >
            Cancel
          </button>
          <button
            onClick={handleDeclineAndSend}
            disabled={rejectSending || rejectTemplateLoading || !rejectMessage.trim()}
            style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: 8, background: (rejectSending || rejectTemplateLoading) ? '#94a3b8' : '#dc2626', color: '#fff', cursor: (rejectSending || rejectTemplateLoading) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
          >
            {rejectSending ? 'Sending…' : 'Send & Decline'}
          </button>
        </div>
      </div>
    </div>
  )
}
