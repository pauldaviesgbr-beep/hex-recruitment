'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  getNotificationIcon,
  formatNotificationTime,
  type Notification
} from '@/lib/mockNotifications'
import styles from './NotificationBell.module.css'

interface NotificationBellProps {
  className?: string
}

export default function NotificationBell({ className }: NotificationBellProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Track if notifications table is available
  const tableOk = useRef(true)

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        // Table missing or other error — stop polling
        tableOk.current = false
      } else {
        setNotifications(data || [])
        const unread = (data || []).filter((n: Notification) => !n.read).length
        setUnreadCount(unread)
      }
    } catch {
      // Network errors — fail silently
      tableOk.current = false
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null

    loadNotifications().then(() => {
      if (tableOk.current) {
        pollInterval = setInterval(loadNotifications, 30000)
      }
    })

    return () => { if (pollInterval) clearInterval(pollInterval) }
  }, [loadNotifications])

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
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', notification.id)

        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch {
        // Fail silently on network errors
      }
    }

    setIsOpen(false)
    if (notification.link) {
      router.push(notification.link)
    }
  }

  // Handle mark all as read
  const handleMarkAllRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', session.user.id)
        .eq('read', false)

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // Fail silently on network errors
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
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>🔔</span>
                <p className={styles.emptyText}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className={styles.notificationIcon}>
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className={styles.notificationContent}>
                    <span className={styles.notificationTitle}>
                      {notification.title}
                    </span>
                    {notification.message && (
                      <span className={styles.notificationMessage}>
                        {notification.message}
                      </span>
                    )}
                    <span className={styles.notificationTime}>
                      {formatNotificationTime(notification.created_at)}
                    </span>
                  </div>
                  {!notification.read && (
                    <span className={styles.unreadDot} aria-label="Unread" />
                  )}
                </button>
              ))
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
