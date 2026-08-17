'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import DetailPanel, { DetailRow, DetailSection, DetailBadge } from '@/components/admin/DetailPanel'
import SignedLink from '@/components/SignedLink'
import type { Completeness } from '@/lib/profileCompleteness'
import { completenessSummary, sortByGapThenWeight } from '@/lib/profileCompleteness'
import { Ico } from '@/components/icons'
import styles from './page.module.css'

interface User {
  id: string
  name: string
  email: string
  role: 'employer' | 'candidate'
  joined: string
  location: string
  phone: string
  tier: string | null
  sub_status?: string
  status: string
  job_title?: string
  industry?: string
  completeness: number
  has_cv: boolean
  has_photo: boolean
  activity_count: number
  signup_source: string
}

interface UserDetail {
  user_id: string
  email: string
  role: string
  full_name?: string
  company_name?: string
  phone?: string
  location?: string
  job_title?: string
  skills?: string[]
  cv_url?: string
  industry?: string
  logo_url?: string
  description?: string
  website?: string
  created_at: string
  application_count?: number
  message_count?: number
  job_count?: number
  review_count?: number
  signup_source?: string
  completeness?: Completeness
  subscription?: {
    subscription_tier: string
    subscription_status: string
    trial_ends_at: string | null
    cancel_at: string | null
  }
}

