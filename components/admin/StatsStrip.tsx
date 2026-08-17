'use client'

import styles from './StatsStrip.module.css'

export interface Stat {
  label: string
  /**
   * A NUMBER IS A CLAIM. `null` means there is no claim to make — the request
   * is in flight, or it failed — and renders an em-dash, never 0.
   */
  value: string | number | null | undefined
}

interface StatsStripProps {
  stats: Stat[]
  /**
   * The table's state, so the strip can disappear when it would say nothing.
   * Design: "Hidden entirely when all values are zero AND the table is empty.
   * Reviews currently opens with three noughts above 'No results found';
   * waitlist with three more. Six zeroes teach nothing."
   *
   * BOTH HALVES MATTER. All-zero with rows present is a real fact about a
   * filtered view and stays. An empty table whose stats are non-zero is the
   * filtered-to-nothing case, and hiding the totals there would remove the
   * only thing telling the reader what they filtered away from.
   */
  tableStatus?: 'loading' | 'ok' | 'empty' | 'error'
}

/**
 * REFERENCE WEIGHT, NOT HEADLINE WEIGHT.
 *
 * Replaces the per-page `.statsGrid` of ~120px cards on the seven table
 * pages. One bordered container with hairline dividers, so three cards saying
 * nothing three times stop dominating a phone screen above the table that is
 * the actual page.
 *
 * NOT for /admin's overview tiles — those are headline tiles and keep their
 * icons and left borders. This is the quiet version that sits above a table.
 */
export default function StatsStrip({ stats, tableStatus }: StatsStripProps) {
  const numeric = stats.map(s => (typeof s.value === 'number' ? s.value : null))
  const allZero = numeric.length > 0 && numeric.every(v => v === 0)

  if (allZero && tableStatus === 'empty') return null

  return (
    <div className={styles.strip}>
      {stats.map(s => {
        const hasValue = s.value !== null && s.value !== undefined
        return (
          <div key={s.label} className={styles.cell}>
            <p className={`${styles.value} ${hasValue ? '' : styles.valueUnknown}`}>
              {hasValue ? s.value : <span aria-label="not available">&mdash;</span>}
            </p>
            <p className={styles.label}>{s.label}</p>
          </div>
        )
      })}
    </div>
  )
}
