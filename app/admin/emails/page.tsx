'use client'

import { useState, useEffect } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column } from '@/components/admin/AdminTable'
import StatsCard from '@/components/admin/StatsCard'
import styles from './page.module.css'

interface Email {
  id: string
  to: string
  subject: string
  created_at: string
  last_event: string
}

export default function AdminEmailsPage() {
  const token = useAdminToken()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch('/api/admin/emails', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setEmails(data.emails || [])
        if (data.error) setError(data.error)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load email logs')
        setLoading(false)
      })
  }, [token])

  const delivered = emails.filter(e => e.last_event === 'delivered').length
  const opened = emails.filter(e => e.last_event === 'opened').length
  const bounced = emails.filter(e => e.last_event === 'bounced').length

  const columns: Column<Email>[] = [
    { key: 'to', label: 'Recipient' },
    { key: 'subject', label: 'Subject' },
    {
      key: 'last_event', label: 'Status',
      render: (val: string) => (
        <span className={`${styles.badge} ${styles[`badge_${val}`] || ''}`}>{val}</span>
      ),
    },
    {
      key: 'created_at', label: 'Sent',
      render: (val: string) => val ? new Date(val).toLocaleString('en-GB') : '—',
    },
  ]

  return (
    <div>
      <h1 className={styles.pageTitle}>Email Logs</h1>

      <div className={styles.statsGrid}>
        <StatsCard title="Total Sent" value={emails.length} icon="📧" />
        <StatsCard title="Delivered" value={delivered} icon="✅" color="#16a34a" />
        <StatsCard title="Opened" value={opened} icon="👁️" color="#3b82f6" />
        <StatsCard title="Bounced" value={bounced} icon="⚠️" color="#dc2626" />
      </div>

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      <AdminTable
        columns={columns}
        data={emails}
        page={1}
        totalPages={1}
        onPageChange={() => {}}
        loading={loading}
      />
    </div>
  )
}
