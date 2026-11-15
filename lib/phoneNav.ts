// THE PHONE NAVIGATION — ONE DEFINITION, FOUR READERS.
//
// design_handoff_phone_navigation (Claude Design, 14 Nov 2026): no hamburger on
// a phone, for either role, on the website or in the iOS app. Each role gets a
// five-item bottom bar, and everything without its own slot lives on one list
// page — More for an employer, Profile for a candidate.
//
// Read by:
//   components/PhoneNav.tsx        the website's bottom bar (phone width only)
//   components/NavMenuPage.tsx     /employer/more and /me
//   components/Header.tsx          the "‹ More" link inside the app
//   (and the iOS build after 30, which mirrors these paths in Swift)
//
// A SECOND COPY OF THIS LIST IS HOW A PAGE BECOMES UNREACHABLE. The hamburger
// sheet held fifteen employer destinations; taking it away is only safe if
// every one of them has a home here, so the More page is the one list rather
// than a curated subset of it. The merges the design proposes (Pipeline and
// Offers into Applicants, Talent pool into Candidates, Interviews into
// Calendar) are NOT built yet, so those pages keep their own rows until they
// are — removing a row before its merge ships removes the page.
//
// SECOND PASS (design 25, 15 Nov 2026): the employer bar is Home · Applicants
// · Calendar · Messages · More, and Job ads moves into More as "Your job ads".

import type { IconName } from '@/components/icons'

export type NavRole = 'employer' | 'candidate'

export type BarSlot = {
  label: string
  href: string
  icon: IconName
  /** Path prefixes that light this slot up, beyond its own href. */
  match: string[]
  /** Which unread count, if any, rides on this slot. */
  badge?: 'messages'
}

/** A tab the iOS app may or may not draw itself. Build 30's employer tabs are
 *  Home · Job ads · Applicants · More; build 31's are the website's five. */
export type NativeTab = 'messages' | 'calendar'

export type MenuRow = {
  label: string
  href?: string
  /** Rows that do something rather than go somewhere. */
  action?: 'ask-thrive' | 'log-out'
  subline?: string
  badge?: 'messages' | 'notifications'
  /** Shown only to the admin allowlist (lib/admin-client). */
  adminOnly?: boolean
  /** The employer's public company page, whose path carries their name. */
  companyReviews?: boolean
  /** "{n} live · " goes in front of the subline, n = the employer's live adverts. */
  liveCount?: boolean
  /** SHOWN ONLY INSIDE AN APP WHOSE OWN BAR LACKS THIS TAB. Build 30 has no
   *  Messages or Calendar tab, and it is the build in people's hands until 31
   *  is approved: dropping these rows would leave Messages unreachable there.
   *  The app says which tabs it draws (html[data-native-tabs], set from build
   *  31 on) and globals.css shows the row only when that list lacks this one.
   *  So the rows go by themselves once someone is on 31, with no date to
   *  remember, and stay for anyone who never updates. On the website the bar
   *  carries both, so they never show there. */
  onlyInAppWithout?: NativeTab
}

/** `side` places the group in one of two independent columns from 768 wide
 *  (components/NavMenuPage.tsx). Without it the page keeps its one grid. */
export type MenuGroup = { heading?: string; rows: MenuRow[]; side?: 'left' | 'right' }

// ── THE EMPLOYER MORE PAGE ──────────────────────────────────────────────────

