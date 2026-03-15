'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './ScheduleInterviewModal.module.css'

interface ScheduleInterviewModalProps {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  jobLocation?: string
  existingInterviewId?: string
  onSuccess: () => void
}

export default function ScheduleInterviewModal({
  isOpen,
  onClose,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateId,
  candidateName,
  candidateEmail,
  existingInterviewId,
  onSuccess,
}: ScheduleInterviewModalProps) {
  const [interviewDate, setInterviewDate] = useState('')
  const [interviewTime, setInterviewTime] = useState('')
  const [duration, setDuration] = useState(30)
  const [shareLink, setShareLink] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [calendarOpened, setCalendarOpened] = useState(false)

  const handleOpenCalendar = () => {
    const title = jobTitle ? `Interview - ${jobTitle}` : 'Interview'
    const details = candidateName ? `Interview with ${candidateName}` : 'Interview'
    const guestParam = candidateEmail ? `&add=${encodeURIComponent(candidateEmail)}` : ''

    let dateParams = ''
    if (interviewDate && interviewTime) {
      // Parse components explicitly to avoid browser timezone parsing differences
      const [year, month, day] = interviewDate.split('-').map(Number)
      const [hours, minutes] = interviewTime.split(':').map(Number)
      const start = new Date(year, month - 1, day, hours, minutes, 0)
      const end = new Date(start.getTime() + duration * 60000)

      const pad = (n: number) => String(n).padStart(2, '0')
      const formatLocal = (d: Date) =>
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`

      dateParams = `&dates=${formatLocal(start)}/${formatLocal(end)}`
    }

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}${dateParams}${guestParam}`
    window.open(url, '_blank')
    setCalendarOpened(true)
  }

  const handleSubmit = async () => {
    setError('')

    if (!interviewDate || !interviewTime) {
      setError('Please enter the interview date and time')
      return
    }
    if (!shareLink.trim()) {
      setError('Please paste the Google Calendar share link')
      return
    }

    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to send interview invites')
        setSubmitting(false)
        return
      }

      const isReschedule = !!existingInterviewId

      // If rescheduling, mark the old interview as rescheduled
      if (isReschedule) {
        await supabase
          .from('interviews')
          .update({ status: 'rescheduled' })
          .eq('id', existingInterviewId)
          .catch((err: unknown) => console.error('Error marking old interview as rescheduled:', err))
      }

      // Update application status to "interviewing"
      await supabase
        .from('job_applications')
        .update({ status: 'interviewing' })
        .eq('id', applicationId)

      // Insert new interview record
      await supabase.from('interviews').insert({
        application_id: applicationId,
        job_id: jobId,
        employer_id: session.user.id,
        candidate_id: candidateId,
        interview_date: interviewDate,
        interview_time: interviewTime,
        duration_minutes: duration,
        interview_type: 'in-person',
        location_or_link: shareLink.trim(),
        notes: notes.trim() || null,
        status: 'scheduled',
      })

      // Format date for messages and emails
      const [year, month, day] = interviewDate.split('-').map(Number)
      const formattedDate = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const interviewTypeLabel = 'In Person'

      // Build message content — different for reschedules vs new invites
      let messageContent: string
      let notificationTitle: string
      let notificationMessage: string

      if (isReschedule) {
        const firstName = candidateName.split(' ')[0]
        messageContent = [
          `Hi ${firstName}, I wanted to let you know your interview for ${jobTitle} has been rescheduled.`,
          '',
          `Your new interview is on ${formattedDate} at ${interviewTime} (${interviewTypeLabel}).`,
          '',
          'Click the link below to view the updated calendar invite:',
          shareLink.trim(),
          '',
          'Please let me know if you have any questions.',
          '',
          'Best regards,',
          company,
        ].join('\n')
        notificationTitle = 'Interview Rescheduled'
        notificationMessage = `${company} has rescheduled your interview for ${jobTitle}. New date: ${formattedDate} at ${interviewTime}.`
      } else {
        const messageLines = [
          `Hello ${candidateName},`,
          '',
          `You've been invited to an interview for the ${jobTitle} position at ${company}.`,
          '',
          'Click the link below to view the calendar invite:',
          shareLink.trim(),
        ]
        if (notes.trim()) {
          messageLines.push('', notes.trim())
        }
        messageLines.push('', 'Best regards,', company)
        messageContent = messageLines.join('\n')
        notificationTitle = 'Interview Invitation'
        notificationMessage = `${company} has invited you for an interview for the ${jobTitle} position. View invite: ${shareLink.trim()}`
      }

      // Send in-app notification
      await supabase.from('notifications').insert({
        user_id: candidateId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'application_update',
        read: false,
        related_id: applicationId,
        related_type: 'application',
      })

      // Send email notification (fire & forget — never block the reschedule)
      if (candidateEmail) {
        if (isReschedule) {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: candidateEmail,
              type: 'interview_rescheduled',
              data: {
                companyName: company,
                jobTitle,
                candidateName,
                date: formattedDate,
                time: interviewTime,
                interviewType: interviewTypeLabel,
              },
            }),
          }).catch((err: unknown) => console.error('Error sending reschedule email:', err))
        } else {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: candidateEmail,
              type: 'interview_scheduled',
              data: {
                companyName: company,
                jobTitle,
                date: formattedDate,
                time: interviewTime,
                notes: notes.trim() || undefined,
              },
            }),
          }).catch(() => {})
        }
      }

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
          await supabase
            .from('conversations')
            .update({
              last_message: messageContent,
              last_message_at: new Date().toISOString(),
            })
            .eq('id', conversationId)
        }
      }

      onSuccess()
      onClose()
      // Reset state
      setInterviewDate('')
      setInterviewTime('')
      setDuration(30)
      setShareLink('')
      setNotes('')
      setCalendarOpened(false)
    } catch (err) {
      console.error('Error sending interview invite:', err)
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
          <h2 className={styles.title}>{existingInterviewId ? 'Reschedule Interview' : 'Send Calendar Invite'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.instructions}>
            Create your calendar event first, then paste the share link here to send to the candidate.
          </p>

          <div className={styles.step}>
            <label className={styles.stepLabel}>1. Set the date &amp; time</label>
            <div className={styles.dateTimeRow}>
              <div className={styles.dateTimeField}>
                <label htmlFor="interviewDate" className={styles.fieldLabel}>Date</label>
                <input
                  type="date"
                  id="interviewDate"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.dateTimeField}>
                <label htmlFor="interviewTime" className={styles.fieldLabel}>Time</label>
                <input
                  type="time"
                  id="interviewTime"
                  value={interviewTime}
                  onChange={(e) => setInterviewTime(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.dateTimeField}>
                <label htmlFor="duration" className={styles.fieldLabel}>Duration</label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={styles.input}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <label className={styles.stepLabel}>2. Create your calendar event</label>
            <button
              type="button"
              className={styles.calendarBtn}
              onClick={handleOpenCalendar}
            >
              Open Google Calendar
            </button>
            {calendarOpened && (
              <p className={styles.calendarHint}>
                Google Calendar opened in a new tab.
              </p>
            )}
          </div>

          <div className={styles.step}>
            <label htmlFor="shareLink" className={styles.stepLabel}>3. Paste the share link</label>
            <input
              type="url"
              id="shareLink"
              value={shareLink}
              onChange={(e) => setShareLink(e.target.value)}
              placeholder="https://calendar.google.com/calendar/event?eid=..."
              className={styles.input}
            />
            <p className={styles.helperText}>
              After saving your event in Google Calendar, click the event, then copy the event link.
            </p>
          </div>

          <div className={styles.step}>
            <label htmlFor="notes" className={styles.stepLabel}>
              Additional Notes <span className={styles.optional}>(Optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information for the candidate..."
              rows={3}
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
            <button
              type="button"
              onClick={handleSubmit}
              className={styles.submitBtn}
              disabled={submitting}
            >
              {submitting ? 'Sending...' : 'Send to Candidate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
