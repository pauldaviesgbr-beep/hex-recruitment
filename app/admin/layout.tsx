'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, Briefcase, FileText, CreditCard,
  MessageSquare, Star, BarChart3, Mail, Settings, ArrowLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ADMIN_EMAILS } from '@/lib/admin-client'
import { AdminContext } from '@/lib/admin-context'
import styles from './layout.module.css'

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/admin/applications', label: 'Applications', icon: FileText },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/emails', label: 'Emails', icon: Mail },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const didCheck = useRef(false)

  const runCheck = () => {
    didCheck.current = false
    setLoading(true)
    setError(null)
    setAuthorized(false)
    setAccessToken(null)
  }

  useEffect(() => {
    if (didCheck.current) return
    didCheck.current = true

    // 5-second timeout
    const timeout = setTimeout(() => {
      if (!authorized) {
        setError('Verification timed out. The session check took too long.')
        setLoading(false)
      }
    }, 5000)

    const checkAdmin = async () => {
      try {
        // First try getSession (reads from storage)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('[Admin] Session error:', sessionError.message)
          clearTimeout(timeout)
          setError(`Session error: ${sessionError.message}`)
          setLoading(false)
          return
        }

        if (!session) {
          console.warn('[Admin] No session found, redirecting to homepage')
          clearTimeout(timeout)
          setError('You must be logged in as an admin to access this page.')
          setLoading(false)
          return
        }

        const email = session.user.email?.toLowerCase() || ''
        if (!ADMIN_EMAILS.includes(email)) {
          console.warn('[Admin] User is not an admin:', email)
          clearTimeout(timeout)
          setError('Your account does not have admin access.')
          setLoading(false)
          return
        }

        clearTimeout(timeout)
        setAccessToken(session.access_token)
        setAuthorized(true)
        setLoading(false)
      } catch (err: any) {
        console.error('[Admin] Auth check failed:', err)
        clearTimeout(timeout)
        setError(`Auth check failed: ${err.message || 'Unknown error'}`)
        setLoading(false)
      }
    }

    checkAdmin()

    return () => clearTimeout(timeout)
  }, [authorized])

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p>Verifying admin access...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.loadingScreen}>
        <p style={{ color: '#f87171', marginBottom: '1rem', textAlign: 'center', maxWidth: '400px', lineHeight: 1.5 }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={runCheck}
            style={{
              background: '#FFE500', color: '#1e293b', border: 'none',
              padding: '0.5rem 1.5rem', borderRadius: '6px', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            Retry
          </button>
          <button
            onClick={() => router.push('/login')}
            style={{
              background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)',
              padding: '0.5rem 1.5rem', borderRadius: '6px', cursor: 'pointer',
              fontWeight: 500, fontSize: '0.9rem',
            }}
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Link href="/admin" className={styles.logoLink}>
            <span className={styles.logoText}>HEX</span>
            <span className={styles.logoSub}>Admin</span>
          </Link>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <span className={styles.navIcon}>
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={14} />
            <span>Back to site</span>
          </Link>
        </div>
      </aside>

      <main className={styles.main}>
        <AdminContext.Provider value={{ accessToken }}>
          {children}
        </AdminContext.Provider>
      </main>
    </div>
  )
}
