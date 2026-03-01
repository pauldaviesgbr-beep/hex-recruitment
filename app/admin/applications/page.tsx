'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import StatsCard from '@/components/admin/StatsCard'
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
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sortField, setSortField] = useState('applied_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [stats, setStats] = useState<{ total: number; pending: number; interview: number; offered: number } | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      search,
      status,
      sort: sortField,
      dir: sortDir,
    })
    const res = await fetch(`/api/admin/applications?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setApplications(data.applications || [])
    setTotalPages(data.totalPages || 1)
    setTotalCount(data.total || 0)
    if (data.stats) setStats(data.stats)
    setLoading(false)
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
      <h1 className={styles.pageTitle}>Applications</h1>

      {stats && (
        <div className={styles.statsGrid}>
          <StatsCard title="Total" value={stats.total} icon="📋" />
          <StatsCard title="Pending" value={stats.pending} icon="⏳" color="#f59e0b" />
          <StatsCard title="Interview" value={stats.interview} icon="🎤" color="#8b5cf6" />
          <StatsCard title="Offered" value={stats.offered} icon="🎉" color="#16a34a" />
        </div>
      )}

      <div className={styles.filters}>
        <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="viewed">Viewed</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="interview">Interview</option>
          <option value="offered">Offered</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={applications}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by job title or company..."
        loading={loading}
        totalCount={totalCount}
        onExportCSV={() => exportToCSV(applications, columns, 'admin-applications')}
      />
    </div>
  )
}
