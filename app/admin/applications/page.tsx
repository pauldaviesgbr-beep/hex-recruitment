'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import StatsStrip from '@/components/admin/StatsStrip'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import styles from './page.module.css'

interface Application {
  id: string
  job_id: string
  candidate_id: string
  candidate_name: string
  candidate_email: string
  job_title: string
  company: string
  status: string
  applied_at: string
  cover_letter: string
}

export default function AdminApplicationsPage() {
  const token = useAdminToken()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState<number | null>(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx.
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [sortField, setSortField] = useState('applied_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [stats, setStats] = useState<{ total: number; pending: number; interview: number; offered: number } | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setTableState('loading')
    setLoadError('')
    const params = new URLSearchParams({
      page: String(page),
      search,
      status,
      sort: sortField,
      dir: sortDir,
    })
    try {
      const res = await fetch(`/api/admin/applications?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS — a 403 returns valid JSON and `|| []` would turn the
      // refusal into a confident zero.
      if (!res.ok) throw new Error(data.error || 'Failed to load applications')
      setApplications(data.applications || [])
      setTotalPages(data.totalPages || 1)
      setTotalCount(typeof data.total === 'number' ? data.total : null)
      if (data.stats) setStats(data.stats)
      setTableState((data.applications || []).length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setApplications([])
      setTotalCount(null)
      // The stat cards make claims too — em-dash, not a stale or zero number.
      setStats(null)
      setLoadError(e.message || 'Failed to load applications')
      setTableState('error')
    } finally {
      setLoading(false)
    }
  }, [token, page, search, status, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, status])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const columns: Column<Application>[] = [
    { key: 'candidate_name', label: 'Candidate', sortable: false },
    { key: 'job_title', label: 'Job', sortable: true },
    { key: 'company', label: 'Company', sortable: true },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (val: string) => <span className={`${styles.badge} ${styles[`badge_${val}`] || ''}`}>{val}</span>,
    },
    {
      key: 'applied_at', label: 'Applied', sortable: true,
      render: (val: string) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Applications"
        action={
          <button className={styles.exportAction} onClick={() => exportToCSV(applications, columns, 'admin-applications')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        }
      />

      {/* Rendered in every state, values nullable — an em-dash holds the space
          and states nothing, rather than the strip appearing as the request
          lands and pushing the table down under the reader. */}
      <StatsStrip
        tableStatus={tableState}
        stats={[
          { label: 'Total', value: stats ? stats.total : null },
          { label: 'Pending', value: stats ? stats.pending : null },
          { label: 'Interview', value: stats ? stats.interview : null },
          { label: 'Offered', value: stats ? stats.offered : null },
        ]}
      />

      <AdminTable
        columns={columns}
        data={applications}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        status={tableState}
        query={search}
        filtersActive={(search ? 1 : 0) + (status ? 1 : 0)}
        filterSummary={status ? `Status: ${status.charAt(0).toUpperCase()}${status.slice(1)}` : undefined}
        onClearSearch={() => { setSearch(''); setStatus(''); setPage(1) }}
        onRetry={fetchData}
        errorMessage={loadError || undefined}
        filters={
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="viewed">Viewed</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="interview">Interview</option>
            <option value="offered">Offered</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        }
        entityName="applications"
        emptyTitle="No applications yet."
        emptyBody="They appear here as candidates apply to live roles."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by job title or company..."
        loading={loading}
        totalCount={totalCount}
      />
    </div>
  )
}
