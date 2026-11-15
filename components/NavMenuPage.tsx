'use client'

/**
 * THE LIST PAGE BEHIND THE LAST SLOT OF THE BOTTOM BAR — More for an employer,
 * Profile for a candidate (design_handoff_phone_navigation, mockup 3c).
 *
 * It replaces the hamburger sheet, and inside the iOS app it is the page the
 * More tab loads, which is what finally gives an employer Log out,
 * Notifications and Settings there: before this, the app could reach neither
 * Log out nor Notifications at all.
 *
 * The rows come from lib/phoneNav.ts. This file only draws them.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Header from './Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { isAdmin } from '@/lib/admin-client'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { useMessages } from '@/lib/MessagesContext'
import { useNotifications } from '@/lib/NotificationsContext'
import type { MenuGroup, MenuRow } from '@/lib/phoneNav'
import styles from './NavMenuPage.module.css'

type Props = {
  title: string
  groups: MenuGroup[]
  foot?: { label: string; href: string }
}

export default function NavMenuPage({ title, groups, foot }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  // null until the count has answered: the subline then carries no number at
  // all rather than a guessed one.
  const [liveAds, setLiveAds] = useState<number | null>(null)
  const { totalUnreadCount } = useMessages()
  const { unreadCount } = useNotifications()
  const wantsLiveCount = groups.some(g => g.rows.some(r => r.liveCount))

  useEffect(() => {
    if (DEV_MODE) {
      const u = getMockUser()
      setEmail(u?.email ?? null)
      setCompanyName(u?.user_metadata?.company_name || '')
      return
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setEmail(session?.user?.email ?? null)
      setCompanyName(session?.user?.user_metadata?.company_name || '')
      if (!wantsLiveCount || !session) return
      // The same set the job ads page shows as Live: this employer's adverts
      // (keyed on the OWNER's id, so a team member counts the company's), with
      // status 'active'.
      const owner = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      const { count, error } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('employer_id', owner)
        .eq('status', 'active')
      if (!error && typeof count === 'number') setLiveAds(count)
    })
  }, [wantsLiveCount])

  const logOut = async () => {
    if (DEV_MODE) {
      localStorage.removeItem('userRole')
      router.push('/')
      return
    }
    await supabase.auth.signOut()
    router.push('/')
  }

  const countFor = (row: MenuRow) =>
    row.badge === 'messages' ? totalUnreadCount : row.badge === 'notifications' ? unreadCount : 0

  // The company page carries the employer's name in its path, the same rule
  // the sidebar's "My Reviews" link uses.
  const hrefFor = (row: MenuRow) =>
    row.companyReviews && companyName ? `/company/${encodeURIComponent(companyName)}` : row.href

  const rowInner = (row: MenuRow, chevron: boolean) => {
    const count = countFor(row)
    return (
      <>
        <span className={styles.rowText}>
          <span className={styles.rowLabel}>{row.label}</span>
          {row.subline && (
            <span className={styles.rowSubline}>
              {row.liveCount && liveAds !== null ? `${liveAds} live · ` : ''}{row.subline}
            </span>
          )}
        </span>
        {count > 0 && (
          <span className={styles.badge} aria-label={`${count} unread`}>{count > 99 ? '99+' : count}</span>
        )}
        {chevron && <span className={styles.chevron} aria-hidden="true">›</span>}
      </>
    )
  }

  const renderGroup = (group: MenuGroup, gi: number) => {
    const rows = group.rows.filter(r => !r.adminOnly || isAdmin(email ?? undefined))
    return (
      <section key={gi} className={styles.group} aria-label={group.heading || title}>
        {group.heading && <h2 className={styles.groupLabel}>{group.heading}</h2>}
        <ul className={`${styles.card} ${gi === 0 && !group.heading ? styles.cardTop : ''}`}>
          {rows.map(row => {
            const rowClass = `${styles.row} ${row.subline ? styles.rowTall : ''}`
            return (
              <li
                key={row.label}
                className={styles.rowItem}
                data-only-app-without={row.onlyInAppWithout}
              >
                {row.action === 'log-out' ? (
                  <button type="button" className={`${rowClass} ${styles.rowDanger}`} onClick={logOut}>
                    {rowInner(row, false)}
                  </button>
                ) : row.action === 'ask-thrive' ? (
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => window.dispatchEvent(new CustomEvent('open-thrive-chatbot'))}
                  >
                    {rowInner(row, true)}
                  </button>
                ) : (
                  <Link href={hrefFor(row) || '/'} className={rowClass}>
                    {rowInner(row, true)}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  // TWO INDEPENDENT COLUMNS FROM 768 UP, when the groups say which side they
  // go on (design review, 15 Nov 2026: left Notifications then Account, right
  // Hiring then Help). A grid lines its rows up across columns, so Account
  // used to start below the bottom of the much taller Hiring card. Each
  // column is its own stack instead. The list is drawn twice, once per
  // layout, and CSS shows one: that keeps reading and tab order the same as
  // what is on screen at both widths, which reordering one list with CSS
  // `order` would not. display:none takes the hidden copy out of the
  // accessibility tree and the tab order.
  const sided = groups.some(g => g.side)
  const indexed = groups.map((g, gi) => ({ g, gi }))

  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.inner}>
        <h1 className={styles.title}>{title}</h1>
        <div className={`${styles.groups} ${sided ? styles.groupsPhoneOnly : ''}`}>
          {indexed.map(({ g, gi }) => renderGroup(g, gi))}
        </div>
        {sided && (
          <div className={styles.columns}>
            {(['left', 'right'] as const).map(side => (
              <div key={side} className={styles.column}>
                {indexed.filter(({ g }) => (g.side ?? 'left') === side).map(({ g, gi }) => renderGroup(g, gi))}
              </div>
            ))}
          </div>
        )}
        {foot && (
          <p className={styles.foot}>
            <Link href={foot.href} className={styles.footLink}>{foot.label}</Link>
          </p>
        )}
      </div>
    </main>
  )
}
