'use client'

import styles from './AdminPageHeader.module.css'

interface AdminPageHeaderProps {
  title: string
  /** One line. Optional — only where the page's name is genuinely ambiguous. */
  subtitle?: React.ReactNode
  /**
   * The page-level action. Export lives here now rather than inside the
   * table's toolbar, which is what frees the toolbar to be two rows at 390
   * instead of three.
   */
  action?: React.ReactNode
}

/**
 * THE PAGE FRAME. There was no page-level action slot in the estate: six
 * pages have an Export and every one of them sat inside the table's own
 * toolbar, which is why that toolbar was three rows and ~150px of chrome
 * above every table on a phone.
 */
export default function AdminPageHeader({ title, subtitle, action }: AdminPageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
