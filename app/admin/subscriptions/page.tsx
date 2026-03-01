'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import StatsCard from '@/components/admin/StatsCard'
import styles from './page.module.css'

interface Subscription {
  user_id: string
  company_name: string
  email: string
  subscription_tier: string | null
  subscription_status: string
  trial_ends_at: string | null
  cancel_at: string | null
  created_at: string
  updated_at: string
}

interface Revenue {
  mrr: number
  standard: { active: number; trialing: number; revenue: number }
  professional: { active: number; trialing: number; revenue: number }
  totalActive: number
  totalTrialing: number
}

export default function AdminSubscriptionsPage() {
  const token = useAdminToken()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [revenue, setRevenue] = useState<Revenue | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [status, setStatus] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      search,
      tier,
      status,
      sort: sortField,
      dir: sortDir,
    })
    const res = await fetch(`/api/admin/subscriptions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setSubscriptions(data.subscriptions || [])
    setTotalPages(data.totalPages || 1)
    setTotalCount(data.total || 0)
    if (data.revenue) setRevenue(data.revenue)
    setLoading(false)
  }, [token, page, search, tier, status, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, tier, status])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleAction = async (action: string, userId: string) => {
    if (action === 'cancel' && !confirm('Cancel this subscription?')) return
    setActionLoading(userId)
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, userId }),
    })
    setActionLoading(null)
    fetchData()
  }

  const columns: Column<Subscription>[] = [
    { key: 'company_name', label: 'Company', sortable: true },
    { key: 'email', label: 'Email' },
    {
      key: 'subscription_tier', label: 'Tier', sortable: true,
      render: (val: string | null) => (
        <span className={`${styles.badge} ${val === 'professional' ? styles.badgePro : val === 'standard' ? styles.badgeStandard : styles.badgeNone}`}>
          {val || 'none'}
        </span>
      ),
    },
    {
      key: 'subscription_status', label: 'Status', sortable: true,
      render: (val: string) => <span className={`${styles.badge} ${styles[`status_${val}`] || ''}`}>{val}</span>,
    },
    {
      key: 'created_at', label: 'Start Date', sortable: true,
      render: (val: string) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
    {
      key: 'trial_ends_at', label: 'Trial End',
      render: (val: string | null) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
  ]

  return (
    <div>
      <h1 className={styles.pageTitle}>Subscription Management</h1>

      {revenue && (
        <div className={styles.revenueGrid}>
          <StatsCard title="Monthly Recurring Revenue" value={`£${revenue.mrr.toFixed(2)}`} icon="💰" color="#16a34a" />
          <StatsCard title="Standard" value={`${revenue.standard.active} active`} change={`${revenue.standard.trialing} trialing`} icon="📦" />
          <StatsCard title="Professional" value={`${revenue.professional.active} active`} change={`${revenue.professional.trialing} trialing`} icon="⭐" color="#8b5cf6" />
          <StatsCard title="Total Trials" value={revenue.totalTrialing} icon="⏳" color="#f59e0b" />
        </div>
      )}

      <div className={styles.filters}>
        <select className={styles.select} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">All Tiers</option>
          <option value="standard">Standard</option>
          <option value="professional">Professional</option>
        </select>
        <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={subscriptions}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by company or email..."
        loading={loading}
        totalCount={totalCount}
        onExportCSV={() => exportToCSV(subscriptions, columns, 'admin-subscriptions')}
        actions={(row) => (
          <>
            {row.subscription_status === 'trialing' && (
              <button className={styles.actionBtn} onClick={() => handleAction('extend_trial', row.user_id)} disabled={actionLoading === row.user_id}>
                Extend Trial
              </button>
            )}
            {row.subscription_status === 'canceled' && (
              <button className={styles.actionBtn} onClick={() => handleAction('reactivate', row.user_id)} disabled={actionLoading === row.user_id}>
                Reactivate
              </button>
            )}
            {(row.subscription_status === 'active' || row.subscription_status === 'trialing') && (
              <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => handleAction('cancel', row.user_id)} disabled={actionLoading === row.user_id}>
                Cancel
              </button>
            )}
          </>
        )}
      />
    </div>
  )
}
