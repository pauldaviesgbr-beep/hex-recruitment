'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import StatsStrip from '@/components/admin/StatsStrip'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
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

// MRR IS GONE FROM HERE — the third and last place it lived. Paul deleted it
// from Overview on 14 Aug and Analytics was retired with it on 15 Aug; this
// page was still rendering it.
//
// It was totalActive × EMPLOYER_SUBSCRIPTION_PRICE, a single flat constant on
// a product with no published price. Two reasons it cannot stay:
//   · it read £0.00 only because all eight subscription rows are 'inactive'.
//     The moment one activates it becomes a confident, invented figure.
//   · THE MODEL WILL BE TIERED. Paul, 15 Aug: subscriptions are six to twelve
//     months away and tier-based, structure undecided. A single-price
//     multiplication can never be right under the model that is actually
//     coming, so this is not "wrong until we set the price" — it is the wrong
//     shape entirely.
// The counts stay; they are real.
interface Revenue {
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
  const [totalCount, setTotalCount] = useState<number | null>(0)
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx.
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setTableState('loading')
    setLoadError('')
    const params = new URLSearchParams({
      page: String(page),
      search,
      tier,
      status,
      sort: sortField,
      dir: sortDir,
    })
    try {
      const res = await fetch(`/api/admin/subscriptions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS — a 403 returns valid JSON and `|| []` would turn the
      // refusal into a confident zero. Money is the worst place for that.
      if (!res.ok) throw new Error(data.error || 'Failed to load subscriptions')
      setSubscriptions(data.subscriptions || [])
      setTotalPages(data.totalPages || 1)
      setTotalCount(typeof data.total === 'number' ? data.total : null)
      if (data.revenue) setRevenue(data.revenue)
      setTableState((data.subscriptions || []).length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setSubscriptions([])
      setTotalCount(null)
      // £0 MRR is a claim, and a false one. Em-dash instead.
      setRevenue(null)
      setLoadError(e.message || 'Failed to load subscriptions')
      setTableState('error')
    } finally {
      setLoading(false)
    }
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
      <AdminPageHeader
        title="Subscription Management"
        action={
          <button className={styles.exportAction} onClick={() => exportToCSV(subscriptions, columns, 'admin-subscriptions')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        }
      />

      {/* `.revenueGrid` was `.statsGrid`'s job under another name — the reason
          a class-name grep for statsGrid missed this page entirely. Both are
          now the shared strip, so the two names collapse into none. */}
      <StatsStrip
        tableStatus={tableState}
        stats={[
          { label: 'Active Subscriptions', value: revenue ? revenue.totalActive : null },
          { label: 'Total Trials', value: revenue ? revenue.totalTrialing : null },
        ]}
      />

      <AdminTable
        columns={columns}
        data={subscriptions}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        status={tableState}
        query={search}
        filtersActive={(search ? 1 : 0) + (tier ? 1 : 0) + (status ? 1 : 0)}
        filterSummary={[
          tier ? `Tier: ${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : null,
          status ? `Status: ${status.charAt(0).toUpperCase()}${status.slice(1).replace('_', ' ')}` : null,
        ].filter(Boolean).join(' and ') || undefined}
        onClearSearch={() => { setSearch(''); setTier(''); setStatus(''); setPage(1) }}
        onRetry={fetchData}
        errorMessage={loadError || undefined}
        filters={
          <>
            <select className={styles.select} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
              <option value="">All Tiers</option>
              <option value="standard">Standard</option>
              <option value="free">Free</option>
            </select>
            <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
              <option value="inactive">Inactive</option>
            </select>
          </>
        }
        entityName="subscriptions"
        emptyTitle="No subscriptions yet."
        emptyBody="Employer accounts appear here once they hold a plan."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by company or email..."
        loading={loading}
        totalCount={totalCount}
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
