'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminToken } from '@/lib/admin-context'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

// Every number on this page excludes the two is_test fixture accounts —
// enforced in /api/admin/stats and /api/admin/health, not here.
//
// DELIBERATELY GONE (14 Aug 2026): the Monthly Revenue card (computed from a
// price that is deliberately undecided), the Active Subscriptions tile and
// pie, and the expiring-trial/past-due alerts (their states are never
// written). Replaced by founding seats, the funnel, per-employer
// responsiveness, and employers-alive — the numbers that say whether the
// platform WORKS rather than how big it is.

interface Stats {
  totalUsers: number
  totalCandidates: number
  totalEmployers: number
  newUsersWeek: number
  newUsersMonth: number
  jobs: { liveBoard: number; employerPosted: number; imported: number; importedRetired: number }
  totalApplications: number
  foundingSeats: { taken: number; of: number }
  growth: {
    candidates: { month: string; count: number }[]
    employers: { month: string; count: number }[]
    jobs: { month: string; count: number }[]
  }
  alerts?: { flaggedReviews: number }
}

interface Health {
  funnel: { signups: number; withProfile: number; withCv: number; applied: number; gotResponse: number; hired: number }
  responsiveness: {
    employerId: string; company: string; received: number
    listOpened: number; actioned: number; medianHoursToOpen: number | null
  }[]
  employersAlive: {
    company: string; approvedAt: string; lastSignIn: string | null
    hasPosted: boolean; hasOpenedApplications: boolean
  }[]
}

// Shape returned by /api/admin/analytics?section=sources — reused as-is rather
// than recomputed here, so the Overview card and the Source tab can never disagree.
interface SourceRow {
  source: string
  count: number
  refs: { ref: string; count: number }[]
}
interface SourcesData {
  candidates: SourceRow[]
  employers: SourceRow[]
}

