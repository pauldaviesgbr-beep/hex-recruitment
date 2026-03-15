'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
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

  useEffect(() => {
    if (!mounted) return
    document.body.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded')
    return () => { document.body.removeAttribute('data-sidebar') }
  }, [collapsed, mounted])

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
      label: 'Candidates',
      href: '/candidates',
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
      label: 'My Jobs',
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
      label: 'Interviews',
      href: '/my-jobs?filter=interviewing',
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
      href: '/my-jobs?filter=offers',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      ),
    },
    {
      label: 'Hired',
      href: '/my-jobs?filter=hired',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
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
      label: 'Reviews',
      href: '/reviews',
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

  if (!mounted) return null

  return (
    <>
      {/* Mobile hamburger */}
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

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className={styles.overlay} onClick={() => setMobileOpen(false)} />
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
              onClick={() => setMobileOpen(false)}
              onMouseEnter={() => router.prefetch(item.href)}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className={styles.badge}>{item.badge}</span>
              )}
            </Link>
          ))}
          <div className={styles.navDivider} />
          <button
            className={styles.item}
            data-tooltip="Hex Assistant"
            title="Hex Assistant"
            onClick={() => {
              setMobileOpen(false)
              window.dispatchEvent(new CustomEvent('open-hex-chatbot'))
            }}
          >
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" stroke="#FFD700" />
              </svg>
            </span>
            <span className={styles.label}>Hex Assistant</span>
          </button>
        </nav>

      </aside>
    </>
  )
}
