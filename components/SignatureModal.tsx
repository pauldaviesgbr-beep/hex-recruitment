'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './SignatureModal.module.css'

interface SignatureModalProps {
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

export default function SignatureModal({
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
}: SignatureModalProps) {
  const [signatureName, setSignatureName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSignatureName('')
      setConfirmed(false)
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!signatureName.trim()) {
      setError('Please type your full name')
      return
    }
    if (!confirmed) {
      setError('Please confirm the declaration')
      return
    }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in')
        setSubmitting(false)
        return
      }

      const now = new Date().toISOString()

      // Update job_offers: status -> 'accepted', store signature
      const { error: updateError } = await supabase
        .from('job_offers')
        .update({
          status: 'accepted',
          signature_name: signatureName.trim(),
          signature_timestamp: now,
        })
        .eq('id', offerId)

      if (updateError) {
        console.error('Error accepting offer:', updateError)
        setError('Failed to accept offer. Please try again.')
        setSubmitting(false)
        return
      }

      // Notify employer
      await supabase.from('notifications').insert({
        user_id: employerId,
        title: 'Offer Accepted',
        message: `${candidateName} has accepted the offer for ${jobTitle}`,
        type: 'application_status_change',
        read: false,
        related_id: applicationId,
        related_type: 'application',
      })

      // Send acceptance message via conversation
      const senderName = session.user.user_metadata?.full_name || candidateName
      const messageContent = [
        `Hello,`,
        '',
        `I am pleased to accept the offer for the ${jobTitle} position at ${company}.`,
        '',
        `Signed: ${signatureName.trim()}`,
        `Date: ${new Date(now).toLocaleDateString('en-GB')}`,
        '',
        'I look forward to starting. Thank you for this opportunity.',
      ].join('\n')

      // Find existing conversation
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
      console.error('Error signing offer:', err)
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
          <h2 className={styles.title}>Accept Offer & Sign</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.offerSummary}>
          <p><strong>Position:</strong> {jobTitle} at {company}</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Typed Name Input */}
          <div className={styles.formGroup}>
            <label htmlFor="signatureName" className={styles.label}>
              Type your full name as your digital signature *
            </label>
            <input
              type="text"
              id="signatureName"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="Your full legal name"
              className={styles.input}
              autoComplete="off"
            />
          </div>

          {/* Cursive Signature Preview */}
          {signatureName.trim() && (
            <div className={styles.signaturePreview}>
              <p className={styles.signatureLabel}>Signature Preview</p>
              <div className={styles.signatureBox}>
                <span className={styles.signatureText}>{signatureName}</span>
              </div>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div className={styles.confirmationGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className={styles.checkbox}
              />
              <span>I confirm that I accept this job offer and that the typed name above serves as my digital signature.</span>
            </label>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelBtn}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !confirmed || !signatureName.trim()}
            >
              {submitting ? 'Signing...' : 'Sign & Accept Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
