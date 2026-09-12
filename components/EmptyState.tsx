'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?:
    | { label: string; href: string }
    | { label: string; onClick: () => void }
  /**
   * `quiet` is the existing treatment and stays the default, so every current
   * call site is untouched: centred, generous padding, ghost CTA. It is right
   * for a tab that happens to be empty and for a search that matched nothing,
   * because neither is a failure and neither deserves a shout.
   *
   * `primary` is for the ONE empty state that is really an invitation -- a
   * surface with nothing on it yet, where the empty state IS the screen. Left
   * aligned, yellow icon tile, solid CTA.
   *
   * EXTENDED RATHER THAN FORKED, deliberately. A second empty-state component
   * is how two of them drift, and this repo has the scars: three copies of
   * companyNameFromEmail, two of initialsOf, and in both cases the duplication
   * was the delivery mechanism for the fault rather than the fault.
   */
  variant?: 'quiet' | 'primary'
  /**
   * "Takes about four minutes", under the CTA.
   *
   * STATE THE COST IN MINUTES. A checklist that will not say how long it takes
   * is why it gets ignored -- the reader assumes the worst and is usually
   * wrong. Only meaningful on `primary`; ignored on `quiet`.
   */
  cost?: string
}

/**
 * Shared empty state. Every one of them names the object, says what would put
 * something here, and offers exactly one way forward.
 *
 * NO ILLUSTRATIONS -- nothing that could read as hospitality-specific. This
 * product is hospitality-first because that is where the contacts are, not
 * because that is what it is, and an illustrated chef is expensive to unpick.
 */
export default function EmptyState({
  icon: Icon, title, description, action, variant = 'quiet', cost,
}: EmptyStateProps) {
  const primary = variant === 'primary'

  return (
    <div className={styles.wrap} data-variant={variant}>
      <div className={styles.iconWrap}>
        <Icon size={primary ? 20 : 28} strokeWidth={primary ? 2 : 1.5} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && (
        'href' in action ? (
          <Link href={action.href} className={styles.action}>
            {action.label}{primary ? null : <span aria-hidden> →</span>}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={styles.action}>
            {action.label}{primary ? null : <span aria-hidden> →</span>}
          </button>
        )
      )}
      {primary && cost && <p className={styles.cost}>{cost}</p>}
    </div>
  )
}
