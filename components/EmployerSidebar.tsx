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
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
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
      const allItems = [...navItems, ...bottomItems]
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
        </nav>

      </aside>
    </>
  )
}
