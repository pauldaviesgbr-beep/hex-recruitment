'use client'

import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import styles from './page.module.css'

const AnalyticsContent = dynamic(() => import('./AnalyticsContent'), {
  ssr: false,
  loading: () => (
    <main className={styles.page}>
      <Header />
      <div className={styles.container}>
        <LoadingSkeleton />
      </div>
    </main>
  ),
})

export default function AnalyticsPage() {
  return <AnalyticsContent />
}

function LoadingSkeleton() {
  return (
    <>
      <div className={styles.skeletonHeader}>
        <div>
          <div className={styles.skeletonLine} style={{ width: '220px', height: '28px' }} />
          <div className={styles.skeletonLine} style={{ width: '180px', height: '16px', marginTop: '0.5rem' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className={styles.skeletonLine} style={{ width: '70px', height: '36px', borderRadius: '8px' }} />
          ))}
        </div>
      </div>
      <div className={styles.skeletonGrid}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <div className={styles.skeletonCircle} />
            <div className={styles.skeletonLine} style={{ width: '60%', margin: '0 auto' }} />
            <div className={styles.skeletonLineShort} />
          </div>
        ))}
      </div>
      <div className={styles.skeletonTwoCol}>
        <div className={styles.skeletonChart} />
        <div className={styles.skeletonChart} style={{ height: '250px' }} />
      </div>
      <div className={styles.skeletonThreeCol}>
        <div className={styles.skeletonChart} style={{ height: '250px' }} />
        <div className={styles.skeletonChart} style={{ height: '250px' }} />
        <div className={styles.skeletonChart} style={{ height: '250px' }} />
      </div>
    </>
  )
}
