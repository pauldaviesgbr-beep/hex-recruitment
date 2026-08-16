'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import DetailPanel, { DetailRow, DetailSection, DetailBadge } from '@/components/admin/DetailPanel'
import StatsCard from '@/components/admin/StatsCard'
import styles from './page.module.css'

interface Job {
  id: string
  title: string
  company: string
  category: string
  location: string
  status: string
  posted_at: string
  expires_at: string
  application_count: number
  view_count: number
  urgent: boolean
}

interface JobDetail {
  id: string
  title: string
  company: string
  description: string
  requirements: string
  salary_min: number
  salary_max: number
  salary_type: string
  category: string
  location: string
  job_type: string
  status: string
  posted_at: string
  expires_at: string
  application_count: number
  view_count: number
  urgent: boolean
  tags: string[]
}

interface Application {
  id: string
  candidate_id: string
  candidate_name: string
  status: string
  applied_at: string
}

export default function AdminJobsPage() {
  const token = useAdminToken()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState<number | null>(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sector, setSector] = useState('')
  const [sectors, setSectors] = useState<string[]>([])
  const [sortField, setSortField] = useState('posted_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [stats, setStats] = useState<{ active: number; filled: number; archived: number } | null>(null)
  // A NUMBER IS A CLAIM — the count is nullable and the state is explicit, so
  // "loading", "no matches", "genuinely empty" and "the request failed" can
  // never again render as the same string.
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailJob, setDetailJob] = useState<JobDetail | null>(null)
  const [detailApps, setDetailApps] = useState<Application[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchJobs = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setTableState('loading')
    setLoadError('')
    const params = new URLSearchParams({
      page: String(page),
      search,
      status,
      sector,
      sort: sortField,
      dir: sortDir,
    })
    try {
      const res = await fetch(`/api/admin/jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS. This one line is the whole difference: a 403 returns
      // perfectly valid JSON, so a bare try/catch never fires and
      // `data.jobs || []` turns the refusal into a confident zero. On 16 Aug
      // this page showed "0 results" against a board of 247 live listings.
      if (!res.ok) throw new Error(data.error || 'Failed to load jobs')
      setJobs(data.jobs || [])
      setTotalPages(data.totalPages || 1)
      // Nullable, never `|| 0` — a count is a claim and there is none to make
      // unless the response arrived and succeeded.
      setTotalCount(typeof data.total === 'number' ? data.total : null)
      if (data.sectors) setSectors(data.sectors)
      if (data.stats) setStats(data.stats)
      setTableState((data.jobs || []).length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setJobs([])
      setTotalCount(null)
      setStats(null)
      setLoadError(e.message || 'Failed to load jobs')
      setTableState('error')
    } finally {
      // ALWAYS. /admin/jobs sat on skeleton rows forever at 05:18 because its
      // setLoading(false) was the last line of a function that threw.
      setLoading(false)
    }
  }, [token, page, search, status, sector, sortField, sortDir])

  useEffect(() => { fetchJobs() }, [fetchJobs])
  useEffect(() => { setPage(1) }, [search, status, sector])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleAction = async (action: string, jobId: string) => {
    if (action === 'remove' && !confirm('Remove this job? It will be archived.')) return
    setActionLoading(jobId)
    await fetch('/api/admin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, jobId }),
    })
    setActionLoading(null)
    fetchJobs()
  }

  const handleBulkAction = async (action: string) => {
    if (selectedIds.length === 0) return
    if (!confirm(`${action === 'bulk_archive' ? 'Archive' : 'Feature'} ${selectedIds.length} job(s)?`)) return
    setActionLoading('bulk')
    await fetch('/api/admin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, jobIds: selectedIds }),
    })
    setActionLoading(null)
    setSelectedIds([])
    fetchJobs()
  }

  const openDetail = async (row: Job) => {
    setDetailOpen(true)
    setDetailLoading(true)
    const res = await fetch(`/api/admin/jobs?jobId=${row.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setDetailJob(data.job || null)
    setDetailApps(data.applications || [])
    setDetailLoading(false)
  }

  const columns: Column<Job>[] = [
    {
      key: 'title',
      label: 'Job Title',
      sortable: true,
      render: (val: string, row: Job) => (
        <div>
          <span className={styles.jobTitle}>{val}</span>
          {row.urgent && <span className={styles.featuredBadge}>Featured</span>}
        </div>
      ),
    },
    { key: 'company', label: 'Company', sortable: true },
    { key: 'category', label: 'Sector' },
    { key: 'location', label: 'Location' },
    {
      key: 'posted_at', label: 'Posted', sortable: true,
      render: (val: string) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
    {
      key: 'status', label: 'Status',
      render: (val: string) => <span className={`${styles.badge} ${styles[`badge_${val}`] || ''}`}>{val}</span>,
    },
    {
      key: 'application_count', label: 'Apps', sortable: true,
      render: (val: number) => val?.toLocaleString() || '0', width: '70px',
    },
    {
      key: 'view_count', label: 'Views', sortable: true,
      render: (val: number) => val?.toLocaleString() || '0', width: '70px',
    },
  ]

  return (
    <div>
      <h1 className={styles.pageTitle}>Job Management</h1>

      {stats && (
        <div className={styles.statsGrid}>
          <StatsCard title="Active" value={stats.active} />
          <StatsCard title="Filled" value={stats.filled} />
          <StatsCard title="Archived" value={stats.archived} />
        </div>
      )}

      <div className={styles.filters}>
        <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="filled">Filled</option>
          <option value="archived">Archived</option>
        </select>
        <select className={styles.select} value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All Sectors</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={jobs}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        status={tableState}
        query={search}
        filtersActive={(search ? 1 : 0) + (status ? 1 : 0) + (sector ? 1 : 0)}
        onClearSearch={() => { setSearch(''); setStatus(''); setSector(''); setPage(1) }}
        onRetry={fetchJobs}
        errorMessage={loadError || undefined}
        entityName="jobs"
        emptyTitle="No jobs yet."
        emptyBody="Roles appear here as employers post them and the weekly import runs."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by job title or company..."
        loading={loading}
        totalCount={totalCount}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={openDetail}
        onExportCSV={() => exportToCSV(jobs, columns, 'admin-jobs')}
        headerActions={
          <>
            <button className={styles.bulkBtn} onClick={() => handleBulkAction('bulk_feature')} disabled={actionLoading === 'bulk'}>Feature</button>
            <button className={`${styles.bulkBtn} ${styles.dangerBtn}`} onClick={() => handleBulkAction('bulk_archive')} disabled={actionLoading === 'bulk'}>Archive</button>
          </>
        }
        actions={(row) => (
          <>
            <button className={styles.actionBtn} onClick={() => handleAction('feature', row.id)} disabled={actionLoading === row.id}>
              {row.urgent ? 'Unfeature' : 'Feature'}
            </button>
            {row.status === 'active' && (
              <button className={styles.actionBtn} onClick={() => handleAction('expire', row.id)} disabled={actionLoading === row.id}>Fill</button>
            )}
            {row.status !== 'active' && row.status !== 'archived' && (
              <button className={styles.actionBtn} onClick={() => handleAction('reactivate', row.id)} disabled={actionLoading === row.id}>Reactivate</button>
            )}
            <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => handleAction('remove', row.id)} disabled={actionLoading === row.id || row.status === 'archived'}>Archive</button>
          </>
        )}
      />

      <DetailPanel
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailJob(null); setDetailApps([]) }}
        title={detailJob?.title || 'Loading...'}
        subtitle={detailJob?.company}
      >
        {detailLoading ? (
          <div className={styles.detailLoading}>Loading job details...</div>
        ) : detailJob ? (
          <>
            <DetailSection title="Job Info">
              <DetailRow label="Status" value={<DetailBadge>{detailJob.status}</DetailBadge>} />
              <DetailRow label="Category" value={detailJob.category} />
              <DetailRow label="Location" value={detailJob.location} />
              <DetailRow label="Type" value={detailJob.job_type} />
              {detailJob.salary_min && (
                <DetailRow label="Salary" value={`£${detailJob.salary_min?.toLocaleString()}${detailJob.salary_max ? ` - £${detailJob.salary_max.toLocaleString()}` : ''} ${detailJob.salary_type || ''}`} />
              )}
              <DetailRow label="Posted" value={detailJob.posted_at ? new Date(detailJob.posted_at).toLocaleDateString('en-GB') : '—'} />
              <DetailRow label="Expires" value={detailJob.expires_at ? new Date(detailJob.expires_at).toLocaleDateString('en-GB') : '—'} />
              <DetailRow label="Views" value={detailJob.view_count?.toLocaleString()} />
              <DetailRow label="Applications" value={detailJob.application_count?.toLocaleString()} />
              <DetailRow label="Featured" value={detailJob.urgent ? 'Yes' : 'No'} />
              {detailJob.tags && detailJob.tags.length > 0 && <DetailRow label="Tags" value={detailJob.tags.join(', ')} />}
            </DetailSection>

            {detailJob.description && (
              <DetailSection title="Description">
                <p className={styles.descText}>{detailJob.description}</p>
              </DetailSection>
            )}

            {detailApps.length > 0 && (
              <DetailSection title={`Applications (${detailApps.length})`}>
                <div className={styles.appList}>
                  {detailApps.map(a => (
                    <div key={a.id} className={styles.appItem}>
                      <span className={styles.appName}>{a.candidate_name}</span>
                      <span className={`${styles.badge} ${styles[`badge_${a.status}`] || ''}`}>{a.status}</span>
                      <span className={styles.appDate}>{new Date(a.applied_at).toLocaleDateString('en-GB')}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            <div className={styles.detailActions}>
              <button className={styles.actionBtn} onClick={() => handleAction('feature', detailJob.id)}>
                {detailJob.urgent ? 'Unfeature' : 'Feature'}
              </button>
              {detailJob.status === 'active' && (
                <button className={styles.actionBtn} onClick={() => handleAction('expire', detailJob.id)}>Mark Filled</button>
              )}
              <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => handleAction('remove', detailJob.id)}>Archive</button>
            </div>
          </>
        ) : (
          <div className={styles.detailLoading}>Job not found</div>
        )}
      </DetailPanel>
    </div>
  )
}
