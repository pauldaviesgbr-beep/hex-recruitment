'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import StatsCard from '@/components/admin/StatsCard'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import styles from './page.module.css'

interface WaitlistEntry {
  id: string
  name: string | null
  company: string | null
  email: string
  type: string
  created_at: string
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminWaitlistPage() {
  const token = useAdminToken()
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [freeSpotsClaimed, setFreeSpotsClaimed] = useState(0)
  const [spotsRemaining, setSpotsRemaining] = useState(EMPLOYER_COHORT_CAP)

  useEffect(() => {
    if (!token) return
    const fetchData = async () => {
      setLoading(true)
      const res = await fetch('/api/admin/waitlist', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.entries && Array.isArray(data.entries)) {
        setEntries(data.entries)
        setFreeSpotsClaimed(data.freeSpotsClaimed ?? 0)
        setSpotsRemaining(data.spotsRemaining ?? EMPLOYER_COHORT_CAP)
      } else if (Array.isArray(data)) {
        setEntries(data)
      }
      setLoading(false)
    }
    fetchData()
  }, [token])

  const stats = useMemo(() => {
    const total = entries.length
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = entries.filter(e => new Date(e.created_at).getTime() >= weekAgo).length
    return { total, thisWeek }
  }, [entries])

  const filtered = useMemo(() => {
    if (!search) return entries
    const q = search.toLowerCase()
    return entries.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.company || '').toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q)
    )
  }, [entries, search])

  const columns: Column<WaitlistEntry>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (_, row) => row.name || '—',
    },
    {
      key: 'company',
      label: 'Company',
      sortable: true,
      render: (_, row) => row.company || '—',
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (_, row) => (
        <a href={`mailto:${row.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
          {row.email}
        </a>
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      sortable: true,
      render: (_, row) => formatRelativeTime(row.created_at),
    },
  ]

  return (
    <div>
      <h1 className={styles.pageTitle}>Waitlist</h1>

      <div className={styles.statsGrid}>
        <StatsCard title="Waitlist Signups" value={stats.total} />
        <StatsCard title="Free Spots Claimed" value={freeSpotsClaimed} />
        <StatsCard title="Spots Remaining" value={spotsRemaining} color={spotsRemaining > 0 ? '#16a34a' : '#dc2626'} />
      </div>

      <AdminTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name, company or email..."
        loading={loading}
        totalCount={filtered.length}
        page={1}
        totalPages={1}
        onPageChange={() => {}}
        onExportCSV={() => exportToCSV(entries, columns, 'waitlist')}
      />
    </div>
  )
}
