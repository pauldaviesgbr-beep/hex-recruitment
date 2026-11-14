'use client'

/**
 * THE WEBSITE'S BOTTOM BAR ON A PHONE — one per role, the same five items the
 * iOS app's native tab bar carries (design_handoff_phone_navigation, 14 Nov
 * 2026). The items come from lib/phoneNav.ts and nowhere else.
 *
 * ── MOUNTED ONCE, IN THE ROOT LAYOUT, NOT IN THE HEADER ─────────────────────
 * Every page renders its own <Header />, so anything inside it unmounts and
 * remounts on each navigation. A bar living there would blink out on every tap
 * and take its height with it, so the page's bottom padding would jump. Here it
 * persists across navigations, the way the cookie banner does.
 *
 * ── IT PUBLISHES ITS HEIGHT; IT NEVER SETS A PADDING ────────────────────────
 * globals.css gives <body> ONE bottom reserve, a sum of every fixed thing at the
 * foot. This bar adds --nav-bottom-h to that sum. It must never give itself a
 * body padding-bottom: a second one at the same specificity silently wins, which
 * is the 13 Aug 2026 bug where the cookie banner covered the Apply button. The
 * height is MEASURED from the rendered box (the safe-area inset differs per
 * device and is invisible to the stylesheet) and goes back to 0 whenever the bar
 * is not on screen — hidden by width, by the app, or on a pushed page.
 *
 * ── HIDDEN INSIDE THE APP ──────────────────────────────────────────────────
 * The app draws its own native bar, so this one carries data-hide-in-app, the
 * same switch that hides the site header there. Two bars would be worse than
 * either.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import { Ico } from './icons'
import { activeSlot, barFor, barHiddenOn, EMPLOYER_MORE_PATH, type NavRole } from '@/lib/phoneNav'
import styles from './PhoneNav.module.css'

export default function PhoneNav() {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const barRef = useRef<HTMLElement>(null)
  const [role, setRole] = useState<NavRole | null>(null)
  const { totalUnreadCount } = useMessages()

  // The role the HEADER uses, read the same way, so the bar and the header can
  // never disagree about who is signed in.
  useEffect(() => {
    const roleOf = (u: any): NavRole | null =>
      !u ? null : u.user_metadata?.role === 'employer' ? 'employer' : 'candidate'
    if (DEV_MODE) { setRole(roleOf(getMockUser())); return }
    supabase.auth.getSession().then(({ data: { session } }) => setRole(roleOf(session?.user)))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setRole(roleOf(session?.user)))
    return () => subscription.unsubscribe()
  }, [])

  const show = role !== null && !barHiddenOn(pathname)

  useEffect(() => {
    const root = document.documentElement
    const el = barRef.current
    if (!show || !el) { root.style.setProperty('--nav-bottom-h', '0px'); return }
    // 0 when CSS hides it (wider than a phone, or inside the app), because
    // getBoundingClientRect of a display:none element is 0.
    const set = () => root.style.setProperty('--nav-bottom-h', Math.ceil(el.getBoundingClientRect().height) + 'px')
    set()
    // A ResizeObserver as well as resize: the box also changes when the app
    // toggles its class, which no window event reports.
    const ro = new ResizeObserver(set)
    ro.observe(el)
    window.addEventListener('resize', set)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', set)
      root.style.setProperty('--nav-bottom-h', '0px')
    }
  }, [show])

  if (!role) return null

  const lit = activeSlot(role, pathname)

  return (
    <>
      {/* THE BRIDGE FOR THE iOS APP ALREADY IN PEOPLE'S HANDS. Build 30's "More"
          tab does not load a page: it runs
            document.querySelector('[aria-label="Open navigation"]').click()
          (ThriveBridgeViewController.openSideMenu), which used to open the
          hamburger drawer. That binary cannot be changed from here, so this
          control answers to the same name and goes to the More page instead —
          the shipped app gets More, with Log out, Notifications and Settings,
          without a new build.
          HERE, NOT IN THE SIDEBAR, because this component is mounted on EVERY
          page and the sidebar is not: the stepped post-job form renders no
          header, and detail pages left the hamburger out, so the app's More tab
          used to do nothing on either. Never painted (display:none at every
          width); HTMLElement.click() still fires on it. Employers only. */}
      {role === 'employer' && (
        <button
          type="button"
          className={styles.bridge}
          data-sidebar-toggle=""
          aria-label="Open navigation"
          tabIndex={-1}
          onClick={() => router.push(EMPLOYER_MORE_PATH)}
        />
      )}
      {show && (
    <nav ref={barRef} className={styles.bar} aria-label="Main" data-hide-in-app="" data-phone-nav={role}>
      <ul className={styles.list}>
        {barFor(role).map(slot => {
          const active = lit === slot.label
          const count = slot.badge === 'messages' ? totalUnreadCount : 0
          return (
            <li key={slot.label} className={styles.item}>
              <Link
                href={slot.href}
                className={styles.link}
                data-active={active ? '' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.pill}>
                  <Ico name={slot.icon} size={24} />
                  {count > 0 && (
                    <span className={styles.badge} aria-hidden="true">{count > 99 ? '99+' : count}</span>
                  )}
                </span>
                <span className={styles.label}>{slot.label}</span>
                {count > 0 && <span className={styles.srOnly}>, {count} unread</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
      )}
    </>
  )
}
