// Mock notifications data for DEV_MODE

export type NotificationType =
  // Employer notifications
  | 'new_application'
  | 'job_approved'
  | 'message_received'
  | 'profile_viewed'
  | 'application_status_change'
  // Job seeker notifications
  | 'job_match'
  | 'application_update'
  | 'employer_message'
  | 'profile_view'
  | 'job_saved'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message?: string
  link?: string
  related_id?: string
  related_type?: 'job' | 'application' | 'conversation' | 'profile'
  read: boolean
  created_at: string
}

// Get icon for notification type
export function getNotificationIcon(_type: NotificationType): string {
  return '🔔'
}

// Format relative time
export function formatNotificationTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Mock notifications for employers
const employerNotifications: Notification[] = [
  {
    id: 'notif-emp-1',
    user_id: 'employer-1',
    type: 'new_application',
    title: 'New application received',
    message: 'Sarah Johnson applied for Senior Chef position',
    link: '/candidates',
    related_id: 'app-1',
    related_type: 'application',
    read: false,
    created_at: new Date(Date.now() - 5 * 60000).toISOString(), // 5 mins ago
  },
  {
    id: 'notif-emp-2',
    user_id: 'employer-1',
    type: 'message_received',
    title: 'New message',
    message: 'Michael Brown sent you a message',
    link: '/messages',
    related_id: 'conv-1',
    related_type: 'conversation',
    read: false,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(), // 30 mins ago
  },
  {
    id: 'notif-emp-3',
    user_id: 'employer-1',
    type: 'profile_viewed',
    title: 'Profile viewed',
    message: 'Emma Wilson viewed your company profile',
    link: '/candidates',
    related_id: 'candidate-3',
    related_type: 'profile',
    read: false,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
  },
  {
    id: 'notif-emp-4',
    user_id: 'employer-1',
    type: 'job_approved',
    title: 'Job posting live',
    message: 'Your "Head Chef" position is now live',
    link: '/my-jobs',
    related_id: 'job-1',
    related_type: 'job',
    read: true,
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(), // Yesterday
  },
  {
    id: 'notif-emp-5',
    user_id: 'employer-1',
    type: 'new_application',
    title: 'New application received',
    message: 'James Taylor applied for Sous Chef position',
    link: '/candidates',
    related_id: 'app-2',
    related_type: 'application',
    read: true,
    created_at: new Date(Date.now() - 48 * 3600000).toISOString(), // 2 days ago
  },
]

// Mock notifications for job seekers
const jobSeekerNotifications: Notification[] = [
  {
    id: 'notif-js-1',
    user_id: 'jobseeker-1',
    type: 'application_update',
    title: 'Application reviewed',
    message: 'The Grand Hotel reviewed your application',
    link: '/applications',
    related_id: 'app-1',
    related_type: 'application',
    read: false,
    created_at: new Date(Date.now() - 10 * 60000).toISOString(), // 10 mins ago
  },
  {
    id: 'notif-js-2',
    user_id: 'jobseeker-1',
    type: 'job_match',
    title: 'New job match',
    message: 'Head Chef at The Savoy matches your profile',
    link: '/jobs/job-123',
    related_id: 'job-123',
    related_type: 'job',
    read: false,
    created_at: new Date(Date.now() - 45 * 60000).toISOString(), // 45 mins ago
  },
  {
    id: 'notif-js-3',
    user_id: 'jobseeker-1',
    type: 'employer_message',
    title: 'New message',
    message: 'Sarah Mitchell from Hospitality Plus sent you a message',
    link: '/messages',
    related_id: 'conv-2',
    related_type: 'conversation',
    read: false,
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(), // 3 hours ago
  },
  {
    id: 'notif-js-4',
    user_id: 'jobseeker-1',
    type: 'profile_view',
    title: 'Profile viewed',
    message: 'A recruiter viewed your profile',
    link: '/profile',
    related_type: 'profile',
    read: false,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(), // 5 hours ago
  },
  {
    id: 'notif-js-5',
    user_id: 'jobseeker-1',
    type: 'application_update',
    title: 'Interview invitation',
    message: 'The Ritz invited you for an interview',
    link: '/applications',
    related_id: 'app-3',
    related_type: 'application',
    read: true,
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(), // Yesterday
  },
  {
    id: 'notif-js-6',
    user_id: 'jobseeker-1',
    type: 'job_match',
    title: 'New job match',
    message: 'Sous Chef at Claridge\'s matches your criteria',
    link: '/jobs/job-456',
    related_id: 'job-456',
    related_type: 'job',
    read: true,
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(), // 3 days ago
  },
]

// Store for notification state (simulates database)
let notificationsStore: Notification[] = []
let initialized = false

// Initialize notifications based on user type
export function initializeNotifications(userType: 'employer' | 'employee'): void {
  if (initialized) return

  // Deep clone the notifications
  notificationsStore = userType === 'employer'
    ? JSON.parse(JSON.stringify(employerNotifications))
    : JSON.parse(JSON.stringify(jobSeekerNotifications))

  initialized = true
}

// Reset store (for switching users)
export function resetNotificationsStore(): void {
  notificationsStore = []
  initialized = false
}

// Get all notifications for current user
export function getNotifications(): Notification[] {
  return [...notificationsStore].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

// Get recent notifications (for dropdown)
export function getRecentNotifications(limit: number = 10): Notification[] {
  return getNotifications().slice(0, limit)
}

// Get unread count
export function getUnreadCount(): number {
  return notificationsStore.filter(n => !n.read).length
}

// Mark notification as read
export function markAsRead(notificationId: string): void {
  const notification = notificationsStore.find(n => n.id === notificationId)
  if (notification) {
    notification.read = true
  }
}

// Mark all notifications as read
export function markAllAsRead(): void {
  notificationsStore.forEach(n => {
    n.read = true
  })
}

// Add a new notification (for real-time simulation)
export function addNotification(notification: Omit<Notification, 'id' | 'created_at'>): Notification {
  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}`,
    created_at: new Date().toISOString(),
  }
  notificationsStore.unshift(newNotification)
  return newNotification
}
