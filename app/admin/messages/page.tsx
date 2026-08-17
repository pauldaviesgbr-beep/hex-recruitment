'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column } from '@/components/admin/AdminTable'
import DetailPanel, { DetailSection } from '@/components/admin/DetailPanel'
import StatsStrip from '@/components/admin/StatsStrip'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
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
  const [totalCount, setTotalCount] = useState<number | null>(0)
  const [search, setSearch] = useState('')
  // A NUMBER IS A CLAIM — see components/admin/AdminTable.tsx.
  const [tableState, setTableState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
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
    setTableState('loading')
    setLoadError('')
    const params = new URLSearchParams({
      page: String(page),
      search,
      sort: sortField,
      dir: sortDir,
    })
    try {
      const res = await fetch(`/api/admin/messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      // CHECK THE STATUS — a 403 returns valid JSON and `|| []` would turn the
      // refusal into a confident zero.
      if (!res.ok) throw new Error(data.error || 'Failed to load conversations')
      setConversations(data.conversations || [])
      setTotalPages(data.totalPages || 1)
      setTotalCount(typeof data.total === 'number' ? data.total : null)
      if (data.stats) setStats(data.stats)
      setTableState((data.conversations || []).length === 0 ? 'empty' : 'ok')
    } catch (e: any) {
      setConversations([])
      setTotalCount(null)
      setStats(null)
      setLoadError(e.message || 'Failed to load conversations')
      setTableState('error')
    } finally {
      setLoading(false)
    }
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
      <AdminPageHeader title="Messages" />

      <StatsStrip
        tableStatus={tableState}
        stats={[
          { label: 'Conversations', value: stats ? stats.totalConversations : null },
          { label: 'Messages Sent', value: stats ? stats.totalMessages : null },
        ]}
      />

      <AdminTable
        columns={columns}
        data={conversations}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        status={tableState}
        query={search}
        filtersActive={search ? 1 : 0}
        onClearSearch={() => { setSearch(''); setPage(1) }}
        onRetry={fetchData}
        errorMessage={loadError || undefined}
        entityName="conversations"
        /* The product /messages empty state is design's named reference for
           this voice: name the cause, don't apologise. */
        emptyTitle="No conversations yet."
        emptyBody="A conversation starts here when someone applies for a role or puts themselves forward for a shift."
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
