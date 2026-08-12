'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Bot } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import styles from './EmployerSidebar.module.css'

const STORAGE_KEY = 'employer-sidebar-collapsed'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number
}

export default function EmployerSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sidebarRef = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [companyName, setCompanyName] = useState<string>('')

  useEffect(() => {
    if (DEV_MODE) {
      setCompanyName(getMockUser()?.user_metadata?.company_name || '')
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCompanyName(session?.user?.user_metadata?.company_name || '')
    })
  }, [])


  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, searchParams])

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      setCollapsed(stored === 'true')
    }
  }, [])

  // Sync sidebar top with actual header height (before paint to avoid flash)
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

  const isDetailPage =
    pathname?.startsWith('/job/') ||
    pathname?.startsWith('/candidates/') ||
    pathname?.startsWith('/company/') ||
    pathname?.startsWith('/employer/analytics/') ||
    (pathname?.startsWith('/my-jobs/') && !pathname?.endsWith('/applications')) ||
    pathname?.startsWith('/reviews/') ||
    pathname === '/post-job' ||
    (pathname === '/jobs' && searchParams.has('id'))

  useEffect(() => {
    if (!mounted) return
    if (isDetailPage) {
      document.body.removeAttribute('data-sidebar')
      return () => {}
    }
    document.body.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded')
    return () => { document.body.removeAttribute('data-sidebar') }
  }, [collapsed, mounted, isDetailPage])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/employer/dashboard',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      label: 'Applicants',
      href: '/applied',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: 'Pipeline',
      href: '/pipeline',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      label: 'Interviews',
      href: '/interviews',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      label: 'Offers',
      // Pen — signing metaphor, visually distinct from the clipboard /
      // document icons used by Applicants and Manage Job Ads.
      href: '/offers',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      ),
    },
    {
      label: 'Manage Job Ads',
      href: '/my-jobs',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M12 11h4" />
          <path d="M12 16h4" />
          <path d="M8 11h.01" />
          <path d="M8 16h.01" />
        </svg>
      ),
    },
    {
      label: 'Post Job',
      href: '/post-job',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
    },
    {
      label: 'Temp Work',
      href: '/temp-work',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      ),
    },
    {
      // CANDIDATES AND TALENT POOL ARE NOT THE SAME LIST, which is why both are
      // here and neither replaces the other:
      //   Candidates  — the whole discoverable candidate base. People you go and
      //                 find. candidate_profiles where is_discoverable = true.
      //   Talent Pool — only people who applied to THIS employer's own jobs,
      //                 defaulting to the ones they rejected. People who came to
      //                 you. Empty until they have posted a job and had
      //                 applicants; /candidates is populated from day one.
      //
      // Candidates sits FIRST because it is the one that works on day one, and
      // because until now it had no nav entry at all — the only way in from the
      // signed-in UI was a "Browse all candidates →" link in the Talent Pool
      // page header, which is two steps from anywhere an employer starts and
      // behind a page that is empty for a new employer.
      //
      // Icon is person-plus-magnifier: distinct from Talent Pool's two-person
      // group and from Browse Jobs' bare magnifier, and it reads as SEARCHING
      // for people rather than listing them.
      label: 'Candidates',
      href: '/candidates',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="7" r="4" />
          <path d="M10.3 15H7a4 4 0 0 0-4 4v2" />
          <circle cx="17" cy="17" r="3" />
          <path d="m21 21-1.9-1.9" />
        </svg>
      ),
    },
    {
      label: 'Talent Pool',
      href: '/talent-pool',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: 'Analytics',
      href: '/dashboard/analytics',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      label: 'Browse Jobs',
      href: '/jobs',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      label: 'My Reviews',
      href: companyName ? `/company/${encodeURIComponent(companyName)}` : '/reviews',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    const search = searchParams.toString()
    const currentUrl = pathname + (search ? `?${search}` : '')

    // Items with query params: exact full-URL match only
    if (href.includes('?')) {
      return currentUrl === href
    }

    // Items without query params: match pathname, but NOT if a sibling
    // query-param item with the same base path is the better match
    if (pathname === href || pathname.startsWith(href + '/')) {
      const allItems = [...navItems]
      const hasBetterQueryMatch = allItems.some(
        (item) => item.href.includes('?') && item.href.startsWith(href) && currentUrl === item.href
      )
      return !hasBetterQueryMatch
    }

    return false
  }

  const hideHamburger = isDetailPage

  if (!mounted) return null

  return (
    <>
      {/* Mobile hamburger */}
      {!hideHamburger && (
        <button
          className={styles.mobileToggle}
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className={styles.overlay}
          onClick={() => setMobileOpen(false)}
          onTouchEnd={(e) => { e.preventDefault(); setMobileOpen(false); }}
        />
      )}

      <aside ref={sidebarRef} className={`${styles.sidebar} ${collapsed ? styles.collapsed : styles.expanded} ${mobileOpen ? styles.mobileOpen : ''}`}>
        {/* Spacer: fills the area behind the navbar */}
        <div className={styles.navSpacer} />
        {/* Header row: "Menu" label + toggle chevron */}
        <div className={styles.header}>
          <span className={styles.menuLabel}>Menu</span>
          <button
            className={styles.toggle}
            onClick={() => { toggleCollapsed(); setMobileOpen(false); }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>

        {/* Main nav */}
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
