'use client'

/**
 * THE EMPLOYER BOTTOM BAR — four slots, mobile only.
 *
 *   Home · Job ads · Applicants · More
 *
 * The fifteen-item sidebar stays behind More. The rule that makes the bar
 * worth having is that NOTHING IN THE FIRST THREE MAY EXIST ONLY THERE — a
 * capability reachable only from a drawer is a capability employers believe
 * is missing, which is the same finding that put the word "Edit" on the
 * advert card.
 *
 * ── IT PUBLISHES ITS HEIGHT; IT NEVER SETS A PADDING ─────────────────────
 *
 * `app/globals.css` reserves ONE bottom padding on <body>, summing every
 * fixed thing that sits at the foot: the Ask Thrive launcher (--chat-clear)
 * and the cookie banner (--consent-h). This bar adds --nav-bottom-h to that
 * SAME SUM.
 *
 * It must never give itself `body { padding-bottom }`. That is not a style
 * preference — globals.css carries a comment about the exact bug: a second
 * `padding-bottom: 80px` at the same specificity silently WON over the
 * consent reserve, so --consent-h was published and then ignored, and the
 * cookie banner covered the Apply button on a job post. Two things that must
 * agree need one path that sets both.
 *
 * MEASURE THE BOX, DO NOT RESTATE IT. The height is read from
 * getBoundingClientRect and republished on resize — the same pattern as
 * CookieConsent, and for the same reason recorded there: a number in the CSS
 * is not the number on the screen, and the only way the two cannot disagree
 * is for there to be one number, the rendered one. The label wraps on a
 * narrow handset and the safe-area inset differs per device; neither is
 * knowable from the stylesheet.
 */

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ico, type IconName } from './icons'
import styles from './BottomNav.module.css'

type Slot = {
  label: string
  href: string
  icon: IconName
  /** Extra paths that should light this slot up. */
  also?: string[]
}

const SLOTS: Slot[] = [
  { label: 'Home', href: '/employer/dashboard', icon: 'home' },
  // One noun per object. The page, the nav label and the title are all
  // "Job ads" — never "Manage Job Ads", never "My Jobs".
  { label: 'Job ads', href: '/my-jobs', icon: 'briefcase', also: ['/post-job'] },
  { label: 'Applicants', href: '/applied', icon: 'users', also: ['/pipeline'] },
  { label: 'More', href: '#more', icon: 'menu' },
]

export default function BottomNav({ applicantCount = 0 }: { applicantCount?: number }) {
  const pathname = usePathname()
  const barRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = document.documentElement
    const el = barRef.current
    if (!el) return
    const set = () =>
      root.style.setProperty('--nav-bottom-h', Math.ceil(el.getBoundingClientRect().height) + 'px')
    set()
    // ResizeObserver rather than a resize listener: the bar also changes
    // height when a LABEL rewraps, which no window event reports.
    const ro = new ResizeObserver(set)
    ro.observe(el)
    window.addEventListener('resize', set)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', set)
      // Unmounting with the lane still reserved leaves a dead gap at the foot
      // of every page — the failure CookieConsent's teardown exists to avoid.
      root.style.setProperty('--nav-bottom-h', '0px')
    }
  }, [])

  const isActive = (s: Slot) => {
    if (s.href.startsWith('#')) return false
    const all = [s.href, ...(s.also ?? [])]
    return all.some(h => pathname === h || pathname.startsWith(h + '/'))
  }

  // The drawer is the existing sidebar; its toggle already lives in the
  // header, so More opens the same thing rather than a second drawer.
  const openMore = () => {
    document.dispatchEvent(new CustomEvent('thrive:open-sidebar'))
  }

  return (
    <nav ref={barRef} className={styles.bar} aria-label="Main">
      <ul className={styles.list}>
        {SLOTS.map(slot => {
          const active = isActive(slot)
          const inner = (
            <>
              <span className={styles.iconWrap}>
                <Ico name={slot.icon} size={20} />
                {slot.label === 'Applicants' && applicantCount > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {applicantCount > 99 ? '99+' : applicantCount}
                  </span>
                )}
              </span>
              <span className={styles.label}>{slot.label}</span>
            </>
          )
          return (
            <li key={slot.label} className={styles.item}>
              {slot.href.startsWith('#') ? (
                <button
                  type="button"
                  onClick={openMore}
                  className={styles.link}
                  data-active={active ? '' : undefined}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  href={slot.href}
                  className={styles.link}
                  data-active={active ? '' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  {inner}
                  {slot.label === 'Applicants' && applicantCount > 0 && (
                    <span className={styles.srOnly}>{applicantCount} new</span>
                  )}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
