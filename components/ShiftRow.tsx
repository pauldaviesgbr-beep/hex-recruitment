'use client'

/**
 * A POSTED SHIFT AS A TEXT ROW (design 26, round 2, section B). It replaces
 * the photo card (FeedCard) on /temp-work: a shift is the 1b job row with a
 * date line and an action row, in the same bordered list as the job rows, so
 * shifts and jobs read as one product.
 *
 * Top to bottom: title (+ NEW) · pay · place · date · needed · via · age ·
 * then the action row — "I'm available", likes, comments. No image, no logo,
 * no stamp.
 *
 * The open panel (children) renders INSIDE the row, below the actions, when
 * the comment count is tapped. One open at a time is the page's job.
 *
 * FILLED SHIFTS NEVER REACH THIS ROW. Design's round-2 decision: a filled shift
 * leaves the candidate feed at once, so there is no filled state here.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ThumbsUp, MessageCircle, CalendarDays, Check } from 'lucide-react'
import { shiftRowModel, type TempPost } from '@/lib/tempWork'
import styles from './ShiftRow.module.css'

export interface ShiftRowProps {
  post: TempPost
  liked: boolean
  /** The viewer has said they're available for this shift. */
  available: boolean
  busy: boolean
  /** The viewer owns the shift: they get no "I'm available", they manage it. */
  isOwner: boolean
  threadOpen: boolean
  /** Express or withdraw; signed out, the page sends them to sign-up. */
  onAvailable: () => void
  onLike: () => void
  onToggleThread: () => void
  /** The open panel: the shift's description and its comment thread. */
  children?: ReactNode
}

export default function ShiftRow({ post, liked, available, busy, isOwner, threadOpen, onAvailable, onLike, onToggleThread, children }: ShiftRowProps) {
  const m = shiftRowModel(post)
  const isEx = !!post.isExample
  // Examples render their actions and do nothing (design 26: "The actions
  // render but do nothing"). aria-disabled keeps them visible and focusable.
  const noop = isEx
  const dot = <span className={styles.dot} aria-hidden="true"> · </span>

  return (
    <article id={`post-${post.id}`} className={styles.row} data-example={isEx || undefined}>
      {/* The text opens the same panel the comment count does — the shift's
          own description lives there, and a row whose text did nothing would
          hide it behind a count. */}
      <button type="button" className={styles.main} onClick={onToggleThread} aria-expanded={threadOpen}>
        <span className={styles.titleLine}>
          <span className={styles.title}>{m.title}</span>
          {isEx
            ? <span className={styles.exampleChip}>EXAMPLE</span>
            : m.isNew && <span className={styles.newChip}>NEW</span>}
        </span>
        <span className={styles.line2}>
          {m.pay && <span className={styles.pay}>{m.pay.amount} {m.pay.period}</span>}
          {m.pay && m.place && dot}{m.place}
        </span>
        <span className={styles.dateLine}>
          <CalendarDays className={styles.calIcon} size={18} strokeWidth={1.9} aria-hidden="true" />
          <span><span className={styles.when}>{m.when}</span><span className={styles.needed}>{dot}{m.needed}</span></span>
        </span>
        <span className={styles.line4}>{m.via}{dot}{isEx ? 'test builds only' : m.age}</span>
      </button>

      <div className={styles.actions}>
        {isOwner ? (
          <Link href="/temp-work/manage" className={styles.availBtn}>Manage shift</Link>
        ) : (
          <button
            type="button"
            className={`${styles.availBtn} ${available ? styles.availOn : ''}`}
            aria-pressed={available}
            aria-disabled={noop || busy || undefined}
            onClick={() => { if (!noop && !busy) onAvailable() }}
          >
            {available && <Check className={styles.tick} size={18} strokeWidth={3} aria-hidden="true" />}
            {available ? 'You’re available' : 'I’m available'}
          </button>
        )}
        <span className={styles.counts}>
          <button
            type="button"
            className={`${styles.countBtn} ${liked ? styles.countLiked : ''}`}
            aria-pressed={liked}
            aria-label={`${liked ? 'Unlike' : 'Like'} this shift${post.like_count ? `, ${post.like_count} like${post.like_count === 1 ? '' : 's'}` : ''}`}
            aria-disabled={noop || undefined}
            onClick={() => { if (!noop) onLike() }}
          >
            <ThumbsUp size={20} strokeWidth={1.9} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
            {post.like_count > 0 && <span>{post.like_count}</span>}
          </button>
          <button
            type="button"
            className={`${styles.countBtn} ${threadOpen ? styles.countOpen : ''}`}
            aria-expanded={threadOpen}
            aria-label={`Comments${post.comment_count ? `, ${post.comment_count}` : ''}`}
            onClick={onToggleThread}
          >
            <MessageCircle size={20} strokeWidth={1.9} aria-hidden="true" />
            {post.comment_count > 0 && <span>{post.comment_count}</span>}
          </button>
        </span>
      </div>

      {threadOpen && children && <div className={styles.panel}>{children}</div>}
    </article>
  )
}

/** "Posted shifts · 2" / "Short-term jobs · 12": the feed's two group labels. */
export function FeedGroupLabel({ children }: { children: ReactNode }) {
  return <h2 className={styles.groupLabel}>{children}</h2>
}
