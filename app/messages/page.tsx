'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import { supabase } from '@/lib/supabase'
import { chooserLoginPath } from '@/lib/loginRedirect'
import styles from './page.module.css'
import { Ico } from '@/components/icons'
import {
  formatRelativeTime,
  formatMessageTime,
  type Conversation,
  type Connection,
  type Message
} from '@/lib/mockMessages'

type TabType = 'messages' | 'requests'

// Render message text with clickable links
function renderMessageContent(text: string | null | undefined) {
  if (!text) return null
  const urlPattern = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlPattern)
  return parts.map((part, i) =>
    /^https?:\/\/[^\s]+$/.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{part}</a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export default function MessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const candidateParam = searchParams.get('candidate')

  // ── State ──────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('messages')
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [pendingRequests, setPendingRequests] = useState<Connection[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  // The page is used by both sides and had no idea which it was serving, so its
  // empty state told candidates to "connect with candidates".
  const [isEmployer, setIsEmployer] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────
  const messageListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isMounted = useRef(true)

  // ── Derived values ─────────────────────────────────────────────────────
  const totalUnreadCount = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)

  // ── Callbacks ──────────────────────────────────────────────────────────
  const loadConversations = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order('last_message_at', { ascending: false })

      if (error) {
        if (!error.message?.includes('does not exist')) {
          console.error('[MessagesPage] loadConversations error:', error.message)
        }
        return
      }

      if (!data) return

      // Batch fetch unread counts
      const conversationIds = data.map((row: any) => row.id)
      const unreadMap: Record<string, number> = {}
      if (conversationIds.length > 0) {
        const { data: unreadRows } = await supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', conversationIds)
          .neq('sender_id', userId)
          .eq('is_read', false)

        if (unreadRows) {
          for (const msg of unreadRows) {
            unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1
          }
        }
      }

      const mapped: Conversation[] = data.map((row: any) => {
        const isP1 = row.participant_1 === userId
        return {
          id: row.id,
          connectionId: row.id,
          participantId: (isP1 ? row.participant_2 : row.participant_1) || '',
          participantName: (isP1 ? row.participant_2_name : row.participant_1_name) || 'Unknown',
          participantRole: ((isP1 ? row.participant_2_role : row.participant_1_role) === 'employer'
            ? 'employer' : 'candidate') as 'employer' | 'candidate',
          participantCompany: (isP1 ? row.participant_2_company : row.participant_1_company) || undefined,
          participantProfilePicture: null,
          lastMessage: row.last_message || '',
          lastMessageAt: row.last_message_at || row.created_at || new Date().toISOString(),
          unreadCount: unreadMap[row.id] || 0,
          isOnline: false,
          participantJobTitle: row.related_job_title || undefined,
        }
      })

      if (isMounted.current) setConversations(mapped)
    } catch (err) {
      console.error('[MessagesPage] loadConversations error:', err)
    }
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) {
        if (!error.message?.includes('does not exist')) {
          console.error('Error loading messages:', error.message)
        }
        return
      }

      if (data) {
        const mapped: Message[] = data.map((row: any) => ({
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id || '',
          senderName: row.sender_name || 'User',
          senderRole: (row.sender_role === 'employer' ? 'employer' : 'candidate') as 'employer' | 'candidate',
          content: row.content || '',
          timestamp: row.created_at || new Date().toISOString(),
          isRead: row.is_read,
        }))
        if (isMounted.current) setMessages(mapped)
      }
    } catch {
      // Fail silently on network errors
    }
  }, [])

  const markConversationAsRead = useCallback(async (conversationId: string) => {
    setConversations(prev =>
      prev.map(conv => conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv)
    )
    try {
      const sessionResult = await supabase.auth.getSession()
      const session = sessionResult?.data?.session
      if (!session) return
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', session.user.id)
        .eq('is_read', false)
      // Notify the Header so its unread badge refreshes immediately instead
      // of waiting for the Postgres realtime channel to deliver the UPDATE.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('messages:read'))
      }
    } catch {
      // Ignore
    }
  }, [])

  const updateConversation = useCallback((conversationId: string, updates: Partial<Conversation>) => {
    setConversations(prev =>
      prev.map(conv => conv.id === conversationId ? { ...conv, ...updates } : conv)
    )
  }, [])

  const acceptRequest = useCallback(async (connectionId: string) => {
    try {
      await supabase
        .from('connections')
        .update({ status: 'accepted' })
        .eq('id', connectionId)
      setPendingRequests(prev => prev.filter(r => r.id !== connectionId))
    } catch {
      // Ignore
    }
  }, [])

  const declineRequest = useCallback(async (connectionId: string) => {
    try {
      await supabase
        .from('connections')
        .update({ status: 'declined' })
        .eq('id', connectionId)
      setPendingRequests(prev => prev.filter(r => r.id !== connectionId))
    } catch {
      // Ignore
    }
  }, [])

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  // Check authentication and subscription, then load data
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session

        if (!session) {
          router.push(chooserLoginPath())
          return
        }

        const userId = session.user.id
        if (isMounted.current) setCurrentUserId(userId)

        // Messaging is NOT subscription-gated — an employer must always be
        // able to reach their candidate threads regardless of subscription
        // state (active / trialing / lapsed / none). We only enforce the
        // APPROVAL gate here: a pending/rejected/waitlisted (never-approved)
        // employer doesn't belong in the app yet and is sent to the
        // under-review page. (Was previously also redirecting lapsed-sub
        // employers to /dashboard/subscription — removed.)
        setIsEmployer(session.user.user_metadata?.role === 'employer')

        if (session.user.user_metadata?.role === 'employer') {
          try {
            const { data: profile } = await supabase
              .from('employer_profiles')
              .select('approval_status')
              .eq('user_id', userId)
              .maybeSingle()
            const approvalStatus: string | null | undefined = (profile as { approval_status?: string | null } | null)?.approval_status ?? null
            if (approvalStatus === 'pending' || approvalStatus === 'rejected' || approvalStatus === 'waitlisted') {
              router.push('/account-under-review')
              return
            }
          } catch {
            // Non-fatal: messaging isn't subscription-gated, so a failed
            // approval lookup must not block access — fall through.
          }
        }

        // Load conversations directly
        await loadConversations(userId)

        if (isMounted.current) setIsLoading(false)

      } catch {
        router.push('/login')
      }
    }

    checkAuth()
  }, [router, loadConversations])

  // Scroll message list to bottom
  const scrollToBottom = useCallback(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [])

  // Auto-scroll when messages load or change — delay ensures DOM has rendered
  useEffect(() => {
    if (messages.length === 0) return
    const t = setTimeout(scrollToBottom, 50)
    return () => clearTimeout(t)
  }, [messages, scrollToBottom])

  // Auto-select conversation when ?candidate= param is present
  useEffect(() => {
    if (!candidateParam || isLoading || selectedConversation) return
    const match = conversations.find(c => c.participantId === candidateParam)
    if (match) {
      setSelectedConversation(match)
      setShowSidebar(false)
    } else {
      // No existing conversation — create a compose state
      // Fetch candidate name from Supabase
      supabase.from('candidate_profiles').select('full_name, profile_picture_url').eq('user_id', candidateParam).maybeSingle()
        .then(({ data }) => {
          setSelectedConversation({
            id: 'new',
            connectionId: '',
            participantId: candidateParam,
            participantName: data?.full_name || 'Candidate',
            participantRole: 'candidate',
            participantProfilePicture: data?.profile_picture_url || null,
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            isOnline: false,
          })
          setShowSidebar(false)
        })
    }
  }, [candidateParam, isLoading, selectedConversation, conversations])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id)
      markConversationAsRead(selectedConversation.id)
    }
  }, [selectedConversation, markConversationAsRead, loadMessages])

  // Focus input when conversation opens
  useEffect(() => {
    if (selectedConversation) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [selectedConversation])

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!selectedConversation) return

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', selectedConversation.id)
          .order('created_at', { ascending: true })

        if (!isMounted.current) return

        if (data && data.length !== messages.length) {
          const mapped: Message[] = data.map((row: any) => ({
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id || '',
            senderName: row.sender_name || 'User',
            senderRole: (row.sender_role === 'employer' ? 'employer' : 'candidate') as 'employer' | 'candidate',
            content: row.content || '',
            timestamp: row.created_at || new Date().toISOString(),
            isRead: row.is_read,
          }))
          setMessages(mapped)
          markConversationAsRead(selectedConversation.id)
        }
      } catch {
        // Fail silently on network errors during polling
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [selectedConversation, messages.length, markConversationAsRead])

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setShowSidebar(false)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation || !currentUserId) return

    const content = newMessage.trim()
    setNewMessage('')

    let session: any = null
    try {
      const result = await supabase.auth.getSession()
      session = result?.data?.session
    } catch {
      setNewMessage(content)
      return
    }
    if (!session) { setNewMessage(content); return }

    const senderName = session.user.user_metadata?.full_name || session.user.user_metadata?.company_name || 'You'
    const senderRole = session.user.user_metadata?.role || 'candidate'

    // If this is a new conversation, create it first
    let conversationId = selectedConversation.id
    if (conversationId === 'new') {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          participant_1: currentUserId,
          participant_2: selectedConversation.participantId,
          participant_1_name: senderName,
          participant_1_role: senderRole,
          participant_1_company: session.user.user_metadata?.company_name || '',
          participant_2_name: selectedConversation.participantName,
          participant_2_role: 'candidate',
          last_message: content,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (convError || !newConv) {
        console.error('Failed to create conversation:', convError?.message)
        setNewMessage(content)
        return
      }

      conversationId = newConv.id
      // Update the selected conversation with the real ID
      setSelectedConversation(prev => prev ? { ...prev, id: conversationId } : prev)
    }

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        sender_name: senderName,
        sender_role: senderRole,
        content,
        is_read: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to send message:', error.message)
      setNewMessage(content)
      return
    }

    if (inserted) {
      const newMsg: Message = {
        id: inserted.id,
        conversationId: inserted.conversation_id,
        senderId: inserted.sender_id,
        senderName,
        senderRole: senderRole as 'employer' | 'candidate',
        content: inserted.content,
        timestamp: inserted.created_at,
        isRead: true,
      }
      setMessages(prev => [...prev, newMsg])
      setTimeout(scrollToBottom, 50)
    }

    await supabase
      .from('conversations')
      .update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    updateConversation(conversationId, {
      lastMessage: content,
      lastMessageAt: new Date().toISOString(),
    })

    if (selectedConversation.participantId) {
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          data: {
            recipientUserId: selectedConversation.participantId,
            senderName,
            messagePreview: content,
          },
        }),
      }).catch(() => {})
    }
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?'
  }

  const filteredConversations = conversations.filter(conv => {
    const name = (conv.participantName || '').toLowerCase()
    const title = (conv.participantJobTitle || '').toLowerCase()
    const query = searchQuery.toLowerCase()
    return name.includes(query) || title.includes(query)
  })

  if (isLoading) {
    return <div className={styles.loading}>Loading messages...</div>
  }

  return (
    <div className={styles.container}>
      <Header />

      <div className={styles.messagesLayout}>
        {/* Sidebar */}
        <div className={`${styles.sidebar} ${!showSidebar ? styles.hidden : ''}`}>
          <div className={styles.sidebarHeader}>
            {candidateParam && (
              <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '8px' }}>
                ← Back to Candidates
              </button>
            )}
            <h1 className={styles.sidebarTitle}>
              Messages
            </h1>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}><Ico name="search" size={20} /></span>
              <input
                type="text"
                id="messageSearch"
                name="messageSearch"
                placeholder="Search conversations..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Conversations */}
          <div className={styles.conversationsList}>
            {filteredConversations.length === 0 ? (
              /* TWO different empty states, because they were one.
                 "No conversations yet" also fired when a SEARCH matched nothing,
                 telling someone with a full inbox that they had none — and the
                 message underneath told candidates to "connect with candidates",
                 which is employer copy on a candidate's page. */
              conversations.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}><Ico name="message-square" size={20} /></span>
                  <h3 className={styles.emptyTitle}>No conversations yet</h3>
                  <p className={styles.emptyText}>
                    {isEmployer
                      ? 'When someone applies for a role or puts themselves forward for a shift, your conversation with them starts here.'
                      : 'Apply for a role or put yourself forward for a shift, and your conversation with the employer starts here.'}
                  </p>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}><Ico name="search" size={20} /></span>
                  <h3 className={styles.emptyTitle}>No matches</h3>
                  <p className={styles.emptyText}>
                    Nothing here matches “{searchQuery.trim()}”.
                  </p>
                </div>
              )
            ) : (
              filteredConversations.map(conversation => (
                <div
                  key={conversation.id}
                  className={`${styles.conversationItem} ${
                    selectedConversation?.id === conversation.id ? styles.active : ''
                  } ${conversation.unreadCount > 0 ? styles.unread : ''}`}
                  onClick={() => handleSelectConversation(conversation)}
                >
                  <div className={styles.avatar}>
                    {conversation.participantProfilePicture ? (
                      <SignedImage
                        src={conversation.participantProfilePicture}
                        alt={conversation.participantName}
                        className={styles.avatarImg}
                      />
                    ) : (
                      getInitials(conversation.participantName)
                    )}
                    {conversation.isOnline && <span className={styles.onlineIndicator} />}
                  </div>
                  <div className={styles.conversationInfo}>
                    <div className={styles.conversationHeader}>
                      <span className={styles.conversationName}>
                        {conversation.participantName}
                      </span>
                      <span className={styles.conversationTime}>
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p className={styles.conversationRole}>
                      {conversation.participantJobTitle || conversation.participantCompany}
                    </p>
                    <p className={styles.conversationPreview}>
                      {conversation.lastMessage}
                    </p>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <span className={styles.unreadBadge}>{conversation.unreadCount}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Panel */}
        {selectedConversation ? (
          <div className={styles.chatPanel}>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderInfo}>
                <button
                  className={styles.backBtn}
                  onClick={() => setShowSidebar(true)}
                  aria-label="Back to conversations"
                >
                  ←
                </button>
                <div className={styles.chatHeaderAvatar}>
                  {selectedConversation.participantProfilePicture ? (
                    <SignedImage
                      src={selectedConversation.participantProfilePicture}
                      alt={selectedConversation.participantName}
                      className={styles.avatarImg}
                    />
                  ) : (
                    getInitials(selectedConversation.participantName)
                  )}
                  {selectedConversation.isOnline && (
                    <span className={styles.onlineIndicator} />
                  )}
                </div>
                <div className={styles.chatHeaderDetails}>
                  <h3>{selectedConversation.participantName}</h3>
                  <p>
                    {selectedConversation.participantJobTitle || selectedConversation.participantCompany}
                  </p>
                </div>
              </div>
              <div className={styles.chatHeaderActions}>
              </div>
            </div>

            {/* Messages Area */}
            <div className={styles.messagesArea} ref={messageListRef}>
              {messages.map((message, index) => {
                const isSent = message.senderId === currentUserId

                const prevTimestamp = index > 0 ? messages[index - 1]?.timestamp : null
                const showDateDivider = index === 0 || !prevTimestamp || !message.timestamp ||
                  new Date(message.timestamp).toDateString() !==
                  new Date(prevTimestamp).toDateString()

                return (
                  <div key={message.id}>
                    {showDateDivider && (
                      <div className={styles.dateDivider}>
                        <span>
                          {new Date(message.timestamp).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long'
                          })}
                        </span>
                      </div>
                    )}
                    <div className={`${styles.message} ${isSent ? styles.sent : styles.received}`}>
                      {!isSent && (
                        <div className={styles.messageAvatar}>
                          {getInitials(message.senderName)}
                        </div>
                      )}
                      <div className={styles.messageContent}>
                        <p className={styles.messageText} style={{ whiteSpace: 'pre-wrap' }}>{renderMessageContent(message.content)}</p>
                        <span className={styles.messageTime}>
                          {formatMessageTime(message.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* scroll anchor handled by messageListRef.scrollTop */}
            </div>

            {/* Chat Input */}
            <div className={styles.chatInputArea}>
              <form onSubmit={handleSendMessage} className={styles.chatInputForm}>
                <div className={styles.inputWrapper}>
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage(e)
                      }
                    }}
                    placeholder="Type a message..."
                    className={styles.chatInput}
                    rows={1}
                  />
                  <div className={styles.inputActions}>
                  </div>
                </div>
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={!newMessage.trim()}
                  aria-label="Send message"
                >
                  ➤
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className={styles.noChatSelected}>
            <span className={styles.noChatIcon}><Ico name="message-square" size={20} /></span>
            <h2 className={styles.noChatTitle}>Select a conversation</h2>
            <p className={styles.noChatText}>
              Choose a conversation from the list to start messaging
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