export default function AdminOverviewPage() {
  const token = useAdminToken()
  const [stats, setStats] = useState<Stats | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [sources, setSources] = useState<SourcesData | null>(null)
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

  // The health numbers (funnel / responsiveness / alive). Fetched separately
  // so a failure here never blocks the rest of the dashboard.
  useEffect(() => {
    if (!token) return
    fetch('/api/admin/health', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data && !data.error) setHealth(data) })
      .catch(() => {})
  }, [token])

  // Acquisition channels, last 30 days.
  useEffect(() => {
    if (!token) return
    fetch('/api/admin/analytics?section=sources&range=30d', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data && !data.error) setSources(data) })
      .catch(() => {})
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

  const fmtSignIn = (iso: string | null) => {
    if (!iso) return 'never'
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const funnelSteps = health ? [
    { label: 'Signed up', value: health.funnel.signups },
    { label: 'Has profile', value: health.funnel.withProfile },
    { label: 'Has CV', value: health.funnel.withCv },
    { label: 'Applied', value: health.funnel.applied },
    { label: 'Got a response', value: health.funnel.gotResponse, isTheDrop: true },
    { label: 'Hired', value: health.funnel.hired },
  ] : []
  const funnelMax = Math.max(...funnelSteps.map(s => s.value), 1)

  const hasAlerts = stats.alerts && stats.alerts.flaggedReviews > 0

  return (
    <div>
      <h1 className={styles.pageTitle}>Dashboard Overview</h1>

      {hasAlerts && stats.alerts && (
        <div className={styles.alertsBar}>
          <div className={`${styles.alert} ${styles.alertInfo}`}>
            <span className={styles.alertIcon}><Ico name="flag" size={20} /></span>
            <span>{stats.alerts.flaggedReviews} flagged review{stats.alerts.flaggedReviews !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {/* ── Phase 3 hierarchy: two headline numbers, then a reference strip.
          MESS TOLERANCE per the spec: a headline tile with no value does not
          render at all — never an em-dash in a 44px number; the delta is
          ABSENT (not zero) when there is nothing to compare; reference cells
          may show an em-dash.
          ONE SOURCE, TWO RENDERINGS: the second headline is health.funnel —
          the exact object the funnel section below renders from. No second
          query computes this fact. */}
      <div className={styles.headlineGrid}>
        {typeof stats.totalUsers === 'number' && (
          <div className={`${styles.headlineTile} ${styles.headlineTileYellow}`}>
            <p className={styles.headlineEyebrow}>Real users</p>
            <div className={styles.headlineValueRow}>
              <p className={styles.headlineValue}>{stats.totalUsers.toLocaleString()}</p>
              {typeof stats.newUsersWeek === 'number' && stats.newUsersWeek !== 0 && (
                <span className={`${styles.headlineDelta} ${stats.newUsersWeek > 0 ? styles.headlineDeltaUp : styles.headlineDeltaDown}`}>
                  {stats.newUsersWeek > 0 ? '+' : ''}{stats.newUsersWeek} this week
                </span>
              )}
            </div>
            <p className={styles.headlineNote}>Candidates and employers, fixtures excluded</p>
          </div>
        )}
        {health && typeof health.funnel.gotResponse === 'number' && (
          <div className={`${styles.headlineTile} ${styles.headlineTileAlert}`}>
            <p className={styles.headlineEyebrow}>Applications that got a response</p>
            <div className={styles.headlineValueRow}>
              <p className={styles.headlineValue}>{health.funnel.gotResponse} of {health.funnel.applied}</p>
              {health.funnel.applied > 0 && (
                <span className={`${styles.headlineDelta} ${styles.headlineDeltaDown}`}>
                  {Math.round(((health.funnel.applied - health.funnel.gotResponse) / health.funnel.applied) * 100)}% lost
                </span>
              )}
            </div>
            <p className={styles.headlineNote}>The same fact as the funnel&apos;s red row, from the same query</p>
          </div>
        )}
      </div>

      <div className={styles.refStrip}>
        <div className={styles.refCell}>
          <p className={styles.refValue}>{typeof stats.newUsersMonth === 'number' ? stats.newUsersMonth.toLocaleString() : '—'}</p>
          <p className={styles.refLabel}>New this month</p>
        </div>
        <div className={styles.refCell}>
          <p className={styles.refValue}>{typeof stats.jobs?.liveBoard === 'number' ? stats.jobs.liveBoard.toLocaleString() : '—'}</p>
          <p className={styles.refLabel}>Live board</p>
        </div>
        <div className={styles.refCell}>
          <p className={styles.refValue}>{typeof stats.jobs?.employerPosted === 'number' ? stats.jobs.employerPosted.toLocaleString() : '—'}</p>
          <p className={styles.refLabel}>Employer-posted</p>
        </div>
        <div className={styles.refCell}>
          <p className={styles.refValue}>{stats.foundingSeats ? `${stats.foundingSeats.taken} of ${stats.foundingSeats.of}` : '—'}</p>
          <p className={styles.refLabel}>Founding seats</p>
        </div>
      </div>

      <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.8rem', color: '#64748b' }}>
        Imported listings: {stats.jobs.imported.toLocaleString()} ({stats.jobs.importedRetired.toLocaleString()} retired).
        Applications: {stats.totalApplications.toLocaleString()}.
        All user, application and posting numbers exclude the two test fixture accounts.
      </p>

      {/* ── The candidate funnel ─────────────────────────────────────────── */}
      <div className={styles.chartCard} style={{ marginBottom: '1.5rem' }}>
        <h3 className={styles.chartTitle}>The candidate funnel — real people only</h3>
        {health ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {funnelSteps.map((s, i) => {
              const pct = health.funnel.signups ? Math.round((s.value / health.funnel.signups) * 100) : 0
              const prev = i > 0 ? funnelSteps[i - 1].value : s.value
              const dropPct = prev > 0 ? Math.round(((prev - s.value) / prev) * 100) : 0
              return (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>
                    <span>{s.label}</span>
                    <span>
                      {s.value} · {pct}%
                      {s.isTheDrop && dropPct > 0 && (
                        <span style={{ color: '#dc2626', marginLeft: 8 }}>▼ {dropPct}% lost here</span>
                      )}
                    </span>
                  </div>
                  <div style={{ height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', outline: s.isTheDrop ? '2px solid #dc2626' : 'none' }}>
                    <div style={{ width: `${(s.value / funnelMax) * 100}%`, height: '100%', background: s.isTheDrop ? '#dc2626' : '#FFE500' }} />
                  </div>
                </div>
              )
            })}
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              “Got a response” = the application was list-opened by the employer or its status ever changed.
            </p>
          </div>
        ) : (
          <div className={styles.emptyChart}>Loading…</div>
        )}
      </div>

      {/* ── Employer responsiveness ──────────────────────────────────────── */}
      <div className={styles.chartCard} style={{ marginBottom: '1.5rem' }}>
        <h3 className={styles.chartTitle}>Employer responsiveness — worst first</h3>
        {health ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Employer</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Received</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>List opened*</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Actioned</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Median hrs to open</th>
                </tr>
              </thead>
              <tbody>
                {health.responsiveness.map(r => (
                  <tr key={r.employerId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: '#1e293b' }}>{r.company}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.received}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: r.listOpened === 0 ? '#dc2626' : undefined, fontWeight: r.listOpened === 0 ? 700 : undefined }}>{r.listOpened}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.actioned}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.medianHoursToOpen ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              *“List opened” means the employer loaded their applicant list — it does NOT mean this
              application was read. Nothing currently records opening an individual application.
            </p>
          </div>
        ) : (
          <div className={styles.emptyChart}>Loading…</div>
        )}
      </div>

      {/* ── Employers alive ──────────────────────────────────────────────── */}
      <div className={styles.chartCard} style={{ marginBottom: '1.5rem' }}>
        <h3 className={styles.chartTitle}>Employers alive — stalest first</h3>
        {health ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Employer</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Last sign-in*</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Ever posted</th>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Ever opened applicants</th>
                </tr>
              </thead>
              <tbody>
                {health.employersAlive.map(e => (
                  <tr key={e.company} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: '#1e293b' }}>{e.company}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{fmtSignIn(e.lastSignIn)}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{e.hasPosted ? 'yes' : <span style={{ color: '#dc2626' }}>no</span>}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{e.hasOpenedApplications ? 'yes' : <span style={{ color: '#dc2626' }}>no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              *Last sign-in only — no sign-in history exists, so frequency is unknowable.
              Automated test drives refresh the fixture accounts’ sign-ins (excluded here anyway).
            </p>
          </div>
        ) : (
          <div className={styles.emptyChart}>Loading…</div>
        )}
      </div>

      {(() => {
        const rows = sources?.candidates || []
        const total = rows.reduce((s, r) => s + r.count, 0)
        const max = Math.max(...rows.map(r => r.count), 1)
        return (
          <div className={styles.chartCard} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 className={styles.chartTitle} style={{ marginBottom: 0 }}>
                Where candidates came from (last 30 days)
              </h3>
              <Link href="/admin/analytics?tab=sources" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6' }}>
                Full breakdown →
              </Link>
            </div>
            <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
              {total} candidate signup{total === 1 ? '' : 's'} in range
            </p>
            {rows.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {rows.map(r => (
                  <div key={r.source}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', fontWeight: 700, color: '#1e293b', marginBottom: 3 }}>
                      <span>{r.source}</span><span>{r.count}</span>
                    </div>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${(r.count / max) * 100}%`, height: '100%', background: '#FFE500' }} />
                    </div>
                    {r.refs.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: 5 }}>
                        {r.refs.map(rf => (
                          <span key={rf.ref} style={{ fontSize: '0.72rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '0.1rem 0.5rem' }}>
                            {rf.ref} · {rf.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyChart}>
                {sources ? 'No candidate signups in the last 30 days' : 'Loading…'}
              </div>
            )}
          </div>
        )
      })()}

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
          <h3 className={styles.chartTitle}>Jobs Posted by Employers (Last 6 Months)</h3>
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
      </div>
    </div>
  )
}
