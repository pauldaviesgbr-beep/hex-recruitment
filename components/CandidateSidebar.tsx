'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Bot } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import styles from './CandidateSidebar.module.css'

const STORAGE_KEY = 'candidate-sidebar-collapsed'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number
}

export default function CandidateSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sidebarRef = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { setMobileOpen(false) }, [pathname, searchParams])

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  // Fetch unread message count
  useEffect(() => {
    const fetchUnread = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const userId = session.user.id
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      if (convs && convs.length > 0) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convs.map(c => c.id))
          .eq('is_read', false)
          .neq('sender_id', userId)
        setUnreadCount(count || 0)
      }
    }
    fetchUnread()
  }, [pathname])

  useLayoutEffect(() => {
    if (!mounted || !sidebarRef.current) return
    const header = document.querySelector('header')
    if (!header) return
    const update = () => {
      const h = header.offsetHeight
      sidebarRef.current?.style.setProperty('--navbar-h', `${h}px`)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    document.body.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded')
    document.body.setAttribute('data-candidate-sidebar', 'true')
    return () => {
      document.body.removeAttribute('data-sidebar')
      document.body.removeAttribute('data-candidate-sidebar')
    }
  }, [collapsed, mounted])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  const navItems: NavItem[] = [
    {
      label: 'Search Jobs',
      href: '/jobs',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    },
    {
      label: 'Recommended',
      href: '/jobs/recommended',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>,
    },
    {
      label: 'Shifts',
      href: '/temp-work',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>,
    },
    {
      label: 'Saved Jobs',
      href: '/saved-jobs',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>,
    },
    {
      label: 'My Applications',
      href: '/applications',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    },
    {
      label: 'Messages',
      href: '/messages',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      label: 'CV Builder',
      href: '/cv-builder',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
    },
    {
      label: 'Notifications',
      href: '/notifications',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
    },
    {
      label: 'Company Reviews',
      href: '/reviews',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
    },
  ]

  const isActive = (href: string) => {
    if (href === '/jobs' && pathname === '/jobs') return true
    if (href !== '/jobs' && pathname?.startsWith(href)) return true
    return false
  }

  const hideHamburger =
    pathname?.startsWith('/job/') ||
    pathname?.startsWith('/candidates/') ||
    pathname?.startsWith('/company/') ||
    pathname?.startsWith('/employer/analytics/') ||
    pathname?.startsWith('/my-jobs/') ||
    pathname?.startsWith('/reviews/') ||
    pathname === '/post-job' ||
    (pathname === '/jobs' && searchParams.has('id'))

  if (!mounted) return null

  return (
    <>
      {/* Mobile hamburger toggle */}
      {!hideHamburger && (
        <button
          className={styles.mobileToggle}
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      )}

      {mobileOpen && (
        <div
          className={styles.overlay}
          onClick={() => setMobileOpen(false)}
          onTouchEnd={(e) => { e.preventDefault(); setMobileOpen(false); }}
        />
      )}

      <aside ref={sidebarRef} className={`${styles.sidebar} ${collapsed ? styles.collapsed : styles.expanded} ${mobileOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.navSpacer} />
        <div className={styles.header}>
          <span className={styles.menuLabel}>Menu</span>
          <button
            className={styles.toggle}
            onClick={() => { toggleCollapsed(); setMobileOpen(false); }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
            </svg>
          </button>
        </div>

        <nav className={styles.items}>
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`${styles.item} ${isActive(item.href) ? styles.active : ''}`}
              data-tooltip={item.label}
              title={item.label}
              onClick={(e) => { e.preventDefault(); setMobileOpen(false); router.push(item.href) }}
              onTouchEnd={(e) => { e.preventDefault(); setMobileOpen(false); router.push(item.href) }}
              onMouseEnter={() => router.prefetch(item.href)}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className={styles.badge}>{item.badge}</span>
              )}
            </Link>
          ))}
          <div className={`${styles.navDivider} ${styles.mobileOnly}`} />
          <button
            className={`${styles.item} ${styles.mobileOnly}`}
            data-tooltip="Share Feedback"
            title="Share Feedback"
            onClick={() => {
              setMobileOpen(false)
              router.push('/feedback')
            }}
          >
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </span>
            <span className={styles.label}>Share Feedback</span>
          </button>
          <button
            className={`${styles.item} ${styles.mobileOnly}`}
            data-tooltip="Ask Thrive"
            title="Ask Thrive"
            onClick={() => {
              setMobileOpen(false)
              window.dispatchEvent(new CustomEvent('open-thrive-chatbot'))
            }}
          >
            <span className={styles.icon}>
              <Bot size={20} color="#FFE500" strokeWidth={2} />
            </span>
            <span className={styles.label}>Ask Thrive</span>
          </button>
        </nav>
      </aside>
    </>
  )
}
