'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'

// Mirrors components/DeclineModal — same template-aware structure, but
// fires on the employer marking a candidate as 'withdrawn' (dropped out,
// stopped responding, accepted another role). Different semantics from
// Decline (which is the employer's rejection); different default body;
// different template_type lookup so employers can save distinct copy.
const DEFAULT_WITHDRAWN_BODY = "Hi {{candidateName}},\n\nWe're marking your application for the {{jobTitle}} role at {{companyName}} as withdrawn. If this is a mistake — or if you'd like to be considered for similar future roles — please reply and let us know. Otherwise, we wish you all the best."

// Local copy of lib/customEmailTemplate.ts:applyVariables — same client-
// only constraint as DeclineModal (the server helper instantiates a
// service-role client at module top, so we cannot import it here).
function applyVars(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

interface WithdrawModalProps {
  applicationId: string
  candidateId: string
  candidateEmail: string | null
  candidateName: string
  jobTitle: string
  companyName: string
  employerId: string
  onClose: () => void
  onWithdrawn?: () => void
}

export default function WithdrawModal({
  applicationId,
  candidateId,
  candidateEmail,
  candidateName,
  jobTitle,
  companyName,
  employerId,
  onClose,
  onWithdrawn,
}: WithdrawModalProps) {
  const [message, setMessage] = useState('')
  const [initialMessage, setInitialMessage] = useState('')
  const [isCustomTemplate, setIsCustomTemplate] = useState(false)
  const [templateLoading, setTemplateLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Pre-fill the message from the employer's saved 'withdrawn' template
  // when present; otherwise fall back to DEFAULT_WITHDRAWN_BODY. {{vars}}
  // are filled in once, then the textarea is the source of truth — what
  // the employer finally edits is what goes out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('employer_email_templates')
          .select('body, is_active')
          .eq('employer_id', employerId)
          .eq('template_type', 'withdrawn')
          .maybeSingle()

        if (cancelled) return

        const useCustom = !!(data && data.is_active && data.body)
        const rawBody = useCustom ? (data!.body as string) : DEFAULT_WITHDRAWN_BODY
        const filled = applyVars(rawBody, {
          candidateName,
          jobTitle,
          companyName,
        })
        setMessage(filled)
        setInitialMessage(filled)
        setIsCustomTemplate(useCustom)
      } finally {
        if (!cancelled) setTemplateLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [employerId, candidateName, jobTitle, companyName])

  const handleWithdrawAndSend = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      // 1. Mark the application as withdrawn. stage_entered_at anchors
      //    the "N days in [Stage]" badge so a withdrawn card shows the
      //    correct duration if it remains visible in any future view.
      const { error } = await supabase
        .from('job_applications')
        .update({
          status: 'withdrawn',
          status_updated_at: new Date().toISOString(),
          stage_entered_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
      if (error) {
        alert('Failed to update status. Please try again.')
        return
      }

      // 2. Bell-notification for the candidate.
      await notify('marked_withdrawn', { applicationId })

      // 3. Send the email with the user-edited body. bodyOverride forces
      //    /api/email/send to use this exact text (HTML-escaped server-
      //    side) instead of the standard application_status template.
      if (candidateEmail) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidateEmail,
            type: 'application_status',
            data: {
              status: 'withdrawn',
              companyName,
              jobTitle,
              candidateName,
              employerId,
              bodyOverride: message.trim(),
            },
          }),
        }).catch(() => {})
      }

      // 4. Mirror to in-app conversation — same body the email shows.
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
          last_message: message.trim(),
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
          content: message.trim(),
          is_read: false,
        })
        if (existingConv) {
          await supabase.from('conversations').update({
            last_message: message.trim(),
            last_message_at: new Date().toISOString(),
          }).eq('id', conversationId)
        }
      }

      onWithdrawn?.()
    } catch {
      // Surfaced via the supabase update alert above; swallow downstream.
    } finally {
      setSending(false)
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
        // Same safe-area-inset envelope as DeclineModal / pipeline modals
        // — iOS Safari notch + dynamic browser chrome.
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      }}
      onClick={() => !sending && onClose()}
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
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700 }}>Mark candidate as withdrawn</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
          {candidateName} — {jobTitle}
        </p>
        <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.45 }}>
          Use this when a candidate has dropped out, stopped responding, or accepted another role. Different from Decline (which is your decision to reject).
        </p>

        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
          Message to candidate
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={7}
          disabled={templateLoading || sending}
          placeholder={templateLoading ? 'Loading template…' : ''}
          style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem', resize: 'vertical', lineHeight: 1.5, background: templateLoading ? '#f8fafc' : '#fff' }}
        />

        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.5rem 0 0' }}>
          {templateLoading
            ? 'Loading your template…'
            : isCustomTemplate
              ? 'Using your saved Withdrawn template. '
              : 'Using the default withdrawn copy. '}
          {!templateLoading && (
            <Link
              href="/settings/email-templates"
              onClick={(e) => {
                if (message !== initialMessage) {
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
            disabled={sending}
            style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
          >
            Cancel
          </button>
          <button
            onClick={handleWithdrawAndSend}
            disabled={sending || templateLoading || !message.trim()}
            // Amber (not red) — Withdraw is neutral-destructive: not a
            // rejection, just a state cleanup. Red is reserved for
            // Decline so the two adjacent kebab items are visually
            // distinguishable at a glance.
            style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: 8, background: (sending || templateLoading) ? '#94a3b8' : '#d97706', color: '#fff', cursor: (sending || templateLoading) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
          >
            {sending ? 'Sending…' : 'Mark as withdrawn'}
          </button>
        </div>
      </div>
    </div>
  )
}
