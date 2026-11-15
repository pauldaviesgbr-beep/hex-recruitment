'use client'

/**
 * SAVE: a 44×44 target with a 24px bookmark, on every job surface that offers
 * it — the 1b row (JobRow) and the 1a card's corner (JobTypeCard). One button
 * so the two cannot drift; it used to live inside JobRow alone.
 *
 * It sits ABOVE a stretched row or card link (position + z-index), and stops
 * the click there, so tapping the bookmark never opens the job.
 */

import styles from './SaveJobButton.module.css'

export default function SaveJobButton({ saved, onToggle, title }: { saved: boolean; onToggle: () => void; title: string }) {
  return (
    <button
      type="button"
      className={styles.save}
      aria-pressed={saved}
      aria-label={saved ? `Unsave ${title}` : `Save ${title}`}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle() }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 21l-6-4.5L6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5z" />
      </svg>
    </button>
  )
}
