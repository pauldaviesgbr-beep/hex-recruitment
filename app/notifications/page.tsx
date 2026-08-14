'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import {
  initializeNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead as mockMarkAsRead,
  markAllAsRead as mockMarkAllAsRead,
  getNotificationIcon,
  formatNotificationTime,
  type Notification
} from '@/lib/mockNotifications'
import { useNotifications } from '@/lib/NotificationsContext'
import styles from './page.module.css'
import { Ico, type IconName } from '@/components/icons'

export default function NotificationsPage() {
  const router = useRouter()

  // Production: read from the shared NotificationsProvider (single fetch +
  // realtime subscription; the previous local channel + initial GET were
  // duplicates of what the context already does).
  const ctx = useNotifications()
  // DEV_MODE: keep the existing in-memory mock store.
  const [mockNotifs, setMockNotifs] = useState<Notification[]>([])
  const [mockLoading, setMockLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const notifications = DEV_MODE ? mockNotifs : ctx.notifications
  const loading = DEV_MODE ? mockLoading : ctx.isLoading

  useEffect(() => {
    if (!DEV_MODE) return // Production path is fully handled by the context.
    const userType = getMockUserType()
    if (!userType) {
      router.push('/login')
      return
    }
    initializeNotifications(userType)
    setMockNotifs(getNotifications())
    setMockLoading(false)
  }, [router])

  // Redirect to login if there's no session in production.
  useEffect(() => {
    if (DEV_MODE) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    }).catch(() => {})
  }, [router])

  const handleMarkAsRead = async (notification: Notification) => {
    if (!notification.read) {
      if (DEV_MODE) {
        mockMarkAsRead(notification.id)
        setMockNotifs(getNotifications())
      } else {
        await ctx.markAsRead(notification.id)
      }
    }

    // Navigate to link if provided
    if (notification.link) {
      router.push(notification.link)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (DEV_MODE) {
      mockMarkAllAsRead()
      setMockNotifs(getNotifications())
    } else {
      await ctx.markAllAsRead()
    }
  }

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  const unreadCount = notifications.filter(n => !n.read).length

  // Group notifications by date
  const groupNotificationsByDate = (notifs: Notification[]) => {
    const groups: { [key: string]: Notification[] } = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    notifs.forEach(notif => {
      const date = new Date(notif.created_at)
      date.setHours(0, 0, 0, 0)

      let groupKey: string
      if (date.getTime() === today.getTime()) {
        groupKey = 'Today'
      } else if (date.getTime() === yesterday.getTime()) {
        groupKey = 'Yesterday'
      } else if (date >= weekAgo) {
        groupKey = 'This Week'
      } else {
        groupKey = 'Earlier'
      }

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(notif)
    })

    return groups
  }

  const groupedNotifications = groupNotificationsByDate(filteredNotifications)
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier']

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading notifications...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/dashboard" className={styles.breadcrumbLink}>Home</Link>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>Notifications</span>
        </nav>

        {/* Back button (mobile) */}
        <button className={styles.backBtn} onClick={() => router.back()} aria-label="Go back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Notifications</h1>
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount} unread</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              className={styles.markAllReadBtn}
              onClick={handleMarkAllAsRead}
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterTab} ${filter === 'all' ? styles.active : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`${styles.filterTab} ${filter === 'unread' ? styles.active : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread
            {unreadCount > 0 && <span className={styles.tabBadge}>{unreadCount}</span>}
          </button>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><Ico name="bell" size={20} /></span>
            <h2 className={styles.emptyTitle}>
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </h2>
            <p className={styles.emptyText}>
              {filter === 'unread'
                ? "You're all caught up!"
                : "When you receive notifications, they'll appear here."}
            </p>
          </div>
        ) : (
          <div className={styles.notificationGroups}>
            {groupOrder.map(groupKey => {
              const groupNotifs = groupedNotifications[groupKey]
              if (!groupNotifs || groupNotifs.length === 0) return null

              return (
                <div key={groupKey} className={styles.notificationGroup}>
                  <h3 className={styles.groupTitle}>{groupKey}</h3>
                  <div className={styles.notificationsList}>
                    {groupNotifs.map(notification => (
                      <button
                        key={notification.id}
                        className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''}`}
                        onClick={() => handleMarkAsRead(notification)}
                      >
                        <span className={styles.notificationIcon}>
                          <Ico name={getNotificationIcon(notification.type) as IconName} size={20} />
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
                          <span className={styles.unreadDot} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
