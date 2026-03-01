'use client'

import { useState, useEffect } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import StatsCard from '@/components/admin/StatsCard'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import styles from './page.module.css'

const PIE_COLORS = ['#FFE500', '#3b82f6', '#64748b']

interface Stats {
  totalUsers: number
  totalCandidates: number
  totalEmployers: number
  newUsersWeek: number
  newUsersMonth: number
  totalJobs: number
  activeJobs: number
  totalApplications: number
  subscriptions: { standard: number; professional: number; trials: number; total: number }
  monthlyRevenue: number
  growth: {
    candidates: { month: string; count: number }[]
    employers: { month: string; count: number }[]
    jobs: { month: string; count: number }[]
  }
  alerts?: {
    expiringTrials: number
    pastDuePayments: number
    flaggedReviews: number
  }
}

export default function AdminOverviewPage() {
  const token = useAdminToken()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setStats(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token])

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>
  }

  if (!stats) {
    return <div className={styles.error}>Failed to load dashboard data</div>
  }

  const formatMonth = (m: string) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const [, month] = m.split('-')
    return months[parseInt(month) - 1] || m
  }

  const userGrowth = stats.growth.candidates.map((c, i) => ({
    month: formatMonth(c.month),
    candidates: c.count,
    employers: stats.growth.employers[i]?.count || 0,
  }))

  const jobGrowth = stats.growth.jobs.map(j => ({
    month: formatMonth(j.month),
    jobs: j.count,
  }))

  const subsPie = [
    { name: 'Professional', value: stats.subscriptions.professional },
    { name: 'Standard', value: stats.subscriptions.standard },
    { name: 'Trials', value: stats.subscriptions.trials },
  ].filter(s => s.value > 0)

  const hasAlerts = stats.alerts && (stats.alerts.expiringTrials > 0 || stats.alerts.pastDuePayments > 0 || stats.alerts.flaggedReviews > 0)

  return (
    <div>
      <h1 className={styles.pageTitle}>Dashboard Overview</h1>

      {hasAlerts && stats.alerts && (
        <div className={styles.alertsBar}>
          {stats.alerts.expiringTrials > 0 && (
            <div className={`${styles.alert} ${styles.alertWarning}`}>
              <span className={styles.alertIcon}>⏳</span>
              <span>{stats.alerts.expiringTrials} trial{stats.alerts.expiringTrials !== 1 ? 's' : ''} expiring in 3 days</span>
            </div>
          )}
          {stats.alerts.pastDuePayments > 0 && (
            <div className={`${styles.alert} ${styles.alertDanger}`}>
              <span className={styles.alertIcon}>⚠️</span>
              <span>{stats.alerts.pastDuePayments} past due payment{stats.alerts.pastDuePayments !== 1 ? 's' : ''}</span>
            </div>
          )}
          {stats.alerts.flaggedReviews > 0 && (
            <div className={`${styles.alert} ${styles.alertInfo}`}>
              <span className={styles.alertIcon}>🚩</span>
              <span>{stats.alerts.flaggedReviews} flagged review{stats.alerts.flaggedReviews !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.statsGrid}>
        <StatsCard title="Total Users" value={stats.totalUsers.toLocaleString()} change={`+${stats.newUsersWeek} this week`} icon="👥" />
        <StatsCard title="New This Month" value={stats.newUsersMonth.toLocaleString()} icon="📈" color="#3b82f6" />
        <StatsCard title="Total Jobs" value={stats.totalJobs.toLocaleString()} icon="💼" color="#8b5cf6" />
        <StatsCard title="Active Jobs" value={stats.activeJobs.toLocaleString()} icon="🟢" color="#16a34a" />
        <StatsCard title="Applications" value={stats.totalApplications.toLocaleString()} icon="📋" color="#f59e0b" />
        <StatsCard title="Active Subscriptions" value={stats.subscriptions.total.toLocaleString()} icon="💳" color="#0ea5e9" />
      </div>

      <div className={styles.revenueCard}>
        <div className={styles.revenueHeader}>
          <h2>Monthly Revenue (Estimated)</h2>
          <span className={styles.revenueAmount}>£{stats.monthlyRevenue.toFixed(2)}</span>
        </div>
        <div className={styles.revenueBreakdown}>
          <div className={styles.revenueItem}>
            <span className={styles.revLabel}>Standard ({stats.subscriptions.standard})</span>
            <span>£{(stats.subscriptions.standard * 29.99).toFixed(2)}</span>
          </div>
          <div className={styles.revenueItem}>
            <span className={styles.revLabel}>Professional ({stats.subscriptions.professional})</span>
            <span>£{(stats.subscriptions.professional * 59.99).toFixed(2)}</span>
          </div>
          <div className={styles.revenueItem}>
            <span className={styles.revLabel}>Trials</span>
            <span>{stats.subscriptions.trials}</span>
          </div>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>User Signups (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={userGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="candidates" stroke="#FFE500" strokeWidth={2} name="Candidates" />
              <Line type="monotone" dataKey="employers" stroke="#3b82f6" strokeWidth={2} name="Employers" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Jobs Posted (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={jobGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="jobs" fill="#FFE500" radius={[4, 4, 0, 0]} name="Jobs" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Subscription Distribution</h3>
          {subsPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={subsPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {subsPie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.emptyChart}>No active subscriptions</div>
          )}
        </div>
      </div>
    </div>
  )
}
