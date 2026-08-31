'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ukCities } from '@/lib/ukCities'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { isAdmin } from '@/lib/admin-client'
import { Bot, ShieldCheck } from 'lucide-react'
import dynamic from 'next/dynamic'
const NotificationBell = dynamic(() => import('./NotificationBell'), { ssr: false })
const EmployerSidebar = dynamic(() => import('./EmployerSidebar'), { ssr: false })
const CandidateSidebar = dynamic(() => import('./CandidateSidebar'), { ssr: false })
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

  // Real-time unread message count
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  // Upcoming interviews (next 7 days) count — employers only
  const [upcomingInterviewCount, setUpcomingInterviewCount] = useState(0)
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const fetchUnreadCount = async () => {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      if (convs && convs.length > 0) {
        const convIds = convs.map(c => c.id)
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .eq('is_read', false)
          .neq('sender_id', user.id)
        setUnreadMessageCount(count || 0)
      }
    }
    fetchUnreadCount()
    const channel = supabase
      .channel('header-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchUnreadCount())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => fetchUnreadCount())
      .subscribe()
    // Manual refresh trigger — the messages page fires this after marking a
    // conversation as read so the badge clears without waiting on realtime.
    const onMessagesRead = () => fetchUnreadCount()
    window.addEventListener('messages:read', onMessagesRead)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('messages:read', onMessagesRead)
    }
  }, [user])

  // The employer's company logo, from the table rather than the token.
  useEffect(() => {
    if (!user || user?.user_metadata?.role !== 'employer') { setCompanyLogo(null); return }
    let cancelled = false
    supabase.from('employer_profiles').select('logo_url').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setCompanyLogo((data as { logo_url?: string } | null)?.logo_url || null) })
    return () => { cancelled = true }
  }, [user])

  // Fetch upcoming interview count for employers (next 7 days)
  useEffect(() => {
    if (!user || user?.user_metadata?.role !== 'employer') {
      setUpcomingInterviewCount(0)
      return
    }
    const fetchCount = async () => {
      const today = new Date()
      const weekAhead = new Date(Date.now() + 7 * 86_400_000)
      const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const { count } = await supabase
        .from('interview_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('employer_id', user.id)
        .eq('status', 'confirmed')
        .gte('booked_date', toDateStr(today))
        .lte('booked_date', toDateStr(weekAhead))
      setUpcomingInterviewCount(count || 0)
    }
    fetchCount()
    const channel = supabase
      .channel('header-upcoming-interviews')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interview_bookings' }, () => fetchCount())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const totalUnreadCount = unreadMessageCount
  const pendingRequestsCount = 0
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
    document.addEventListener('touchstart', handleClickOutside as EventListener)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside as EventListener)
    }
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
  //
  // The company logo comes from employer_profiles, NOT from user_metadata.
  // It used to be written into metadata for exactly this avatar, but metadata
  // rides in the JWT and the logo is a base64 data URL — which grew one
  // employer's auth cookie past Vercel's header limit and locked her out of the
  // product entirely. employer_profiles is where it already lived; this just
  // reads it from there. The metadata fallback stays only so accounts written
  // before this change keep their avatar until they next save.
  const getProfilePhoto = () => {
    if (isEmployer) {
      return companyLogo || user?.user_metadata?.logo_url || user?.user_metadata?.profile_photo || user?.user_metadata?.avatar_url || null
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
        <>
        <div
          className={styles.dropdownOverlay}
          onClick={() => setShowProfileMenu(false)}
          onTouchEnd={(e) => { e.preventDefault(); setShowProfileMenu(false); }}
        />
        <div className={styles.profileDropdown} onClick={e => e.stopPropagation()}>
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
            href={isEmployer ? '/settings/company' : profilePath}
            className={styles.dropdownItem}
            onClick={(e) => { e.preventDefault(); setShowProfileMenu(false); router.push(isEmployer ? '/settings/company' : profilePath) }}
          >
            <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {isEmployer ? 'Company Profile' : 'View Profile'}
          </Link>
          <Link
            href="/settings"
            className={styles.dropdownItem}
            onClick={(e) => { e.preventDefault(); setShowProfileMenu(false); router.push('/settings') }}
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
              onClick={(e) => { e.preventDefault(); setShowProfileMenu(false); router.push('/job-alerts') }}
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
              onClick={(e) => { e.preventDefault(); setShowProfileMenu(false); router.push('/my-jobs?filter=archived') }}
            >
              <svg className={styles.dropdownIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
              Archived Jobs
            </Link>
          )}
          <button
            className={styles.dropdownItem}
            style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => {
              setShowProfileMenu(false)
              window.dispatchEvent(new CustomEvent('open-thrive-chatbot'))
            }}
          >
            <Bot className={styles.dropdownIcon} size={20} color="#FFE500" strokeWidth={2} />
            Ask Thrive
          </button>
          {isAdmin(user?.email) && (
            <>
              <div className={styles.dropdownDivider} />
              <Link
                href="/admin"
                className={styles.dropdownItem}
                onClick={(e) => { e.preventDefault(); setShowProfileMenu(false); router.push('/admin') }}
              >
                <ShieldCheck className={styles.dropdownIcon} size={20} color="#FFE500" strokeWidth={2} />
                Admin
              </Link>
            </>
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
        </>
      )}
    </div>
  )

  // Navigation for users who are NOT logged in
  //
  // ONE SIGN UP AND ONE LOG IN, AND THE SIZE GAP IS THE DESIGN.
  //
  // This replaced "Hire People" and "Find a Job", two equal-weight links that
  // between them made joining look like a menu rather than a door. Worse: on a
  // job post — the page every LinkedIn link, every share and every Google
  // result lands on — "Find a Job" was measured at 5,294 sq px and was THE ONLY
  // JOIN AFFORDANCE ON THE ENTIRE PAGE. A stranger's only route in was a chip
  // in the top bar that reads like a browse link.
  //
  // Sign up is a BUTTON, Log in is a LINK, and every instinct in review will be
  // to balance them. Do not. A yellow button beside a text link is what tells
  // somebody who has never been here which of the two is meant for them.
  //
  // THE DELETION AND THE REPLACEMENT SHIP IN ONE COMMIT — Paul's instruction,
  // and the reason is that a window where a job post has no way to join at all
  // is precisely the fault being fixed.
  const LoggedOutNav = () => {
    // On the sign-up screens themselves, Sign up is dropped: you are already on
    // it. Log in stays everywhere, INCLUDING the apply gate — the gate is now a
    // pure sign-up form with no password box, so a returning chef who taps
    // Apply has nowhere else to go. Pushing Log in to the foot of that scroll
    // would recreate the exact fault this week began with: the right door below
    // the fold. (Paul, 23 Aug 2026, choosing the drawing over the prose.)
    const onSignupPage =
      pathname === '/signup' ||
      pathname === '/register/employer' ||
      pathname === '/register/employer-free' ||
      pathname === '/register/employee'
    const onLoginPage =
      pathname === '/login' ||
      pathname === '/login/employer' ||
      pathname === '/login/employee'

    return (
      <div className={styles.loginButtons}>
        {!onLoginPage && (
          <Link href="/login" className={styles.headerLogIn}>Log in</Link>
        )}
        {!onSignupPage && (
          <Link href="/signup" className={styles.headerSignUp}>Sign up</Link>
        )}
      </div>
    )
  }

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
      <Link href="/feedback" className={styles.feedbackPill}>
        Feedback
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
      <Link href="/calendar" className={styles.navIconLink} aria-label="Calendar">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="14" x2="8" y2="14" />
          <line x1="12" y1="14" x2="12" y2="14" />
          <line x1="16" y1="14" x2="16" y2="14" />
          <line x1="8" y1="18" x2="8" y2="18" />
          <line x1="12" y1="18" x2="12" y2="18" />
          <line x1="16" y1="18" x2="16" y2="18" />
        </svg>
        {upcomingInterviewCount > 0 && (
          <span className={styles.iconBadge}>{upcomingInterviewCount}</span>
        )}
        <span className={styles.navTooltip}>Calendar</span>
      </Link>
      <NotificationBell />
      <ProfileAvatar profilePath="/settings/company" />
    </>
  )

  // Navigation for logged-in EMPLOYEES (job seekers)
  const navLink = (href: string) =>
    `${styles.navIconLink} ${pathname === href ? styles.navIconLinkActive : ''}`

  const EmployeeNav = () => (
    <>
      <Link href="/feedback" className={styles.feedbackPill}>
        Feedback
      </Link>
      <Link href="/messages" className={`${styles.navIconLink} ${pathname === '/messages' ? styles.navIconLinkActive : ''}`} aria-label="Messages">
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {(totalUnreadCount > 0 || pendingRequestsCount > 0) && (
          <span className={styles.iconBadge}>{totalUnreadCount + pendingRequestsCount}</span>
        )}
        <span className={styles.navTooltip}>Messages</span>
      </Link>
      <NotificationBell />
      <ProfileAvatar profilePath="/profile" />
    </>
  )

  const showSidebar = mounted && user && isEmployer
  const showCandidateSidebar = mounted && user && !isEmployer
  const logoHref = !mounted || !user ? '/' : isEmployer ? '/employer/dashboard' : '/dashboard'

  return (
    <>
      {showSidebar && <EmployerSidebar />}
      {showCandidateSidebar && <CandidateSidebar />}
      {/* headerSheetOpen: on mobile the profile menu becomes a full-screen
          sheet, but it is a CHILD of this header — which is position:fixed
          with a z-index, so it is a stacking context and the sheet can never
          out-paint anything outside it however high its own z-index goes.
          The sidebar's hamburger is a sibling of this header at 1001, so it
          sat on top of the sheet, over the avatar. The header's own context
          is what has to move, and only while it is hosting the sheet. */}
      <header
        className={`${styles.header} ${(showSidebar || showCandidateSidebar) ? styles.headerEmployer : ''} ${showProfileMenu ? styles.headerSheetOpen : ''}`}
        style={DEV_MODE ? { marginTop: '40px' } : undefined}
      >
        <div className={(showSidebar || showCandidateSidebar) ? styles.headerFull : 'container'}>
          <div className={styles.headerContent}>
            <Link href={logoHref} className={styles.logo} {...((showSidebar || showCandidateSidebar) ? { 'data-sidebar-logo': '' } : {})}>
              {/* THE LOCKUP IS ONE ASSET NOW, not a mark plus HTML text.
                  The wordmark used to be a <span> in the site's own font, so
                  the spacing and weight next to the mark were whatever the CSS
                  happened to say. The signed-off lockup has the wordmark
                  outlined into paths, which is the point of it — it renders the
                  same everywhere and cannot drift from the mark beside it.

                  White version, because this bar is navy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/thrive-lockup-white.svg"
                alt="Thrive"
                className={styles.logoLockup}
                width={171}
                height={42}
              />
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
