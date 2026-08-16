'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
  const [freeSpotsClaimed, setFreeSpotsClaimed] = useState<number | null>(0)
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(EMPLOYER_COHORT_CAP)
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx. This page is
  // the one where the old code was WORST: a failed request fell through both
  // `if` arms in silence, leaving entries [], and rendered "0 results" with
  // "100 spots remaining" beside it. Both numbers were inventions.
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setTableState('loading')
    setLoadError('')
    try {
      const res = await fetch('/api/admin/waitlist', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS — a 403 returns valid JSON, and the shape check below
      // would simply not match it, which is indistinguishable from an empty
      // waitlist.
      if (!res.ok) throw new Error(data.error || 'Failed to load the waitlist')
      let loaded: WaitlistEntry[]
      if (data.entries && Array.isArray(data.entries)) {
        loaded = data.entries
        setFreeSpotsClaimed(data.freeSpotsClaimed ?? 0)
        setSpotsRemaining(data.spotsRemaining ?? EMPLOYER_COHORT_CAP)
      } else if (Array.isArray(data)) {
        loaded = data
      } else {
        // A 200 whose body is neither shape is not an empty waitlist — it is a
        // response we do not understand, and saying "nobody is waiting" about
        // it is the same false claim by a different route.
        throw new Error('The waitlist response was not in a shape this page can read')
      }
      setEntries(loaded)
      setTableState(loaded.length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setEntries([])
      setFreeSpotsClaimed(null)
      setSpotsRemaining(null)
      setLoadError(e.message || 'Failed to load the waitlist')
      setTableState('error')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  // DERIVED FROM `entries`, WHICH IS [] BEFORE THE REQUEST LANDS AND [] AFTER
  // IT FAILS — so a bare `entries.length` states "0 signups" in both. Null in
  // any state where the number was not actually read.
  const stats = useMemo(() => {
    if (tableState === 'loading' || tableState === 'error') return null
    const total = entries.length
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = entries.filter(e => new Date(e.created_at).getTime() >= weekAgo).length
    return { total, thisWeek }
  }, [entries, tableState])

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
        <StatsCard title="Waitlist Signups" value={stats ? stats.total : null} />
        <StatsCard title="Free Spots Claimed" value={freeSpotsClaimed} />
        <StatsCard title="Spots Remaining" value={spotsRemaining} color={(spotsRemaining ?? 0) > 0 ? '#16a34a' : '#dc2626'} />
      </div>

      <AdminTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name, company or email..."
        loading={loading}
        /* The count is about the FILTERED view when nothing matched — the
           table needs the unfiltered total to say "0 of 34", so pass the
           whole-list length in that one state. */
        totalCount={tableState === 'error' ? null : (search && filtered.length === 0 ? entries.length : filtered.length)}
        status={tableState === 'ok' && filtered.length === 0 ? 'empty' : tableState}
        query={search}
        filtersActive={search ? 1 : 0}
        onClearSearch={() => setSearch('')}
        onRetry={fetchData}
        errorMessage={loadError || undefined}
        entityName="waitlist entries"
        emptyTitle="Nobody on the waitlist."
        emptyBody="Sign-ups appear here when the founding seats run out."
        page={1}
        totalPages={1}
        onPageChange={() => {}}
        onExportCSV={() => exportToCSV(entries, columns, 'waitlist')}
      />
    </div>
  )
}
