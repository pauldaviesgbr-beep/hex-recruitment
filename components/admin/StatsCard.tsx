'use client'

import styles from './StatsCard.module.css'

interface StatsCardProps {
  title: string
  value: string | number
  change?: string
  icon: React.ReactNode
  color?: string
}

export default function StatsCard({ title, value, change, icon, color }: StatsCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.iconWrapper} style={color ? { background: color } : undefined}>
        {icon}
      </div>
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
