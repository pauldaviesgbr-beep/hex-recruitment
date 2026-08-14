'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { useNotifications } from '@/lib/NotificationsContext'
import {
  getNotificationIcon,
  formatNotificationTime,
  type Notification
} from '@/lib/mockNotifications'
import styles from './NotificationBell.module.css'
import { Ico, type IconName } from '@/components/icons'

interface NotificationBellProps {
  className?: string
}

export default function NotificationBell({ className }: NotificationBellProps) {
  const router = useRouter()
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications()

  const [isOpen, setIsOpen] = useState(false)
  // Tracks locally-resolved interview_interest notifications so their inline
  // action buttons flip to a confirmation immediately on response.
  const [resolvedInterest, setResolvedInterest] = useState<Record<string, 'interested' | 'not_interested'>>({})
  // Local-only: hide notifications the user has just responded to in the bell
  // dropdown. They remain in the shared context so other surfaces (full
  // /notifications page, dashboard panel) still show them as read history.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle notification click — mark as read, close dropdown, navigate to link
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleNotificationClick = async (notification: Notification) => {
    // Toggle expand/collapse
    setExpandedId(prev => prev === notification.id ? null : notification.id)

    // Mark as read via shared context (optimistic update + DB write).
    if (!notification.read) {
      await markAsRead(notification.id)
    }
  }

  // Handle mark all as read
  const handleMarkAllRead = async () => {
    await markAllAsRead()
  }

  // Respond to an interview_interest notification directly from the dropdown.
  // Mirrors the logic in app/applications/page.tsx so the candidate can act
  // without navigating there first.
  const handleInterestResponse = async (
    e: React.MouseEvent,
    notification: Notification,
    response: 'interested' | 'not_interested'
  ) => {
    e.stopPropagation()
    if (!notification.related_id) return

    if (response === 'not_interested') {
      const ok = confirm("Are you sure? This will let the employer know you're no longer interested.")
      if (!ok) return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Optimistic local resolution
    setResolvedInterest(prev => ({ ...prev, [notification.id]: response }))

    const { data: appRow, error: updateError } = await supabase
      .from('job_applications')
      .update({ interview_interest_status: response })
      .eq('id', notification.related_id)
      .select('id, job_id, job_title, candidate_id, jobs(title, company, employer_id)')
      .single()

    if (updateError) {
      // Roll back optimistic state
      setResolvedInterest(prev => {
        const next = { ...prev }
        delete next[notification.id]
        return next
      })
      alert('Something went wrong. Please try again.')
      return
    }

    // Mark as read via shared context. Locally hide it from the bell so
    // the user doesn't see it as a pending action item; it stays in the
    // shared list so other surfaces (full /notifications page, dashboard
    // panel) keep it as resolved history.
    await markAsRead(notification.id)
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(notification.id)
      return next
    })

    const employerId = (appRow as any)?.jobs?.employer_id
    const jobTitle = (appRow as any)?.jobs?.title || (appRow as any)?.job_title || 'the role'
    const candidateName = session.user.user_metadata?.full_name || 'A candidate'

    // When the candidate confirms interest, also set the interview to 'confirmed'
    // so the employer dashboard reflects the updated status immediately.
    if (response === 'interested' && notification.related_id) {
      const { data: interview } = await supabase
        .from('interviews')
        .select('id, interview_date, interview_time, duration_minutes, interview_type')
        .eq('application_id', notification.related_id)
        .in('status', ['scheduled', 'pending_selection'])
        .maybeSingle()

      const companyName = (appRow as any)?.jobs?.company || ''
      const interviewDate = interview?.interview_date || ''
      const interviewTime = interview?.interview_time || ''
      const interviewType = interview?.interview_type || 'in-person'
      // Honest "awaiting scheduling" / "TBC" fallbacks rather than
      // empty strings, so any email/notification fired against a
      // pending_selection or NULL-date interview reads clearly to the
      // recipient. The confirm-without-real-date path is parked for
      // fix #1c; this just ensures it doesn't produce blank or
      // "Invalid Date" strings in the interim.
      const friendlyDate = interviewDate
        ? new Date(interviewDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : 'awaiting scheduling'
      const displayTime = interviewTime || 'TBC'

      if (interview) {
        await supabase
          .from('interviews')
          .update({ status: 'confirmed' })
          .eq('id', interview.id)

        // Sync confirmed status to Google Calendar + send candidate message
        if (employerId) {
          fetch('/api/calendar/update-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              interviewId: interview.id,
              employerId,
              date: interviewDate,
              time: interviewTime,
              duration: interview.duration_minutes || 45,
              interviewType,
              candidateName,
              jobTitle,
            }),
          }).catch(() => {})
        }
      }

      // Candidate confirmation email ("Hi Gianna, your interview is confirmed")
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'interview_confirmed',
          data: {
            recipientUserId: session.user.id,
            candidateName,
            jobTitle,
            companyName,
            date: friendlyDate,
            time: displayTime,
            interviewType,
          },
        }),
      }).catch(() => {})

      // Employer notification email ("Gianna has confirmed their interview")
      if (employerId) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'interview_confirmed_employer',
            data: {
              recipientUserId: employerId,
              candidateName,
              jobTitle,
              companyName,
              date: friendlyDate,
              time: interviewTime,
              interviewType,
            },
          }),
        }).catch(() => {})
      }
    }

    // Notify the employer
    if (notification.related_id) {
      await notify(response === 'interested' ? 'interview_confirmed' : 'interest_declined', {
        applicationId: notification.related_id,
      })
    }
  }

  // Toggle dropdown
  const toggleDropdown = () => {
    setIsOpen(!isOpen)
  }

  return (
    <div className={`${styles.container} ${className || ''}`} ref={dropdownRef}>
      <button
        className={styles.bellButton}
        onClick={toggleDropdown}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className={styles.bellIcon}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className={styles.tooltip}>Notifications</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h3 className={styles.dropdownTitle}>Notifications</h3>
            {unreadCount > 0 && (
              <button
                className={styles.markAllReadBtn}
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.notificationsList}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner}></div>
                <span>Loading...</span>
              </div>
            ) : notifications.filter(n => !dismissedIds.has(n.id)).length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}><Ico name="bell" size={20} /></span>
                <p className={styles.emptyText}>No notifications yet</p>
              </div>
            ) : (
              notifications.filter(n => !dismissedIds.has(n.id)).map(notification => {
                const isInterest = notification.type === 'interview_interest'
                const resolvedResponse = resolvedInterest[notification.id]
                return (
                  <div
                    key={notification.id}
                    className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(notification)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={styles.notificationIcon}>
                      <Ico name={getNotificationIcon(notification.type) as IconName} size={20} />
                    </span>
                    <div className={styles.notificationContent}>
                      <span className={styles.notificationTitle}>
                        {notification.title}
                      </span>
                      {notification.message && (
                        <span
                          className={styles.notificationMessage}
                          style={expandedId === notification.id ? {
                            display: 'block',
                            whiteSpace: 'normal',
                            overflow: 'visible',
                            textOverflow: 'unset',
                            WebkitLineClamp: 'unset',
                            maxHeight: 'none',
                          } : undefined}
                        >
                          {notification.message}
                        </span>
                      )}
                      {expandedId === notification.id && notification.link && (
                        <a
                          href={notification.link}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 500, marginTop: '0.25rem', display: 'inline-block' }}
                        >
                          View details →
                        </a>
                      )}
                      <span className={styles.notificationTime}>
                        {formatNotificationTime(notification.created_at)}
                      </span>
                      {isInterest && !resolvedResponse && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={(e) => handleInterestResponse(e, notification, 'interested')}
                            style={{
                              flex: 1,
                              padding: '0.5rem 0.75rem',
                              background: '#FFE500',
                              color: '#0f172a',
                              border: 'none',
                              borderRadius: 999,
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            <Ico name="check" size={16} /> Yes
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleInterestResponse(e, notification, 'not_interested')}
                            style={{
                              flex: 1,
                              padding: '0.5rem 0.75rem',
                              background: 'transparent',
                              color: '#6b7280',
                              border: '1px solid #6b7280',
                              borderRadius: 999,
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            <Ico name="x" size={16} /> No
                          </button>
                        </div>
                      )}
                      {isInterest && resolvedResponse === 'interested' && (
                        <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>
                          ✓ You&apos;re interested — the employer will be in touch.
                        </div>
                      )}
                      {isInterest && resolvedResponse === 'not_interested' && (
                        <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                          You declined this invitation.
                        </div>
                      )}
                    </div>
                    {!notification.read && (
                      <span className={styles.unreadDot} aria-label="Unread" />
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className={styles.dropdownFooter}>
            <button
              className={styles.viewAllBtn}
              onClick={() => {
                setIsOpen(false)
                router.push('/notifications')
              }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
