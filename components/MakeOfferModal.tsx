'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './MakeOfferModal.module.css'

interface MakeOfferModalProps {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  onSuccess: () => void
}

export default function MakeOfferModal({
  isOpen,
  onClose,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateId,
  candidateName,
  candidateEmail,
  onSuccess,
}: MakeOfferModalProps) {
  const [salary, setSalary] = useState('')
  const [startDate, setStartDate] = useState('')
  const [contractType, setContractType] = useState('full-time')
  const [additionalTerms, setAdditionalTerms] = useState('')
  const [offerLetter, setOfferLetter] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const twoWeeks = new Date()
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      setStartDate(twoWeeks.toISOString().split('T')[0])
      setSalary('')
      setContractType('full-time')
      setAdditionalTerms('')
      setOfferLetter(null)
      setError('')
    }
  }, [isOpen])

  const contractTypes = [
    { value: 'full-time', label: 'Full-time' },
    { value: 'part-time', label: 'Part-time' },
    { value: 'temporary', label: 'Temporary' },
    { value: 'fixed-term', label: 'Fixed-term' },
    { value: 'zero-hours', label: 'Zero-hours' },
    { value: 'casual', label: 'Casual' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to make offers')
        setSubmitting(false)
        return
      }

      if (!salary.trim()) {
        setError('Please enter a salary')
        setSubmitting(false)
        return
      }

      if (!startDate) {
        setError('Please select a start date')
        setSubmitting(false)
        return
      }

      // Upload offer letter if provided
      let offerLetterUrl: string | null = null
      if (offerLetter) {
        const fileExt = offerLetter.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const filePath = `offer-letters/${session.user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('profiles')
          .upload(filePath, offerLetter, { contentType: offerLetter.type, upsert: true })

        if (uploadError) {
          console.error('Error uploading offer letter:', uploadError)
          setError('Failed to upload offer letter. Please try again.')
          setSubmitting(false)
          return
        }

        const { data } = supabase.storage.from('profiles').getPublicUrl(filePath)
        offerLetterUrl = data.publicUrl
      }

      // Create job_offers record
      const { error: insertError } = await supabase
        .from('job_offers')
        .insert({
          application_id: applicationId,
          job_id: jobId,
          employer_id: session.user.id,
          candidate_id: candidateId,
          salary: salary.trim(),
          start_date: startDate,
          contract_type: contractType,
          additional_terms: additionalTerms.trim() || null,
          offer_letter_url: offerLetterUrl,
          status: 'pending',
        })

      if (insertError) {
        console.error('Error creating offer:', insertError)
        setError('Failed to create offer. Please try again.')
        setSubmitting(false)
        return
      }

      // Update application status to 'offered'
      await supabase
        .from('job_applications')
        .update({ status: 'offered' })
        .eq('id', applicationId)

      // Send notification to candidate
      const formattedDate = new Date(startDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      await supabase.from('notifications').insert({
        user_id: candidateId,
        title: 'Job Offer Received',
        message: `${company} has sent you a job offer for the ${jobTitle} position starting ${formattedDate}`,
        type: 'application_update',
        read: false,
        related_id: applicationId,
        related_type: 'application',
      })

      // Send message via conversation
      const contractLabel = contractTypes.find(c => c.value === contractType)?.label || contractType
      const messageContent = [
        `Hello ${candidateName},`,
        '',
        `We are pleased to offer you the position of ${jobTitle} at ${company}.`,
        '',
        'Offer Details:',
        `Salary: ${salary.trim()}`,
        `Start Date: ${formattedDate}`,
        `Contract Type: ${contractLabel}`,
        ...(additionalTerms.trim() ? ['', `Additional Terms: ${additionalTerms.trim()}`] : []),
        ...(offerLetterUrl ? ['', `Offer Letter: ${offerLetterUrl}`] : []),
        '',
        'Please review the offer and respond via your Applications page.',
        '',
        'Best regards,',
        company,
      ].join('\n')

      // Find or create conversation
      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${candidateId}),and(participant_1.eq.${candidateId},participant_2.eq.${session.user.id})`)
        .eq('related_job_id', jobId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            participant_1: session.user.id,
            participant_2: candidateId,
            participant_1_name: company,
            participant_1_role: 'employer',
            participant_1_company: company,
            participant_2_name: candidateName,
            participant_2_role: 'candidate',
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
          sender_name: company,
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

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error making offer:', err)
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
          <h2 className={styles.title}>Make Job Offer</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.candidateInfo}>
          <p className={styles.candidateName}>
            <strong>Candidate:</strong> {candidateName}
          </p>
          <p className={styles.jobInfo}>
            <strong>Position:</strong> {jobTitle} at {company}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Salary */}
          <div className={styles.formGroup}>
            <label htmlFor="salary" className={styles.label}>
              Annual Salary / Hourly Rate *
            </label>
            <input
              type="text"
              id="salary"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 28,000 per annum or 12.50 per hour"
              className={styles.input}
              required
            />
          </div>

          {/* Start Date */}
          <div className={styles.formGroup}>
            <label htmlFor="startDate" className={styles.label}>
              Proposed Start Date *
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className={styles.input}
              required
            />
          </div>

          {/* Contract Type */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Contract Type *</label>
            <div className={styles.radioGroup}>
              {contractTypes.map((ct) => (
                <label key={ct.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="contractType"
                    value={ct.value}
                    checked={contractType === ct.value}
                    onChange={(e) => setContractType(e.target.value)}
                    className={styles.radio}
                  />
                  <span>{ct.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Offer Letter Upload */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Offer Letter (Optional)</label>
            <div className={styles.fileUpload}>
              <input
                type="file"
                id="offerLetter"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setOfferLetter(e.target.files?.[0] || null)}
                className={styles.fileInput}
              />
              <span className={styles.fileUploadLabel}>
                <strong>Click to upload</strong>
                PDF, DOC, or DOCX
              </span>
              {offerLetter && (
                <p className={styles.fileName}>{offerLetter.name}</p>
              )}
            </div>
          </div>

          {/* Additional Terms */}
          <div className={styles.formGroup}>
            <label htmlFor="additionalTerms" className={styles.label}>
              Additional Terms (Optional)
            </label>
            <textarea
              id="additionalTerms"
              value={additionalTerms}
              onChange={(e) => setAdditionalTerms(e.target.value)}
              placeholder="Any additional terms, benefits, or conditions..."
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
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Sending Offer...' : 'Send Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
