'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './DeclineOfferModal.module.css'

interface DeclineOfferModalProps {
  isOpen: boolean
  onClose: () => void
  offerId: string
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateName: string
  employerId: string
  onSuccess: () => void
}

export default function DeclineOfferModal({
  isOpen,
  onClose,
  offerId,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateName,
  employerId,
  onSuccess,
}: DeclineOfferModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setReason('')
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in')
        setSubmitting(false)
        return
      }

      // Update offer status to 'declined'
      const { error: updateError } = await supabase
        .from('job_offers')
        .update({
          status: 'declined',
          decline_reason: reason.trim() || null,
        })
        .eq('id', offerId)

      if (updateError) {
        console.error('Error declining offer:', updateError)
        setError('Failed to decline offer. Please try again.')
        setSubmitting(false)
        return
      }

      // Notify employer
      const notificationMessage = reason.trim()
        ? `${candidateName} has declined the offer for ${jobTitle}. Reason: ${reason.trim()}`
        : `${candidateName} has declined the offer for ${jobTitle}.`

      await supabase.from('notifications').insert({
        user_id: employerId,
        title: 'Offer Declined',
        message: notificationMessage,
        type: 'application_status_change',
        read: false,
        related_id: applicationId,
        related_type: 'application',
      })

      // Send decline message via conversation
      const senderName = session.user.user_metadata?.full_name || candidateName
      const messageContent = [
        `Hello,`,
        '',
        `Thank you for the offer for the ${jobTitle} position at ${company}. After careful consideration, I have decided to decline this offer.`,
        ...(reason.trim() ? ['', `Reason: ${reason.trim()}`] : []),
        '',
        'Thank you for your time and consideration.',
      ].join('\n')

      // Find or create conversation
      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${employerId}),and(participant_1.eq.${employerId},participant_2.eq.${session.user.id})`)
        .eq('related_job_id', jobId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            participant_1: session.user.id,
            participant_2: employerId,
            participant_1_name: senderName,
            participant_1_role: 'candidate',
            participant_2_name: company,
            participant_2_role: 'employer',
            participant_2_company: company,
            related_job_id: jobId,
            related_job_title: jobTitle,
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (convError) {
          console.error('Error creating conversation:', convError)
        } else if (newConv) {
          conversationId = newConv.id
        }
      }

      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: session.user.id,
          sender_name: senderName,
          sender_role: 'candidate',
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

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error declining offer:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Decline Offer</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.warningBanner}>
          <p>Are you sure you want to decline the offer for <strong>{jobTitle}</strong> at <strong>{company}</strong>?</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="declineReason" className={styles.label}>
              Reason for declining (Optional)
            </label>
            <textarea
              id="declineReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="You can optionally share why you're declining this offer..."
              rows={4}
              className={styles.textarea}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelBtn}
              disabled={submitting}
            >
              Keep Offer
            </button>
            <button type="submit" className={styles.declineBtn} disabled={submitting}>
              {submitting ? 'Declining...' : 'Decline Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
