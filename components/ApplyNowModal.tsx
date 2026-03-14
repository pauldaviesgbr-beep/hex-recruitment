'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Job } from '@/lib/mockJobs'
import { supabase } from '@/lib/supabase'
import { useMessages } from '@/lib/MessagesContext'
import type { Conversation } from '@/lib/mockMessages'
import styles from './ApplyNowModal.module.css'

interface ApplyNowModalProps {
  job: Job
  isOpen: boolean
  onClose: () => void
  onSuccess: (jobId: string) => void
}

export default function ApplyNowModal({ job, isOpen, onClose, onSuccess }: ApplyNowModalProps) {
  const { addConversation } = useMessages()

  const [coverLetter, setCoverLetter] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [cvUrl, setCvUrl] = useState<string | null>(null)
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const [loadingCv, setLoadingCv] = useState(true)

  const coverLetterRequired = (job.tags || []).includes('Cover letter required')
  const cvRequired = (job.tags || []).includes('CV required')

  // Reset state when modal opens for a different job
  useEffect(() => {
    if (isOpen) {
      setCoverLetter('')
      setSubmitted(false)
    }
  }, [isOpen, job.id])

  // Fetch candidate CV info
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const fetchCv = async () => {
      setLoadingCv(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) {
        setLoadingCv(false)
        return
      }
      const { data } = await supabase
        .from('candidate_profiles')
        .select('cv_url, cv_file_name')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!cancelled) {
        setCvUrl(data?.cv_url ?? null)
        setCvFileName(data?.cv_file_name ?? null)
        setLoadingCv(false)
      }
    }
    fetchCv()
    return () => { cancelled = true }
  }, [isOpen, job.id])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const formatSalary = () => {
    if (job.salaryPeriod === 'hour') {
      return `£${job.salaryMin} - £${job.salaryMax} per hour`
    }
    return `£${job.salaryMin.toLocaleString()} - £${job.salaryMax.toLocaleString()} per year`
  }

  const handleSubmit = async () => {
    if (coverLetterRequired && !coverLetter.trim()) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const candidateName = session.user.user_metadata?.full_name || 'Candidate'

      // 1. Insert application
      const { error: insertError } = await supabase
        .from('job_applications')
        .insert({
          job_id: job.id,
          candidate_id: session.user.id,
          status: 'pending',
          cover_letter: coverLetter || null,
          job_title: job.title,
          company: job.company,
        })
      if (insertError) {
        console.warn('Supabase insert warning:', insertError.message)
      }

      // 2. Notify employer
      if (job.employerId) {
        try {
          await supabase.from('notifications').insert({
            user_id: job.employerId,
            type: 'new_application',
            title: 'New application received',
            message: `${candidateName} applied for ${job.title}`,
            link: '/my-jobs',
            related_id: job.id,
            related_type: 'application',
          })
        } catch {
          // Non-blocking
        }
      }

      // 3. Send email (non-blocking)
      fetch('/api/send-application-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          employerId: job.employerId,
          candidateName,
          candidateEmail: session.user.email,
          coverLetter: coverLetter || '',
        }),
      }).catch(() => console.warn('Failed to send application email'))

      // 4. Auto-message to employer
      const autoMessage = `Hi, I've just applied for the ${job.title} position at ${job.company}. I'm very interested in this opportunity and would love to discuss it further. Please feel free to review my profile and CV. Thank you!`

      if (job.employerId) {
        try {
          const { data: employerProfile } = await supabase
            .from('employer_profiles')
            .select('company_name')
            .eq('user_id', job.employerId)
            .maybeSingle()

          const employerName = employerProfile?.company_name || job.company

          const { data: convData, error: convError } = await supabase
            .from('conversations')
            .insert({
              participant_1: session.user.id,
              participant_2: job.employerId,
              participant_1_name: candidateName,
              participant_1_role: 'candidate',
              participant_2_name: employerName,
              participant_2_role: 'employer',
              participant_2_company: job.company,
              related_job_id: job.id,
              related_job_title: job.title,
              last_message: autoMessage,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (convError) {
            console.warn('Failed to create conversation:', convError.message)
          }

          if (convData) {
            await supabase
              .from('messages')
              .insert({
                conversation_id: convData.id,
                sender_id: session.user.id,
                sender_name: candidateName,
                sender_role: 'candidate',
                content: autoMessage,
                is_read: false,
              })

            const newConv: Conversation = {
              id: convData.id,
              connectionId: convData.id,
              participantId: job.employerId,
              participantName: employerName,
              participantRole: 'employer',
              participantCompany: job.company,
              participantProfilePicture: job.companyLogo || null,
              lastMessage: autoMessage,
              lastMessageAt: new Date().toISOString(),
              unreadCount: 0,
              isOnline: false,
              participantJobTitle: job.title,
            }
            addConversation(newConv)
          }
        } catch (convErr) {
          console.warn('Auto-message failed (non-blocking):', convErr)
        }
      }

      setSubmitted(true)
      onSuccess(job.id)
    } catch (err) {
      console.error('Application error:', err)
      alert('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.modal}>
        {!submitted ? (
          <>
            <div className={styles.header}>
              <h2>Apply to {job.company}</h2>
              <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
            </div>

            <div className={styles.body}>
              {/* Job info */}
              <div className={styles.jobInfo}>
                <h3>{job.title}</h3>
                <p>{job.location} &bull; {formatSalary()}</p>
              </div>

              {/* CV section */}
              <div className={styles.cvSection}>
                {loadingCv ? (
                  <p className={styles.cvLoading}>Loading CV info...</p>
                ) : cvUrl ? (
                  <label className={styles.cvCheckboxRow}>
                    <input type="checkbox" defaultChecked readOnly />
                    <div className={styles.cvCheckboxText}>
                      <span className={styles.cvLabel}>Apply with your saved CV</span>
                      <span className={styles.cvFilename}>{cvFileName || 'your-cv.pdf'}</span>
                    </div>
                  </label>
                ) : (
                  <div className={cvRequired ? styles.cvWarning : styles.cvNoCv}>
                    {cvRequired ? (
                      <>
                        <span className={styles.cvWarningIcon}>⚠️</span>
                        <div>
                          <p className={styles.cvWarningTitle}>No CV saved</p>
                          <p className={styles.cvWarningText}>
                            This employer requires a CV.{' '}
                            <Link href="/cv-builder" className={styles.cvLink}>Upload your CV</Link>
                            {' '}before applying.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className={styles.cvNoCvText}>
                        No CV saved yet.{' '}
                        <Link href="/cv-builder" className={styles.cvLink}>Add a CV</Link>
                        {' '}to strengthen your application.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Cover letter */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  {coverLetterRequired ? 'Cover Letter (required)' : 'Cover Letter (optional)'}
                </label>
                <textarea
                  className={`${styles.textarea} ${coverLetterRequired && !coverLetter.trim() ? styles.textareaRequired : ''}`}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder={
                    coverLetterRequired
                      ? 'A cover letter is required for this role. Tell the employer why you\'re a great fit...'
                      : 'Tell the employer why you\'re a great fit for this role...'
                  }
                  rows={6}
                />
                {coverLetterRequired && !coverLetter.trim() && (
                  <p className={styles.fieldHint}>A cover letter is required for this role</p>
                )}
              </div>
            </div>

            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={isSubmitting || (coverLetterRequired && !coverLetter.trim())}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.success}>
            <div className={styles.successIcon}>✓</div>
            <h2>Application Submitted!</h2>
            <p>Your application has been sent to {job.company}.</p>
            <p className={styles.successNote}>They will contact you if they&apos;re interested.</p>
            <button className={styles.successBtn} onClick={onClose}>
              Continue Browsing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