// From 768 wide: left column Notifications then Account, right column Hiring
// then Help (Claude Design's review, 15 Nov 2026). On a phone, this order.
export const EMPLOYER_MORE: MenuGroup[] = [
  {
    side: 'left',
    // No heading: the row that carries the unread count sits first, because a
    // count is only useful where it is seen. Messages has its own tab now; its
    // row and Calendar's stand in for an app that has no such tab
    // (onlyInAppWithout), and they sit AFTER Notifications so a hidden row
    // never leaves its divider on the first visible one.
    rows: [
      { label: 'Notifications', href: '/notifications', badge: 'notifications' },
      { label: 'Messages', href: '/messages', badge: 'messages', onlyInAppWithout: 'messages' },
      { label: 'Calendar', href: '/calendar', onlyInAppWithout: 'calendar' },
    ],
  },
  {
    heading: 'Hiring',
    side: 'right',
    rows: [
      // Post a job is the first button on that page (inPage in the check).
      { label: 'Your job ads', href: '/my-jobs', subline: 'Post, edit, close', liveCount: true },
      // Interviews and Talent pool are here because their merges have not been
      // built. Each one leaves this list in the same change that gives it its
      // new home, never before — as Pipeline and Offers did when the
      // Applicants list replaced them (both redirect to /applied).
      { label: 'Interviews', href: '/interviews' },
      // CANDIDATES AND TALENT POOL ARE DIFFERENT LISTS — see EmployerSidebar.
      { label: 'Candidates', href: '/candidates', subline: 'Search people who can be found' },
      { label: 'Talent pool', href: '/talent-pool', subline: 'People who applied to your jobs' },
      { label: 'Shifts', href: '/temp-work' },
      { label: 'Insights', href: '/dashboard/analytics' },
      { label: 'Reviews of your company', href: '/reviews', companyReviews: true },
    ],
  },
  {
    heading: 'Account',
    side: 'left',
    rows: [
      { label: 'Company profile', href: '/settings/company' },
      // "delete account" is true for employers: /settings/privacy offers the
      // same Delete my account control to both roles since 1 Sept 2026.
      { label: 'Settings', href: '/settings', subline: 'Team, notifications, delete account' },
      { label: 'Admin', href: '/admin', adminOnly: true },
      { label: 'Log out', action: 'log-out' },
    ],
  },
  {
    heading: 'Help',
    side: 'right',
    rows: [
      { label: 'Ask Thrive', action: 'ask-thrive' },
      { label: 'Share feedback', href: '/feedback' },
    ],
  },
]

export const EMPLOYER_MORE_FOOT = { label: 'Browse jobs as a candidate', href: '/jobs' }

// ── THE CANDIDATE PROFILE PAGE (/me) ────────────────────────────────────────
// The app's Profile tab is native (ThriveProfile.swift). This is the website's
// version of the same list, plus the rows the design adds.

export const CANDIDATE_PROFILE: MenuGroup[] = [
  {
    rows: [
      { label: 'Dashboard', href: '/dashboard', subline: 'Your applications, interviews and visibility' },
      { label: 'Your details', href: '/profile' },
      { label: 'CV builder', href: '/cv-builder' },
      { label: 'Job alerts', href: '/job-alerts' },
      { label: 'Notifications', href: '/notifications', badge: 'notifications' },
      { label: 'Company reviews', href: '/reviews' },
    ],
  },
  {
    heading: 'Account',
    rows: [
      { label: 'Settings', href: '/settings', subline: 'Visibility, notifications, delete account' },
      { label: 'Admin', href: '/admin', adminOnly: true },
      { label: 'Log out', action: 'log-out' },
    ],
  },
  {
    heading: 'Help',
    rows: [
      { label: 'Ask Thrive', action: 'ask-thrive' },
      { label: 'Share feedback', href: '/feedback' },
    ],
  },
]

// ── THE BOTTOM BARS ─────────────────────────────────────────────────────────

const hrefsOf = (groups: MenuGroup[]) =>
  groups.flatMap(g => g.rows).map(r => r.href).filter((h): h is string => !!h)

/** The rows that live on More for good, not the ones standing in for a tab an
 *  older app lacks: those pages have a slot of their own, so More must not
 *  claim them. */
export const moreOwnHrefs = (groups: MenuGroup[]) =>
  groups.flatMap(g => g.rows).filter(r => !r.onlyInAppWithout)
    .map(r => r.href).filter((h): h is string => !!h)

export const EMPLOYER_MORE_PATH = '/employer/more'
export const CANDIDATE_PROFILE_PATH = '/me'