export default function AdminUsersPage() {
  const token = useAdminToken()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState<number | null>(0)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx. Four states,
  // explicit, so "loading", "no matches", "empty" and "the request failed" can
  // never again render as the same "0 results".
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setTableState('loading')
    setLoadError('')
    const params = new URLSearchParams({
      page: String(page),
      search,
      role,
      sort: sortField,
      dir: sortDir,
    })
    try {
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS. A 403 returns perfectly valid JSON, so a bare
      // try/catch never fires and `data.users || []` turns a refusal into a
      // confident zero.
      if (!res.ok) throw new Error(data.error || 'Failed to load users')
      setUsers(data.users || [])
      setTotalPages(data.totalPages || 1)
      // Nullable, never `|| 0`.
      setTotalCount(typeof data.total === 'number' ? data.total : null)
      setTableState((data.users || []).length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setUsers([])
      setTotalCount(null)
      setLoadError(e.message || 'Failed to load users')
      setTableState('error')
    } finally {
      // ALWAYS — a setLoading(false) that is the last line of a function that
      // threw is how a page sits on skeleton rows forever.
      setLoading(false)
    }
  }, [token, page, search, role, sortField, sortDir])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    setPage(1)
  }, [search, role])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleAction = async (action: string, userId: string) => {
    if (action === 'delete' && !confirm('Are you sure you want to permanently delete this user?')) return
    if (action === 'suspend' && !confirm('Suspend this user?')) return

    setActionLoading(userId)
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, userId }),
    })
    setActionLoading(null)
    fetchUsers()
  }

  const handleBulkAction = async (action: string) => {
    if (selectedIds.length === 0) return
    const label = action === 'bulk_suspend' ? 'suspend' : 'delete'
    if (!confirm(`${label} ${selectedIds.length} selected user(s)?`)) return

    setActionLoading('bulk')
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, userIds: selectedIds }),
    })
    setActionLoading(null)
    setSelectedIds([])
    fetchUsers()
  }

  const openDetail = async (row: User) => {
    setDetailOpen(true)
    setDetailLoading(true)
    const res = await fetch(`/api/admin/users?userId=${row.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setDetailUser(data.user || null)
    setDetailLoading(false)
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (val: string, row: User) => (
        <div>
          <span className={styles.userName}>{val}</span>
          {row.job_title && <span className={styles.userSub}>{row.job_title}</span>}
          {row.industry && <span className={styles.userSub}>{row.industry}</span>}
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Contact',
      sortable: true,
      render: (val: string, row: User) => (
        <div>
          <span className={styles.contactEmail}>{val}</span>
          {row.phone
            ? <span className={styles.userSub}>{row.phone}</span>
            : <span className={styles.contactMuted}>no phone</span>}
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (val: string) => (
        <span className={`${styles.badge} ${val === 'employer' ? styles.badgeEmployer : styles.badgeCandidate}`}>
          {val}
        </span>
      ),
    },
    {
      key: 'completeness',
      label: 'Profile',
      sortable: true,
      render: (val: number, row: User) => {
        const pct = val || 0
        const tone = pct >= 70 ? styles.barStrong : pct >= 40 ? styles.barMid : styles.barLow
        return (
          <div className={styles.profileCell}>
            <div className={styles.barRow}>
              <div className={styles.barTrack}>
                <div className={`${styles.barFill} ${tone}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.barPct}>{pct}%</span>
            </div>
            {row.role === 'candidate' && (
              /* Same two glyphs as the drawer, in the table. Icons here too,
                 or the estate keeps a ✓/✗ in the one place a reader sees
                 first — and #16a34a is the retired green. */
              <div className={styles.flags}>
                <span className={row.has_cv ? styles.flagOn : styles.flagOff}>
                  <Ico name={row.has_cv ? 'check' : 'x'} size={16} /> CV
                </span>
                <span className={row.has_photo ? styles.flagOn : styles.flagOff}>
                  <Ico name={row.has_photo ? 'check' : 'x'} size={16} /> Photo
                </span>
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'activity_count',
      label: 'Apps',
      sortable: true,
      render: (val: number, row: User) => (
        <span title={row.role === 'employer' ? 'Jobs posted' : 'Applications'}>
          {val || 0}{row.role === 'employer' ? ' jobs' : ''}
        </span>
      ),
    },
    {
      key: 'signup_source',
      label: 'Source',
      render: (val: string) => <span className={styles.sourceBadge}>{val || 'Email'}</span>,
    },
    { key: 'location', label: 'Location' },
    {
      key: 'joined',
      label: 'Joined',
      sortable: true,
      render: (val: string) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
    {
      key: 'tier',
      label: 'Tier',
      render: (val: string | null, row: User) =>
        row.role === 'employer' ? (
          <span className={`${styles.badge} ${val === 'professional' ? styles.badgePro : val === 'standard' ? styles.badgeStandard : styles.badgeNone}`}>
            {val || 'none'}
          </span>
        ) : '—',
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="User Management"
        /* "Users" means two populations and nothing said which. The design
           handoff writes this as "70 accounts — includes the two test
           fixtures"; the number is taken from the SAME state the toolbar
           count renders from rather than typed in, because a hard-coded 70
           is a claim that goes stale the next time anyone signs up, and two
           numbers in two places that must agree is the fault I spent
           yesterday on. */
        subtitle={
          totalCount === null
            ? 'Candidates and employers — includes the two test fixtures'
            : `${totalCount.toLocaleString()} accounts — candidates and employers, includes the two test fixtures`
        }
        action={
          <button className={styles.exportAction} onClick={() => exportToCSV(users, columns, 'admin-users')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        }
      />

      <AdminTable
        columns={columns}
        data={users}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        status={tableState}
        query={search}
        filtersActive={(search ? 1 : 0) + (role !== 'all' ? 1 : 0)}
        filterSummary={role !== 'all' ? `Role: ${role === 'employer' ? 'Employers' : 'Candidates'}` : undefined}
        onClearSearch={() => { setSearch(''); setRole('all'); setPage(1) }}
        onRetry={fetchUsers}
        errorMessage={loadError || undefined}
        entityName="users"
        emptyTitle="No users yet."
        emptyBody="Accounts appear here as employers and candidates register."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name or email..."
        loading={loading}
        totalCount={totalCount}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={openDetail}
        /* Export has moved to the page frame above; passing it here too would
           put the same control on the page twice. */
        filters={
          <select
            className={styles.select}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Filter by role"
          >
            <option value="all">All Roles</option>
            <option value="employer">Employers</option>
            <option value="candidate">Candidates</option>
          </select>
        }
        headerActions={
          <>
            <button
              className={styles.bulkBtn}
              onClick={() => handleBulkAction('bulk_suspend')}
              disabled={actionLoading === 'bulk'}
            >
              Suspend
            </button>
            {/* The rule. Delete is irreversible, on a real person's account,
                reached by ticking boxes — it does not sit flush against
                Suspend. */}
            <span className={styles.destructiveDivider} aria-hidden="true" />
            <button
              className={`${styles.bulkBtn} ${styles.dangerBtn}`}
              onClick={() => handleBulkAction('bulk_delete')}
              disabled={actionLoading === 'bulk'}
            >
              Delete
            </button>
          </>
        }
        actions={(row) => (
          <>
            <button
              className={styles.actionBtn}
              onClick={() => handleAction('suspend', row.id)}
              disabled={actionLoading === row.id}
            >
              Ban
            </button>
            <button
              className={`${styles.actionBtn} ${styles.dangerBtn}`}
              onClick={() => handleAction('delete', row.id)}
              disabled={actionLoading === row.id}
            >
              Delete
            </button>
          </>
        )}
      />

      <DetailPanel
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailUser(null) }}
        title={detailUser ? (detailUser.full_name || detailUser.company_name || 'User') : 'Loading...'}
        subtitle={detailUser?.email}
      >
        {detailLoading ? (
          <div className={styles.detailLoading}>Loading user details...</div>
        ) : detailUser ? (
          <>
            <DetailSection title="Profile">
              <DetailRow label="Role" value={
                <DetailBadge color={detailUser.role === 'employer' ? '#dbeafe' : '#fef3c7'}>
                  {detailUser.role}
                </DetailBadge>
              } />
              <DetailRow label="Email" value={detailUser.email} />
              <DetailRow label="Phone" value={detailUser.phone} />
              <DetailRow label="Location" value={detailUser.location} />
              {detailUser.role === 'candidate' && (
                <>
                  <DetailRow label="Job Title" value={detailUser.job_title} />
                  <DetailRow label="Skills" value={detailUser.skills?.join(', ')} />
                  {detailUser.cv_url && (
                    <DetailRow label="CV" value={<SignedLink src={detailUser.cv_url}>View CV</SignedLink>} />
                  )}
                </>
              )}
              {detailUser.role === 'employer' && (
                <>
                  <DetailRow label="Industry" value={(detailUser as any).industry} />
                  <DetailRow label="Website" value={detailUser.website} />
                  <DetailRow label="Description" value={detailUser.description} />
                </>
              )}
              <DetailRow label="Signup source" value={detailUser.signup_source} />
              <DetailRow label="Joined" value={detailUser.created_at ? new Date(detailUser.created_at).toLocaleDateString('en-GB') : '—'} />
            </DetailSection>

            {detailUser.completeness && (
              <DetailSection title={`Profile completeness — ${detailUser.completeness.percent}%`}>
                <div className={styles.detailBarTrack}>
                  <div
                    className={`${styles.barFill} ${detailUser.completeness.percent >= 70 ? styles.barStrong : detailUser.completeness.percent >= 40 ? styles.barMid : styles.barLow}`}
                    style={{ width: `${detailUser.completeness.percent}%` }}
                  />
                </div>
                {/* WHAT IS MISSING, AND WHICH GAPS THE MATCHER ACTUALLY
                    WEIGHTS — derived from the scorer's own per-component
                    maxima, not from a fixed sentence. See matchWeight in
                    lib/profileCompleteness.ts for why the handoff's
                    "CV and work history" is half wrong. */}
                {completenessSummary(detailUser.completeness.signals) && (
                  <p className={styles.checklistLede}>
                    {completenessSummary(detailUser.completeness.signals)}
                  </p>
                )}
                <div className={styles.checklist}>
                  {/* MISSING FIRST, AND MISSING IS THE DARK ONE. The reader is
                      scanning for gaps; the old panel greyed the gaps out and
                      gave full ink to the one thing already done. */}
                  {sortByGapThenWeight(detailUser.completeness.signals).map(s => (
                    <div key={s.key} className={s.filled ? styles.checkOn : styles.checkOff}>
                      {/* Lucide geometry at 16px, stroke 2.4 — the last place
                          in the estate still using ✓/✗ glyphs. NEITHER STATE
                          IS ALERT-COLOURED: an unfilled field is a thing not
                          yet done, not an error, and with most profiles part
                          empty a wall of red says the product is broken
                          rather than young. */}
                      <Ico name={s.filled ? 'check' : 'x'} size={16} strokeWidth={2.4} className={styles.checkMark} />
                      <span>{s.label}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {detailUser.role === 'employer' && detailUser.subscription && (
              <DetailSection title="Subscription">
                <DetailRow label="Tier" value={
                  <DetailBadge color={detailUser.subscription.subscription_tier === 'professional' ? '#FFE500' : '#e2e8f0'}>
                    {detailUser.subscription.subscription_tier || 'none'}
                  </DetailBadge>
                } />
                <DetailRow label="Status" value={detailUser.subscription.subscription_status} />
                <DetailRow label="Trial Ends" value={detailUser.subscription.trial_ends_at ? new Date(detailUser.subscription.trial_ends_at).toLocaleDateString('en-GB') : '—'} />
              </DetailSection>
            )}

            <DetailSection title="Activity">
              {detailUser.role === 'candidate' && (
                <DetailRow label="Applications" value={detailUser.application_count} />
              )}
              {detailUser.role === 'employer' && (
                <>
                  <DetailRow label="Jobs Posted" value={detailUser.job_count} />
                  <DetailRow label="Reviews" value={detailUser.review_count} />
                </>
              )}
              <DetailRow label="Messages Sent" value={detailUser.message_count} />
            </DetailSection>

            {/* ONE LABEL PER ACTION. The toolbar says "Suspend"; this said
                "Suspend User". The drawer is headed with the person's name,
                so the noun is redundant — and two names for one action is
                how an operator ends up unsure whether they are the same
                thing. Delete goes to the far right behind the same rule the
                toolbar uses. */}
            <div className={styles.detailActions}>
              <button
                className={styles.actionBtn}
                onClick={() => handleAction('suspend', detailUser.user_id)}
              >
                Suspend
              </button>
              <span className={styles.detailActionsSpacer} />
              <span className={styles.destructiveDivider} aria-hidden="true" />
              <button
                className={`${styles.actionBtn} ${styles.dangerBtn}`}
                onClick={() => handleAction('delete', detailUser.user_id)}
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className={styles.detailLoading}>User not found</div>
        )}
      </DetailPanel>
    </div>
  )
}
