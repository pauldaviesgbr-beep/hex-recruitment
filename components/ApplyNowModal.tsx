'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Job } from '@/lib/mockJobs'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { useMessages } from '@/lib/MessagesContext'
import PushPriming from '@/components/PushPriming'
import type { Conversation } from '@/lib/mockMessages'
import styles from './ApplyNowModal.module.css'
import { Ico } from '@/components/icons'
import { isFixtureGuardError, FIXTURE_GUARD_MESSAGE } from '@/lib/applicationGuard'

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
  /** Attach the profile CV to this application? Defaults on; see the control below. */
  const [useSavedCv, setUseSavedCv] = useState(true)
  const [loadingCv, setLoadingCv] = useState(true)
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string>>({})

  const coverLetterRequired = (job.tags || []).includes('Cover letter required')
  const cvRequired = (job.tags || []).includes('CV required')
  const questions = job.screeningQuestions || []

  // Reset state when modal opens for a different job
  useEffect(() => {
    if (isOpen) {
      setCoverLetter('')
      setSubmitted(false)
      setScreeningAnswers({})
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

      // Track apply start
      if (session?.user?.id && job?.id) {
        supabase.from('apply_starts').insert({
          job_id: job.id,
          candidate_id: session.user.id,
        }).then(() => {})  // fire and forget, no await needed
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

  const [cvError, setCvError] = useState<string | null>(null)

  // Check if all required screening questions are answered
  const unansweredRequired = questions.filter(q => q.required && !screeningAnswers[q.id]?.trim())

  const handleSubmit = async () => {
    setCvError(null)
    if (coverLetterRequired && !coverLetter.trim()) return
    if (cvRequired && !cvUrl) {
      setCvError('This job requires a CV. Please upload one in the CV Builder before applying.')
      return
    }
    if (unansweredRequired.length > 0) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const candidateName = session.user.user_metadata?.full_name || 'Candidate'

      // Check for existing application
      const { data: existing } = await supabase
        .from('job_applications')
        .select('id')
        .eq('job_id', job.id)
        .eq('candidate_id', session.user.id)
        .maybeSingle()

      if (existing) {
        setSubmitted(true)
        onSuccess(job.id)
        return
      }

      // 1. Insert application (with screening answers if any)
      const appData: Record<string, any> = {
        job_id: job.id,
        candidate_id: session.user.id,
        status: 'pending',
        cover_letter: coverLetter || null,
        job_title: job.title,
        company: job.company,
        // RECORD WHAT THEY APPLIED WITH. This key was simply absent, so every
        // application ever made carried cv_url null — including the 24 whose
        // author had a CV sitting on their profile. The column was named
        // exactly right and never populated: the expires_at shape.
        //
        // Null when they have no CV, or unticked the box above, and that null
        // is now TRUE rather than meaningless.
        cv_url: useSavedCv ? cvUrl : null,
      }
      if (questions.length > 0) {
        appData.screening_answers = questions.map(q => ({
          question: q.question,
          answer: screeningAnswers[q.id] || '',
          required: q.required,
        }))
      }
      const { error: insertError } = await supabase
        .from('job_applications')
        .insert(appData)
      if (insertError) {
        // THE GUARD'S OWN SENTENCE, NOT THE SERVER'S. The trigger raises a
        // marker; what a person reads is written by us. This path already
        // returned before notifying on 23505, which is why it needed no other
        // repair — the /jobs copy did not, and emailed the employer anyway.
        if (isFixtureGuardError(insertError)) {
          // ALERTED HERE, NOT THROWN. The catch below shows a fixed "Failed to
          // submit application. Please try again." and discards err.message —
          // and "try again" is actively wrong advice for a refusal that can
          // never succeed. The requirement was that it say WHY.
          alert(FIXTURE_GUARD_MESSAGE)
          return
        }
        if (insertError.code === '23505') {
          setSubmitted(true)
          onSuccess(job.id)
          return
        }
        throw new Error(insertError.message)
      }

      // Mark as success immediately — steps below are non-blocking
      setSubmitted(true)
      onSuccess(job.id)

      // 2. Notify employer (the route finds the application this caller just
      //    created from the job + candidate relationship)
      await notify('applied', { jobId: job.id })

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
                  /*
                    THIS CONTROL USED TO BE DECORATIVE — `defaultChecked readOnly`
                    with no state behind it. It told the candidate "Apply with
                    your saved CV", could not be unticked, and the CV was never
                    attached: all 59 applications carried cv_url null while 24
                    candidates had a CV on file. A control that makes a promise
                    and does nothing is worse than no control.
                    It is now real: it decides whether the CV is recorded on the
                    application, and defaults to on because that is what almost
                    everyone wants.
                  */
                  <label className={styles.cvCheckboxRow}>
                    <input
                      type="checkbox"
                      checked={useSavedCv}
                      onChange={e => setUseSavedCv(e.target.checked)}
                    />
                    <div className={styles.cvCheckboxText}>
                      <span className={styles.cvLabel}>Apply with your saved CV</span>
                      <span className={styles.cvFilename}>{cvFileName || 'your-cv.pdf'}</span>
                    </div>
                  </label>
                ) : (
                  <div className={cvRequired ? styles.cvWarning : styles.cvNoCv}>
                    {cvRequired ? (
                      <>
                        <span className={styles.cvWarningIcon}><Ico name="alert-triangle" size={20} /></span>
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
              {/* Screening questions */}
              {questions.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#0f172a' }}>
                    Screening Questions
                  </h4>
                  {questions.map(q => (
                    <div key={q.id} className={styles.field} style={{ marginBottom: '0.75rem' }}>
                      <label className={styles.fieldLabel}>
                        {q.question} {q.required && <span style={{ color: '#dc2626' }}>*</span>}
                      </label>
                      <textarea
                        className={`${styles.textarea} ${q.required && !screeningAnswers[q.id]?.trim() ? styles.textareaRequired : ''}`}
                        value={screeningAnswers[q.id] || ''}
                        onChange={e => setScreeningAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Your answer..."
                        rows={3}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cvError && (
              <div style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                {cvError} <Link href="/cv-builder" style={{ color: '#dc2626', fontWeight: 600 }}>Go to CV Builder</Link>
              </div>
            )}
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={isSubmitting || (coverLetterRequired && !coverLetter.trim()) || (cvRequired && !cvUrl) || unansweredRequired.length > 0}
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
            {/*
              THE PERMISSION ASK LIVES HERE AND NOWHERE ELSE.
              This is the only moment in the product where the candidate is now
              WAITING FOR A HUMAN TO REPLY, which is exactly what the
              notification delivers — so it is the only place the ask has
              something true to promise. Saving a job creates no expectation of
              anyone getting back to you, so priming there would be asking for a
              permission in exchange for nothing.
              It renders after the submit has succeeded, never on arrival.
            */}
            <PushPriming trigger={submitted} />
            <button className={styles.successBtn} onClick={onClose}>
              Continue Browsing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
