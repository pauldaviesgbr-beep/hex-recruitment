'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ukCities } from '@/lib/ukCities'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import NotificationBell from './NotificationBell'
import HoneycombLogo from './HoneycombLogo'
import EmployerSidebar from './EmployerSidebar'
import styles from './Header.module.css'

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()

  const SEARCH_BAR_ROUTES = ['/jobs', '/candidates', '/jobs/recommended', '/saved-jobs']
  const showSearchBar = SEARCH_BAR_ROUTES.some(route => pathname === route || pathname?.startsWith(route + '/'))

  const [user, setUser] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Get unread counts from MessagesContext (updates globally when messages are read)
  const { totalUnreadCount, pendingRequestsCount } = useMessages()
  const { unseenCount } = useSavedJobs()

  // Navbar search state (employer search bar with location)
  const [navSearchQuery, setNavSearchQuery] = useState('')
  const [navLocationQuery, setNavLocationQuery] = useState('')
  const [showNavLocSuggestions, setShowNavLocSuggestions] = useState(false)
  const [navLocHighlightedIndex, setNavLocHighlightedIndex] = useState(-1)
  const navLocRef = useRef<HTMLDivElement>(null)
  const navLocInputRef = useRef<HTMLInputElement>(null)

  // Deduplicate cities list once
  const uniqueCities = useMemo(() => {
    const seen = new Set<string>()
    return ukCities.filter(city => {
      if (seen.has(city)) return false
      seen.add(city)
      return true
    })
  }, [])

  // Filter location suggestions based on input
  const navLocSuggestions = useMemo(() => {
    if (!navLocationQuery.trim()) return []
    const query = navLocationQuery.toLowerCase()
    return uniqueCities
      .filter(city => city.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1
        const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.localeCompare(b)
      })
      .slice(0, 8)
  }, [navLocationQuery, uniqueCities])

  // Close location suggestions on outside click
  useEffect(() => {
    const handleLocClickOutside = (e: MouseEvent) => {
      if (navLocRef.current && !navLocRef.current.contains(e.target as Node)) {
        setShowNavLocSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleLocClickOutside)
    return () => document.removeEventListener('mousedown', handleLocClickOutside)
  }, [])

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setNavLocHighlightedIndex(-1)
  }, [navLocSuggestions])

  const selectNavLocation = useCallback((city: string) => {
    setNavLocationQuery(city)
    setShowNavLocSuggestions(false)
    navLocInputRef.current?.blur()
  }, [])

  // Context-aware search: determine placeholder and target based on current page
  const searchPlaceholder = useMemo(() => {
    if (pathname?.startsWith('/jobs')) return 'Search jobs...'
    if (pathname?.startsWith('/candidates')) return 'Search candidates...'
    return 'Search jobs, candidates...'
  }, [pathname])

  const searchTarget = useMemo(() => {
    if (pathname?.startsWith('/jobs')) return '/jobs'
    if (pathname?.startsWith('/candidates')) return '/candidates'
    return '/jobs'
  }, [pathname])

  const handleNavSearch = useCallback(() => {
    const search = navSearchQuery.trim()
    const city = navLocationQuery.trim()
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (city) params.set('city', city)
    const query = params.toString()
    router.push(`${searchTarget}${query ? `?${query}` : ''}`)
  }, [navSearchQuery, navLocationQuery, router, searchTarget])

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setMounted(true)

    // In dev mode, use mock user
    if (DEV_MODE) {
      const mockUser = getMockUser()
      setUser(mockUser)
    } else {
      // Check current session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null)
      })

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })

      // Cleanup subscription only in non-dev mode
      return () => subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    setShowProfileMenu(false)
    if (DEV_MODE) {
      // In dev mode, clear mock user state and redirect to home
      localStorage.removeItem('userRole')
      setUser(null)
      router.push('/')
      return
    }
    await supabase.auth.signOut()
    router.push('/')
  }

  const isEmployer = user?.user_metadata?.role === 'employer'

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    const name = user?.user_metadata?.full_name || user?.email || 'U'
    if (name.includes('@')) {
      return name.charAt(0).toUpperCase()
    }
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  }

  // Get user profile photo (employers: prefer company logo)
  const getProfilePhoto = () => {
    if (isEmployer) {
      return user?.user_metadata?.logo_url || user?.user_metadata?.profile_photo || user?.user_metadata?.avatar_url || null
    }
    return user?.user_metadata?.profile_photo || user?.user_metadata?.avatar_url || null
  }

  // Profile Avatar with Dropdown Menu
  const ProfileAvatar = ({ profilePath }: { profilePath: string }) => (
    <div className={styles.profileContainer} ref={profileMenuRef}>
      <button
        className={styles.avatarButton}
        onClick={() => setShowProfileMenu(!showProfileMenu)}
        aria-label="Open profile menu"
      >
        {getProfilePhoto() ? (
          <img
            src={getProfilePhoto()}
            alt="Profile"
            className={`${styles.avatarImage} ${isEmployer ? styles.avatarSquare : ''}`}
          />
        ) : (
          <div className={`${styles.avatarFallback} ${isEmployer ? styles.avatarSquare : ''}`}>
            {getUserInitials()}
          </div>
        )}
        <span className={styles.avatarDropdownIcon}>▾</span>
      </button>

      {showProfileMenu && (
        <div className={styles.profileDropdown}>
          <div className={styles.dropdownHeader}>
            <div className={`${styles.dropdownAvatar} ${isEmployer ? styles.avatarSquare : ''}`}>
              {getProfilePhoto() ? (
                <img src={getProfilePhoto()} alt="Profile" />
              ) : (
                <span>{getUserInitials()}</span>
              )}
            </div>
            <div className={styles.dropdownUserInfo}>
              <span className={styles.dropdownName}>
                {user?.user_metadata?.full_name || 'User'}
              </span>
              <span className={styles.dropdownEmail}>
                {user?.email || ''}
              </span>
            </div>
          </div>
          <div className={styles.dropdownDivider} />
          <Link
            href={profilePath}
            className={styles.dropdownItem}
            onClick={() => setShowProfileMenu(false)}
          >
            <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            View Profile
          </Link>
          <Link
            href="/settings"
            className={styles.dropdownItem}
            onClick={() => setShowProfileMenu(false)}
          >
            <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </Link>
          {!isEmployer && (
            <Link
              href="/job-alerts"
              className={styles.dropdownItem}
              onClick={() => setShowProfileMenu(false)}
            >
              <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Job Alerts
            </Link>
          )}
          {isEmployer && (
            <Link
              href="/my-jobs?filter=archived"
              className={styles.dropdownItem}
              onClick={() => setShowProfileMenu(false)}
            >
              <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
              Archived Jobs
            </Link>
          )}
          <div className={styles.dropdownDivider} />
          <button
            className={styles.dropdownItemLogout}
            onClick={handleLogout}
          >
            <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  )

  // Navigation for users who are NOT logged in
  const LoggedOutNav = () => (
    <div className={styles.loginButtons}>
      <Link href="/login/employer" className={styles.employerLoginBtn}>
        <svg className={styles.loginIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
        Employer Login
      </Link>
      <Link href="/login/employee" className={styles.employeeLoginBtn}>
        <svg className={styles.loginIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Employee Login
      </Link>
    </div>
  )

  // Navigation for logged-in EMPLOYERS (top bar: search + communication + profile)
  const EmployerNav = () => (
    <>
      {showSearchBar && (
        <div className={styles.searchBar}>
        <svg className={styles.searchBarIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={searchPlaceholder}
          className={styles.searchBarInput}
          value={navSearchQuery}
          onChange={(e) => setNavSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNavSearch()
          }}
        />
        <div className={styles.searchBarDivider} />
        <div className={styles.searchBarLocWrap} ref={navLocRef}>
          <svg className={styles.searchBarLocIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <input
            ref={navLocInputRef}
            type="text"
            placeholder="City"
            className={`${styles.searchBarInput} ${styles.searchBarLocInput}`}
            value={navLocationQuery}
            onChange={(e) => {
              setNavLocationQuery(e.target.value)
              setShowNavLocSuggestions(true)
            }}
            onFocus={() => navLocationQuery.trim() && setShowNavLocSuggestions(true)}
            onKeyDown={(e) => {
              if (showNavLocSuggestions && navLocSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setNavLocHighlightedIndex(prev => prev < navLocSuggestions.length - 1 ? prev + 1 : 0)
                  return
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setNavLocHighlightedIndex(prev => prev > 0 ? prev - 1 : navLocSuggestions.length - 1)
                  return
                } else if (e.key === 'Enter' && navLocHighlightedIndex >= 0) {
                  e.preventDefault()
                  selectNavLocation(navLocSuggestions[navLocHighlightedIndex])
                  return
                } else if (e.key === 'Escape') {
                  setShowNavLocSuggestions(false)
                  return
                }
              }
              if (e.key === 'Enter') handleNavSearch()
            }}
            autoComplete="off"
          />
          {showNavLocSuggestions && navLocSuggestions.length > 0 && (
            <ul className={styles.searchBarSuggestions} role="listbox">
              {navLocSuggestions.map((city, index) => {
                const query = navLocationQuery.toLowerCase()
                const matchStart = city.toLowerCase().indexOf(query)
                const before = city.slice(0, matchStart)
                const match = city.slice(matchStart, matchStart + query.length)
                const after = city.slice(matchStart + query.length)
                return (
                  <li
                    key={city}
                    role="option"
                    aria-selected={index === navLocHighlightedIndex}
                    className={`${styles.searchBarSuggestionItem} ${index === navLocHighlightedIndex ? styles.searchBarSuggestionHighlighted : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectNavLocation(city)
                    }}
                    onMouseEnter={() => setNavLocHighlightedIndex(index)}
                  >
                    {before}<strong>{match}</strong>{after}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      )}
      <Link href="/messages" className={styles.navIconLink} aria-label="Messages">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {(totalUnreadCount > 0 || pendingRequestsCount > 0) && (
          <span className={styles.iconBadge}>{totalUnreadCount + pendingRequestsCount}</span>
        )}
        <span className={styles.navTooltip}>Messages</span>
      </Link>
      <NotificationBell />
      <ProfileAvatar profilePath="/dashboard" />
    </>
  )

  // Navigation for logged-in EMPLOYEES (job seekers)
  const EmployeeNav = () => (
    <>
      <Link href="/jobs/recommended" className={styles.navIconLink} aria-label="Recommended">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        <span className={styles.navTooltip}>Recommended</span>
      </Link>
      <Link href="/saved-jobs" className={styles.navIconLink} aria-label="Saved Jobs">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {unseenCount > 0 && (
          <span className={styles.iconBadge}>{unseenCount}</span>
        )}
        <span className={styles.navTooltip}>Saved Jobs</span>
      </Link>
      <Link href="/jobs" className={styles.navIconLink} aria-label="Browse Jobs">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className={styles.navTooltip}>Browse Jobs</span>
      </Link>
      <Link href="/applications" className={styles.navIconLink} aria-label="My Applications">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
        <span className={styles.navTooltip}>My Applications</span>
      </Link>
      <Link href="/messages" className={styles.navIconLink} aria-label="Messages">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {(totalUnreadCount > 0 || pendingRequestsCount > 0) && (
          <span className={styles.iconBadge}>{totalUnreadCount + pendingRequestsCount}</span>
        )}
        <span className={styles.navTooltip}>Messages</span>
      </Link>
      <Link href="/cv-builder" className={styles.navIconLink} aria-label="CV Builder">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span className={styles.navTooltip}>CV Builder</span>
      </Link>
      <Link href="/reviews" className={styles.navIconLink} aria-label="Company Reviews">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <span className={styles.navTooltip}>Company Reviews</span>
      </Link>
      <NotificationBell />
      <ProfileAvatar profilePath="/profile" />
    </>
  )

  const showSidebar = mounted && user && isEmployer
  const logoHref = !mounted || !user ? '/' : isEmployer ? '/employer/dashboard' : '/dashboard'

  return (
    <>
      {showSidebar && <EmployerSidebar />}
      <header
        className={`${styles.header} ${showSidebar ? styles.headerEmployer : ''}`}
        style={DEV_MODE ? { marginTop: '40px' } : undefined}
      >
        <div className={showSidebar ? styles.headerFull : 'container'}>
          <div className={styles.headerContent}>
            <Link href={logoHref} className={styles.logo} {...(showSidebar ? { 'data-sidebar-logo': '' } : {})}>
              <HoneycombLogo size={28} color="var(--primary-yellow)" className={styles.logoIcon} />
              <div className={styles.logoBrand}>
                <span className={styles.logoText}>HEX</span>
                <span className={styles.logoTagline}>TALENT RECRUITMENT</span>
              </div>
            </Link>

            <nav className={styles.nav}>
              {!mounted ? (
                <LoggedOutNav />
              ) : !user ? (
                <LoggedOutNav />
              ) : isEmployer ? (
                <EmployerNav />
              ) : (
                <EmployeeNav />
              )}
            </nav>
          </div>
        </div>
      </header>
    </>
  )
}
