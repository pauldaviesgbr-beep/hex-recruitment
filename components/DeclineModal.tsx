'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
// The default words and the {{name}} filler are SHARED with the server sender
// (lib/declineNotice), so the message an employer previews here is the one a
// one-tap Not a fit sends. Whatever is finally in the textarea is sent as the
// single source of truth (email + in-app conversation message).
import { DEFAULT_REJECTED_BODY, fillTemplate as applyVars } from '@/lib/declineCopy'
import styles from './DeclineModal.module.css'

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

  // The new card style: a centred card from 768 up, a bottom sheet on a phone
  // (Claude Design, 15 Nov 2026). The safe-area envelope lives in the
  // stylesheet, for the same notch reason the inline version carried.
  return (
    <div className={styles.overlay} onClick={() => !rejectSending && onClose()}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="decline-title"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="decline-title" className={styles.title}>Mark as not a fit</h3>
        <p className={styles.sub}>
          {[candidateName, jobTitle].filter(Boolean).join(' · ')}
        </p>

        <label htmlFor="decline-message" className={styles.label}>
          Your message to them
        </label>
        <textarea
          id="decline-message"
          className={styles.textarea}
          value={rejectMessage}
          onChange={e => setRejectMessage(e.target.value)}
          rows={7}
          disabled={rejectTemplateLoading || rejectSending}
          placeholder={rejectTemplateLoading ? 'Loading template…' : ''}
        />

        <p className={styles.note}>
          {rejectTemplateLoading
            ? 'Loading your template…'
            : rejectIsCustomTemplate
              ? 'Using your saved Not a fit template. '
              : 'Using the default message. '}
          {!rejectTemplateLoading && (
            <Link
              href="/settings/email-templates"
              onClick={(e) => {
                if (rejectMessage !== rejectInitialMessage) {
                  const ok = window.confirm('You have unsaved edits in this message. Leave to edit your saved template?')
                  if (!ok) e.preventDefault()
                }
              }}
            >
              Edit your template
            </Link>
          )}
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={rejectSending}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={handleDeclineAndSend}
            disabled={rejectSending || rejectTemplateLoading || !rejectMessage.trim()}
          >
            {rejectSending ? 'Sending…' : 'Send and mark not a fit'}
          </button>
        </div>
      </div>
    </div>
  )
}
