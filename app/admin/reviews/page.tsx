'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import DetailPanel, { DetailRow, DetailSection } from '@/components/admin/DetailPanel'
import StatsCard from '@/components/admin/StatsCard'
import styles from './page.module.css'

interface Review {
  id: string
  reviewer_id: string
  reviewer_name: string
  company_name: string
  overall_rating: number
  review_title: string
  pros: string
  cons: string
  is_flagged: boolean
  is_verified: boolean
  created_at: string
}

export default function AdminReviewsPage() {
  const token = useAdminToken()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState<number | null>(0)
  const [search, setSearch] = useState('')
  const [flagged, setFlagged] = useState('')
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx.
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [stats, setStats] = useState<{ total: number; flagged: number; avgRating: number } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailReview, setDetailReview] = useState<Review | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setTableState('loading')
    setLoadError('')
    const params = new URLSearchParams({
      page: String(page),
      search,
      flagged,
      sort: sortField,
      dir: sortDir,
    })
    try {
      const res = await fetch(`/api/admin/reviews?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS — a 403 returns valid JSON and `|| []` would turn the
      // refusal into a confident zero. "Flagged 0" is the dangerous one here:
      // it reads as "nothing needs moderating".
      if (!res.ok) throw new Error(data.error || 'Failed to load reviews')
      setReviews(data.reviews || [])
      setTotalPages(data.totalPages || 1)
      setTotalCount(typeof data.total === 'number' ? data.total : null)
      if (data.stats) setStats(data.stats)
      setTableState((data.reviews || []).length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setReviews([])
      setTotalCount(null)
      setStats(null)
      setLoadError(e.message || 'Failed to load reviews')
      setTableState('error')
    } finally {
      setLoading(false)
    }
  }, [token, page, search, flagged, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search, flagged])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleAction = async (action: string, reviewId: string) => {
    if (action === 'remove' && !confirm('Permanently remove this review?')) return
    setActionLoading(reviewId)
    await fetch('/api/admin/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, reviewId }),
    })
    setActionLoading(null)
    fetchData()
  }

  const columns: Column<Review>[] = [
    { key: 'company_name', label: 'Company', sortable: true },
    { key: 'reviewer_name', label: 'Reviewer' },
    { key: 'review_title', label: 'Title' },
    {
      key: 'overall_rating', label: 'Rating', sortable: true,
      render: (val: number) => <span className={styles.rating}>{'★'.repeat(val || 0)}{'☆'.repeat(5 - (val || 0))}</span>,
    },
    {
      key: 'is_flagged', label: 'Status',
      render: (val: boolean) => (
        <span className={`${styles.badge} ${val ? styles.badgeFlagged : styles.badgeOk}`}>
          {val ? 'Flagged' : 'OK'}
        </span>
      ),
    },
    {
      key: 'created_at', label: 'Date', sortable: true,
      render: (val: string) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
  ]

  return (
    <div>
      <h1 className={styles.pageTitle}>Reviews</h1>

      <div className={styles.statsGrid}>
        <StatsCard title="Total Reviews" value={stats ? stats.total : null} />
        <StatsCard title="Flagged" value={stats ? stats.flagged : null} />
        <StatsCard title="Avg Rating" value={stats ? stats.avgRating.toFixed(1) : null} />
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={flagged} onChange={(e) => setFlagged(e.target.value)}>
          <option value="">All Reviews</option>
          <option value="true">Flagged Only</option>
          <option value="false">Not Flagged</option>
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={reviews}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        status={tableState}
        query={search}
        filtersActive={(search ? 1 : 0) + (flagged ? 1 : 0)}
        filterSummary={flagged ? `Flagged: ${flagged === 'true' ? 'Flagged only' : 'Not flagged'}` : undefined}
        onClearSearch={() => { setSearch(''); setFlagged(''); setPage(1) }}
        onRetry={fetchData}
        errorMessage={loadError || undefined}
        entityName="reviews"
        emptyTitle="No reviews yet."
        /* The literal character, not `&rsquo;` — a prop is a string, not
           markup, and the entity leak on /post-job is what that mistake
           looks like when it reaches a page. */
        emptyBody="They’ll appear here once candidates start leaving them."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by company or review title..."
        loading={loading}
        totalCount={totalCount}
        onRowClick={(row) => { setDetailReview(row); setDetailOpen(true) }}
        onExportCSV={() => exportToCSV(reviews, columns, 'admin-reviews')}
        actions={(row) => (
          <>
            {row.is_flagged ? (
              <button className={styles.actionBtn} onClick={() => handleAction('dismiss', row.id)} disabled={actionLoading === row.id}>Dismiss</button>
            ) : (
              <button className={styles.actionBtn} onClick={() => handleAction('flag', row.id)} disabled={actionLoading === row.id}>Flag</button>
            )}
            <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => handleAction('remove', row.id)} disabled={actionLoading === row.id}>Remove</button>
          </>
        )}
      />

      <DetailPanel
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailReview(null) }}
        title={detailReview?.review_title || 'Review'}
        subtitle={detailReview?.company_name}
      >
        {detailReview && (
          <>
            <DetailSection title="Review Details">
              <DetailRow label="Company" value={detailReview.company_name} />
              <DetailRow label="Reviewer" value={detailReview.reviewer_name} />
              <DetailRow label="Rating" value={<span className={styles.rating}>{'★'.repeat(detailReview.overall_rating || 0)}{'☆'.repeat(5 - (detailReview.overall_rating || 0))}</span>} />
              <DetailRow label="Flagged" value={detailReview.is_flagged ? 'Yes' : 'No'} />
              <DetailRow label="Verified" value={detailReview.is_verified ? 'Yes' : 'No'} />
              <DetailRow label="Date" value={detailReview.created_at ? new Date(detailReview.created_at).toLocaleDateString('en-GB') : '—'} />
            </DetailSection>
            {detailReview.pros && (
              <DetailSection title="Pros">
                <p className={styles.reviewText}>{detailReview.pros}</p>
              </DetailSection>
            )}
            {detailReview.cons && (
              <DetailSection title="Cons">
                <p className={styles.reviewText}>{detailReview.cons}</p>
              </DetailSection>
            )}
            <div className={styles.detailActions}>
              {detailReview.is_flagged ? (
                <button className={styles.actionBtn} onClick={() => handleAction('dismiss', detailReview.id)}>Dismiss Flag</button>
              ) : (
                <button className={styles.actionBtn} onClick={() => handleAction('flag', detailReview.id)}>Flag Review</button>
              )}
              <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => handleAction('remove', detailReview.id)}>Remove Review</button>
            </div>
          </>
        )}
      </DetailPanel>
    </div>
  )
}
