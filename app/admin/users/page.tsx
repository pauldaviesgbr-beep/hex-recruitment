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
  /** Employers only. null = no employer row at all, which is not 'pending'. */
  approval_status?: string | null
  contact_name?: string
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
  banned?: boolean
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
  // Rejected accounts are hidden by default but reachable, or a rejection
  // could never be undone.
  const [approval, setApproval] = useState('active')
  const [rejectedHidden, setRejectedHidden] = useState(0)
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx. Four states,
  // explicit, so "loading", "no matches", "empty" and "the request failed" can
  // never again render as the same "0 results".
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
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
      approval,
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
      setRejectedHidden(typeof data.rejectedHidden === 'number' ? data.rejectedHidden : 0)
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
  }, [token, page, search, role, approval, sortField, sortDir])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    setPage(1)
  }, [search, role, approval])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleAction = async (action: string, userId: string) => {
    if (action === 'suspend' && !confirm('Ban this user? They will be unable to sign in. You can undo this.')) return
    if (action === 'unsuspend' && !confirm('Lift the ban and let this user sign in again?')) return

    setActionLoading(userId)
    setActionError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, userId }),
      })
      const data = await res.json().catch(() => ({}))
      // THE LINE THAT WAS MISSING. Without it a 403, a 500 or an unknown
      // action all returned quietly, the list refetched, and the row came back
      // looking exactly as it had — so a ban that never happened was
      // indistinguishable from one that did.
      if (!res.ok) throw new Error(data.error || `Action failed (${res.status})`)
    } catch (e: any) {
      setActionError(e.message || 'That action failed. Nothing was changed.')
    } finally {
      setActionLoading(null)
      fetchUsers()
    }
  }

  const handleBulkAction = async (action: string) => {
    if (selectedIds.length === 0) return
    // Ban is the only bulk action now, so the label is not a ternary over a
    // branch that can no longer be reached.
    if (!confirm(`Ban ${selectedIds.length} selected user(s)? They will be unable to sign in. You can undo this per user.`)) return

    setActionLoading('bulk')
    setActionError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, userIds: selectedIds }),
      })
      const data = await res.json().catch(() => ({}))
      // Same missing check as the single-row handler had.
      if (!res.ok) throw new Error(data.error || `Bulk action failed (${res.status})`)
      setSelectedIds([])
    } catch (e: any) {
      setActionError(e.message || 'That action failed. Nothing was changed.')
    } finally {
      setActionLoading(null)
      fetchUsers()
    }
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
          {/* The contact name was in the data and never rendered, so two
              employers who entered no company name both read "My Company" —
              the freemail fallback — and the row identified nobody. */}
          {row.contact_name && <span className={styles.userSub}>{row.contact_name}</span>}
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
      // THE COLUMN THAT MAKES THE ACTIONS MEAN ANYTHING. Ban wrote to the
      // database and the page rendered nothing, so the only way to tell a ban
      // had worked was to go and look in the database. Two independent facts
      // live here and neither implies the other: whether they can SIGN IN, and
      // whether an employer has been APPROVED.
      key: 'status',
      label: 'Status',
      render: (val: string, row: User) => (
        <div className={styles.statusCell}>
          {val === 'suspended'
            ? <span className={`${styles.badge} ${styles.badgeBanned}`}>banned</span>
            : <span className={styles.statusOk}>active</span>}
          {row.role === 'employer' && (
            row.approval_status === 'rejected'
              ? <span className={`${styles.badge} ${styles.badgeRejected}`}>rejected</span>
              : row.approval_status === 'pending'
              ? <span className={`${styles.badge} ${styles.badgePending}`}>pending</span>
              : row.approval_status === 'waitlisted'
              ? <span className={`${styles.badge} ${styles.badgePending}`}>waitlisted</span>
              : row.approval_status === 'approved'
              ? <span className={styles.statusMuted}>approved</span>
              // null is not pending — it means no employer row exists at all,
              // and saying "pending" here would invent a state.
              : <span className={styles.statusMuted}>no employer row</span>
          )}
        </div>
      ),
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
        /* IF THE LIST IS HOLDING ROWS BACK, IT SAYS SO. A count that silently
           excludes two accounts is a number with no claim behind it — and the
           whole reason this page was confusing was that it showed a state it
           did not mention. */
        subtitle={
          totalCount === null
            ? 'Candidates and employers — includes the two test fixtures'
            : `${totalCount.toLocaleString()} accounts — candidates and employers, includes the two test fixtures` +
              (rejectedHidden > 0
                ? ` · ${rejectedHidden} rejected hidden`
                : '')
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

      {/* A FAILED ACTION HAS TO SAY SO. Checking res.ok is only half of it —
          without somewhere to render the failure the check would be silent,
          and silent is exactly the state this replaces. */}
      {actionError && (
        <div className={styles.actionError} role="alert">
          {actionError}
          <button type="button" className={styles.actionErrorClose} onClick={() => setActionError('')}>
            Dismiss
          </button>
        </div>
      )}

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
          <>
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
            {/* Rejected accounts are HIDDEN, not gone — they still exist and
                can still sign in. Reachable in one click, because a rejection
                you cannot find is a rejection you cannot undo. */}
            <select
              className={styles.select}
              value={approval}
              onChange={(e) => setApproval(e.target.value)}
              aria-label="Filter by approval"
            >
              <option value="active">Hiding rejected</option>
              <option value="rejected">Rejected only</option>
              <option value="all">Including rejected</option>
            </select>
          </>
        }
        /* BULK DELETE IS GONE FOR THE SAME REASON AS THE ROW ONE, and it was
           the more dangerous of the two: the same orphaning, multiplied by
           however many boxes were ticked, reached in one click. The divider
           that used to separate it goes with it — there is nothing
           irreversible left in this row to separate. */
        headerActions={
          <button
            className={styles.bulkBtn}
            onClick={() => handleBulkAction('bulk_suspend')}
            disabled={actionLoading === 'bulk'}
          >
            Ban selected
          </button>
        }
        /* DELETE IS GONE FROM HERE, DELIBERATELY.
           `deleteUser` removes exactly one row — the auth user — and there is
           NOT A SINGLE foreign key from public to auth.users, so it orphans
           everything: 43 user-id columns across 40 tables, including the
           profile, the CV, applications, messages and interviews. And because
           this list is built FROM auth.users, the orphans become invisible the
           moment they are created — you would never see what you had left.
           Real erasure is an enumerated, ordered cascade with counts before
           and after, which is a script, not a button beside Ban.
           Ban does the job this was reached for, and undoes. */
        actions={(row) => (
          row.status === 'suspended' ? (
            <button
              className={styles.actionBtn}
              onClick={() => handleAction('unsuspend', row.id)}
              disabled={actionLoading === row.id}
            >
              Unban
            </button>
          ) : (
            <button
              className={`${styles.actionBtn} ${styles.dangerBtn}`}
              onClick={() => handleAction('suspend', row.id)}
              disabled={actionLoading === row.id}
            >
              Ban
            </button>
          )
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

            {/* ONE LABEL PER ACTION, and one word across the whole page:
                "Ban". The row said Ban, the toolbar said Suspend and this said
                "Suspend User" — three names for one thing, which is how an
                operator ends up unsure whether they are the same action. They
                all call the same endpoint.
                Delete is gone from here too; see the table actions above. */}
            <div className={styles.detailActions}>
              {detailUser.banned ? (
                <button
                  className={styles.actionBtn}
                  onClick={() => handleAction('unsuspend', detailUser.user_id)}
                >
                  Unban
                </button>
              ) : (
                <button
                  className={`${styles.actionBtn} ${styles.dangerBtn}`}
                  onClick={() => handleAction('suspend', detailUser.user_id)}
                >
                  Ban
                </button>
              )}
            </div>
          </>
        ) : (
          <div className={styles.detailLoading}>User not found</div>
        )}
      </DetailPanel>
    </div>
  )
}
