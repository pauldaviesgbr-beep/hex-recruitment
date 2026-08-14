'use client'

import styles from './StatsCard.module.css'

// The 48px coloured icon square is GONE — design phase 1, 14 Aug handoff:
// "a lilac square with a briefcase says nothing that 'EMPLOYER-POSTED JOBS
// · 2' doesn't." The icon and color props are accepted and ignored so the
// twelve admin pages that still pass them compile unchanged; they can shed
// the props whenever each file is next touched.
interface StatsCardProps {
  title: string
  value: string | number
  change?: string
  icon?: React.ReactNode
  color?: string
}

export default function StatsCard({ title, value, change }: StatsCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.content}>
        <p className={styles.title}>{title}</p>
        <p className={styles.value}>{value}</p>
        {change && (
          <p className={`${styles.change} ${change.startsWith('+') ? styles.positive : change.startsWith('-') ? styles.negative : ''}`}>
            {change}
          </p>
        )}
      </div>
    </div>
  )
}
