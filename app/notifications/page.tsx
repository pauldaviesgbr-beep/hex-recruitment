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
import styles from './page.module.css'

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    const loadNotifications = async () => {
      if (DEV_MODE) {
        const userType = getMockUserType()
        if (!userType) {
          router.push('/login')
          return
        }
        initializeNotifications(userType)
        setNotifications(getNotifications())
        setLoading(false)
        return
      }

      // Non-dev mode: check session and fetch from Supabase
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          router.push('/login')
          return
        }

        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching notifications:', error)
        } else {
          setNotifications(data || [])
        }
      } catch (error) {
        console.error('Error loading notifications:', error)
      }
      setLoading(false)
    }

    loadNotifications()

    // Subscribe to realtime notifications (production only)
    let channel: ReturnType<typeof supabase.channel> | null = null

    if (!DEV_MODE) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return

        channel = supabase
          .channel('notifications-page')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${session.user.id}`,
            },
            (payload) => {
              setNotifications(prev => [payload.new as Notification, ...prev])
            }
          )
          .subscribe()
      }).catch(() => {
        // Fail silently if session check fails
      })
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [router])

  const handleMarkAsRead = async (notification: Notification) => {
    if (!notification.read) {
      if (DEV_MODE) {
        mockMarkAsRead(notification.id)
        setNotifications(getNotifications())
      } else {
        try {
          await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notification.id)

          setNotifications(prev =>
            prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
          )
        } catch (error) {
          console.error('Error marking notification as read:', error)
        }
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
      setNotifications(getNotifications())
    } else {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', session.user.id)
          .eq('read', false)

        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      } catch (error) {
        console.error('Error marking all as read:', error)
      }
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
            <span className={styles.emptyIcon}>🔔</span>
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