export const EMPLOYER_BAR: BarSlot[] = [
  { label: 'Home', href: '/employer/dashboard', icon: 'home', match: [] },
  { label: 'Applicants', href: '/applied', icon: 'users', match: [] },
  { label: 'Calendar', href: '/calendar', icon: 'calendar', match: [] },
  { label: 'Messages', href: '/messages', icon: 'message-square', match: [], badge: 'messages' },
  {
    // No count on the website's More: notifications are the header bell there.
    label: 'More', href: EMPLOYER_MORE_PATH, icon: 'more-horizontal',
    // Everything reached from More keeps More lit — the design's rule — and
    // the company page carries the employer's name, so it matches by prefix.
    // /post-job is reached from Your job ads.
    match: [...moreOwnHrefs(EMPLOYER_MORE), '/post-job', '/company', '/employer/analytics', EMPLOYER_MORE_FOOT.href],
  },
]

export const CANDIDATE_BAR: BarSlot[] = [
  { label: 'Jobs', href: '/jobs', icon: 'briefcase', match: ['/temp-work'] },
  { label: 'Saved', href: '/saved-jobs', icon: 'bookmark', match: [] },
  { label: 'Applications', href: '/applications', icon: 'file-text', match: [] },
  { label: 'Messages', href: '/messages', icon: 'message-square', match: [], badge: 'messages' },
  {
    label: 'Profile', href: CANDIDATE_PROFILE_PATH, icon: 'user',
    match: [...hrefsOf(CANDIDATE_PROFILE), '/company'],
  },
]

export function barFor(role: NavRole): BarSlot[] {
  return role === 'employer' ? EMPLOYER_BAR : CANDIDATE_BAR
}

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + '/')

/** The one slot that is lit for this path, or null. The FIRST match wins, so a
 *  slot's own href is always tested before another slot's `match` list. */
export function activeSlot(role: NavRole, pathname: string): string | null {
  const bar = barFor(role)
  const own = bar.find(s => under(pathname, s.href))
  if (own) return own.label
  const also = bar.find(s => s.match.some(m => under(pathname, m)))
  return also ? also.label : null
}

// ── WHERE THE BAR DOES NOT SHOW ─────────────────────────────────────────────
// A PUSHED PAGE OWNS THE FOOT OF THE SCREEN. A job page has its sticky Apply
// bar and the post-job form its step footer; both are fixed at the bottom, and
// the design's rule is that they REPLACE the bar rather than stack on it.
// Sign-in and onboarding pages carry no navigation at all, the same list the
// app uses for its own tab bar (ThriveRootViewController.noBarPrefixes).
const NO_BAR_PREFIXES = [
  '/job', '/post-job',
  '/login', '/register', '/signup', '/auth', '/welcome', '/reset-password',
  '/forgot-password', '/verify-email', '/account-under-review', '/admin', '/invite',
]

export function barHiddenOn(pathname: string): boolean {
  // '/job' must not swallow '/jobs': under() needs an exact segment.
  return NO_BAR_PREFIXES.some(p => under(pathname, p))
}

// ── THE "‹ More" LINK INSIDE THE APP ────────────────────────────────────────
// The app's tabs have no native back button, so a page opened from the More
// page shows a website-rendered link back to it. Exact paths only: a settings
// sub-page already links back to Settings, and "‹ More" there would skip a
// level. /messages is left out because its layout is fixed to the top of the
// screen and would sit on top of the link.
//
// The stand-in rows (onlyInAppWithout) are left out too: in build 31 those
// pages are tabs of their own, and a "‹ More" on a tab would be wrong.
export function moreBackShownOn(pathname: string, companyPath: string | null): boolean {
  if (pathname === '/messages') return false
  if (companyPath && pathname === companyPath) return true
  return moreOwnHrefs(EMPLOYER_MORE).includes(pathname) || pathname === EMPLOYER_MORE_FOOT.href
}
