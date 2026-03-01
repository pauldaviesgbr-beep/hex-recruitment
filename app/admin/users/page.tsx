'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column, exportToCSV } from '@/components/admin/AdminTable'
import DetailPanel, { DetailRow, DetailSection, DetailBadge } from '@/components/admin/DetailPanel'
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
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
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
    const params = new URLSearchParams({
      page: String(page),
      search,
      role,
      sort: sortField,
      dir: sortDir,
    })
    const res = await fetch(`/api/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setUsers(data.users || [])
    setTotalPages(data.totalPages || 1)
    setTotalCount(data.total || 0)
    setLoading(false)
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
    { key: 'email', label: 'Email', sortable: true },
    {
      key: 'role',
      label: 'Role',
      render: (val: string) => (
        <span className={`${styles.badge} ${val === 'employer' ? styles.badgeEmployer : styles.badgeCandidate}`}>
          {val}
        </span>
      ),
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
      <h1 className={styles.pageTitle}>User Management</h1>

      <div className={styles.filters}>
        <select
          className={styles.select}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="employer">Employers</option>
          <option value="candidate">Candidates</option>
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={users}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name or email..."
        loading={loading}
        totalCount={totalCount}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={openDetail}
        onExportCSV={() => exportToCSV(users, columns, 'admin-users')}
        headerActions={
          <>
            <button
              className={styles.bulkBtn}
              onClick={() => handleBulkAction('bulk_suspend')}
              disabled={actionLoading === 'bulk'}
            >
              Suspend
            </button>
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
                    <DetailRow label="CV" value={<a href={detailUser.cv_url} target="_blank" rel="noopener noreferrer">View CV</a>} />
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
              <DetailRow label="Joined" value={detailUser.created_at ? new Date(detailUser.created_at).toLocaleDateString('en-GB') : '—'} />
            </DetailSection>

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

            <div className={styles.detailActions}>
              <button
                className={styles.actionBtn}
                onClick={() => handleAction('suspend', detailUser.user_id)}
              >
                Suspend User
              </button>
              <button
                className={`${styles.actionBtn} ${styles.dangerBtn}`}
                onClick={() => handleAction('delete', detailUser.user_id)}
              >
                Delete User
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
