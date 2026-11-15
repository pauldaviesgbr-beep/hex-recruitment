'use client'

/**
 * THE EMPLOYER'S MANAGE CARD (design 26, round 2: "/temp-work/manage uses the
 * September job ad card, design_handoff_employer_jobs §3, so shifts and job ads
 * are managed the same way"). Shifts use it now; the job-ads rebuild (C) is
 * meant to use it too, rather than a second copy of the same card.
 *
 *   ● LIVE · STARTS 25 NOV                         ⋯
 *   Title
 *   lines…                         (pay · place / date / info)
 *   [ 5 people available            Review › ]     only while someone waits
 *   ───────────────────────────────────────────
 *   [ action ]  [ action ]                          48 tall
 *
 * WEIGHT TRACKS HOW MUCH IT NEEDS YOU: a live card with people waiting is the
 * loudest thing on the page, a filled one the quietest (tinted, lighter title,
 * no attention strip). The September card's argument, kept.
 *
 * The title and the attention strip both open the review panel (children),
 * which is how a card with comments but nobody available is still workable.
 *
 * DOM ORDER: title → lines → attention → panel → actions → ⋯. The menu paints
 * top-right but comes last for a keyboard user, because it holds Close.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './ManageCard.module.css'

export interface ManageCardAction { label: string; onClick: () => void; disabled?: boolean }

export interface ManageCardProps {
  /** "LIVE", "FILLED", "CLOSED". Caps come from the CSS. */
  statusWord: string
  /** "starts 25 Nov". Only ever a fact true of this item. */
  statusDetail?: string
  live: boolean
  title: string
  /** The body lines under the title, in order. */
  lines: ReactNode[]
  /** The attention strip, shown only when someone is waiting. */
  attention?: string
  /** Whether the review panel is open; the page owns it. */
  open: boolean
  onToggleOpen: () => void
  /** 0, 1 or 2 cells. None renders no bar at all. */
  actions: ManageCardAction[]
  /** The ⋯ menu. Empty renders no ⋯. */
  menu: ManageCardAction[]
  menuLabel: string
  children?: ReactNode
}

export default function ManageCard({ statusWord, statusDetail, live, title, lines, attention, open, onToggleOpen, actions, menu, menuLabel, children }: ManageCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the ⋯ menu on an outside tap or Escape, like every other menu.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <article className={styles.card} data-live={live || undefined}>
      <div className={styles.body}>
        <p className={styles.status} data-live={live || undefined}>
          <span className={styles.dot} aria-hidden="true" />
          {statusWord}{statusDetail ? ` · ${statusDetail}` : ''}
        </p>
        <h3 className={styles.title}>
          <button type="button" className={styles.titleBtn} onClick={onToggleOpen} aria-expanded={open}>{title}</button>
        </h3>
        {lines.map((l, i) => <p key={i} className={i === lines.length - 1 && lines.length > 1 ? styles.info : styles.line}>{l}</p>)}

        {attention && (
          <button type="button" className={styles.attn} onClick={onToggleOpen} aria-expanded={open}>
            <span className={styles.attnLead}>{attention}</span>
            <span className={styles.attnGo}>Review ›</span>
          </button>
        )}

        {open && children && <div className={styles.panel}>{children}</div>}
      </div>

      {actions.length > 0 && (
        <div className={styles.actions} data-single={actions.length === 1 || undefined}>
          {actions.map(a => (
            <button key={a.label} type="button" className={styles.action} onClick={a.onClick} disabled={a.disabled}>{a.label}</button>
          ))}
        </div>
      )}

      {menu.length > 0 && (
        <div className={styles.menuWrap} ref={menuRef}>
          <button type="button" className={styles.kebab} aria-label={menuLabel} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              {menu.map(a => (
                <button key={a.label} type="button" role="menuitem" className={styles.menuItem} disabled={a.disabled} onClick={() => { setMenuOpen(false); a.onClick() }}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
