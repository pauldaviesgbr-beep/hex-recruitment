'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column } from '@/components/admin/AdminTable'
import DetailPanel, { DetailSection } from '@/components/admin/DetailPanel'
import StatsCard from '@/components/admin/StatsCard'
import styles from './page.module.css'

interface Conversation {
  id: string
  participant_1: string
  participant_2: string
  participant_1_name: string
  participant_2_name: string
  related_job_id: string
  last_message: string
  last_message_at: string
}

interface Message {
  id: string
  sender_id: string
  sender_name: string
  content: string
  is_read: boolean
  created_at: string
}

export default function AdminMessagesPage() {
  const token = useAdminToken()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('last_message_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [stats, setStats] = useState<{ totalConversations: number; totalMessages: number } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailMessages, setDetailMessages] = useState<Message[]>([])
  const [detailConvo, setDetailConvo] = useState<Conversation | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      search,
      sort: sortField,
      dir: sortDir,
    })
    const res = await fetch(`/api/admin/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setConversations(data.conversations || [])
    setTotalPages(data.totalPages || 1)
    setTotalCount(data.total || 0)
    if (data.stats) setStats(data.stats)
    setLoading(false)
  }, [token, page, search, sortField, sortDir])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [search])

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const openDetail = async (row: Conversation) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailConvo(row)
    const res = await fetch(`/api/admin/messages?conversationId=${row.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setDetailMessages(data.messages || [])
    setDetailLoading(false)
  }

  const columns: Column<Conversation>[] = [
    {
      key: 'participant_1_name', label: 'Participants', sortable: true,
      render: (_: string, row: Conversation) => (
        <div>
          <span className={styles.participantName}>{row.participant_1_name || 'Unknown'}</span>
          <span className={styles.participantSep}> ↔ </span>
          <span className={styles.participantName}>{row.participant_2_name || 'Unknown'}</span>
        </div>
      ),
    },
    {
      key: 'last_message', label: 'Last Message',
      render: (val: string) => (
        <span className={styles.messagePreview}>{val ? (val.length > 60 ? val.slice(0, 60) + '...' : val) : '—'}</span>
      ),
    },
    {
      key: 'last_message_at', label: 'Last Active', sortable: true,
      render: (val: string) => val ? new Date(val).toLocaleDateString('en-GB') : '—',
    },
  ]

  return (
    <div>
      <h1 className={styles.pageTitle}>Messages</h1>

      {stats && (
        <div className={styles.statsGrid}>
          <StatsCard title="Conversations" value={stats.totalConversations} icon="💬" color="#3b82f6" />
          <StatsCard title="Messages Sent" value={stats.totalMessages} icon="📨" color="#8b5cf6" />
        </div>
      )}

      <AdminTable
        columns={columns}
        data={conversations}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by participant name..."
        loading={loading}
        totalCount={totalCount}
        onRowClick={openDetail}
      />

      <DetailPanel
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailMessages([]); setDetailConvo(null) }}
        title={detailConvo ? `${detailConvo.participant_1_name} ↔ ${detailConvo.participant_2_name}` : 'Loading...'}
        subtitle="Conversation viewer"
      >
        {detailLoading ? (
          <div className={styles.detailLoading}>Loading messages...</div>
        ) : (
          <DetailSection title={`Messages (${detailMessages.length})`}>
            <div className={styles.messageList}>
              {detailMessages.map(m => (
                <div key={m.id} className={styles.messageItem}>
                  <div className={styles.messageHeader}>
                    <span className={styles.messageSender}>{m.sender_name}</span>
                    <span className={styles.messageTime}>{new Date(m.created_at).toLocaleString('en-GB')}</span>
                  </div>
                  <p className={styles.messageContent}>{m.content}</p>
                </div>
              ))}
              {detailMessages.length === 0 && (
                <div className={styles.detailLoading}>No messages in this conversation</div>
              )}
            </div>
          </DetailSection>
        )}
      </DetailPanel>
    </div>
  )
}
