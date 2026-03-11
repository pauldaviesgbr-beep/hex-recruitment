'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'
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

  // ── State ──────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('messages')
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [pendingRequests, setPendingRequests] = useState<Connection[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null)
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
          router.push('/login')
          return
        }

        const userId = session.user.id
        if (isMounted.current) setCurrentUserId(userId)

        // Check subscription status for employers
        if (session.user.user_metadata?.role === 'employer') {
          try {
            const { data: subData } = await supabase
              .from('employer_subscriptions')
              .select('subscription_status')
              .eq('user_id', userId)
              .single()

            if (subData && (subData.subscription_status === 'active' || subData.subscription_status === 'trialing')) {
              if (isMounted.current) setHasSubscription(true)
            } else {
              if (isMounted.current) setHasSubscription(false)
            }
          } catch {
            if (isMounted.current) setHasSubscription(false)
          }
        } else {
          if (isMounted.current) setHasSubscription(true)
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

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: selectedConversation.id,
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
    }

    await supabase
      .from('conversations')
      .update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', selectedConversation.id)

    updateConversation(selectedConversation.id, {
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

  if (hasSubscription === false) {
    router.push('/dashboard/subscription')
    return <div className={styles.loading}>Redirecting to subscription page...</div>
  }

  return (
    <div className={styles.container}>
      <Header />

      <div className={styles.messagesLayout}>
        {/* Sidebar */}
        <div className={`${styles.sidebar} ${!showSidebar ? styles.hidden : ''}`}>
          <div className={styles.sidebarHeader}>
            <h1 className={styles.sidebarTitle}>
              Messages
            </h1>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
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

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'messages' ? styles.active : ''}`}
              onClick={() => setActiveTab('messages')}
            >
              Chats
              {totalUnreadCount > 0 && <span className={styles.tabBadge}>{totalUnreadCount}</span>}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'requests' ? styles.active : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              Requests
              {pendingRequests.length > 0 && (
                <span className={styles.tabBadge}>{pendingRequests.length}</span>
              )}
            </button>
          </div>

          {/* Content based on active tab */}
          {activeTab === 'messages' ? (
            <div className={styles.conversationsList}>
              {filteredConversations.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>💬</span>
                  <h3 className={styles.emptyTitle}>No conversations yet</h3>
                  <p className={styles.emptyText}>
                    Connect with candidates to start chatting
                  </p>
                </div>
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
                        <img
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
          ) : (
            <div className={styles.conversationsList}>
              {pendingRequests.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>📩</span>
                  <h3 className={styles.emptyTitle}>No pending requests</h3>
                  <p className={styles.emptyText}>
                    Connection requests will appear here
                  </p>
                </div>
              ) : (
                pendingRequests.map(request => (
                  <div key={request.id} className={styles.requestItem}>
                    <div className={styles.requestHeader}>
                      <div className={styles.avatar}>
                        {getInitials(request.employerName)}
                      </div>
                      <div className={styles.requestInfo}>
                        <span className={styles.requestName}>{request.employerName}</span>
                        <span className={styles.requestRole}>{request.employerCompany}</span>
                      </div>
                    </div>
                    {request.message && (
                      <p className={styles.requestMessage}>{request.message}</p>
                    )}
                    <div className={styles.requestActions}>
                      <button
                        className={styles.acceptBtn}
                        onClick={() => acceptRequest(request.id)}
                      >
                        Accept
                      </button>
                      <button
                        className={styles.declineBtn}
                        onClick={() => declineRequest(request.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
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
                    <img
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
                <button className={styles.headerActionBtn} title="View profile">
                  👤
                </button>
                <button className={styles.headerActionBtn} title="More options">
                  ⋮
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className={styles.messagesArea}>
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
              <div ref={messagesEndRef} />
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
                    <button type="button" className={styles.attachBtn} title="Attach file">
                      📎
                    </button>
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
            <span className={styles.noChatIcon}>💬</span>
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
