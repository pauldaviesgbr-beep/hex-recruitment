'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { supabase } from './supabase'
import {
  type Conversation,
  type Connection
} from './mockMessages'

interface MessagesContextType {
  conversations: Conversation[]
  pendingRequests: Connection[]
  totalUnreadCount: number
  pendingRequestsCount: number
  markConversationAsRead: (conversationId: string) => void
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void
  addConversation: (conversation: Conversation) => void
  acceptRequest: (connectionId: string) => void
  declineRequest: (connectionId: string) => void
  refreshConversations: () => Promise<void>
}

const MessagesContext = createContext<MessagesContextType | undefined>(undefined)

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [pendingRequests, setPendingRequests] = useState<Connection[]>([])

  // Load conversations from Supabase
  const loadConversations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const userId = session.user.id

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('last_message_at', { ascending: false })

    if (error) {
      // Table might not exist yet — fail silently and stop polling
      tableOk.current = false
      return
    }

    if (!data) return

    // For each conversation, count unread messages
    const mapped: Conversation[] = await Promise.all(
      data.map(async (row: any) => {
        const isP1 = row.participant_1 === userId
        const otherName = isP1 ? row.participant_2_name : row.participant_1_name
        const otherRole = isP1 ? row.participant_2_role : row.participant_1_role
        const otherCompany = isP1 ? row.participant_2_company : row.participant_1_company
        const otherId = isP1 ? row.participant_2 : row.participant_1

        // Count unread messages (messages not sent by me and not read)
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', row.id)
          .neq('sender_id', userId)
          .eq('is_read', false)

        return {
          id: row.id,
          connectionId: row.id,
          participantId: otherId,
          participantName: otherName || 'Unknown',
          participantRole: (otherRole === 'employer' ? 'employer' : 'candidate') as 'employer' | 'candidate',
          participantCompany: otherCompany || undefined,
          participantProfilePicture: null,
          lastMessage: row.last_message || '',
          lastMessageAt: row.last_message_at || row.created_at,
          unreadCount: count || 0,
          isOnline: false,
          participantJobTitle: row.related_job_title || undefined,
        }
      })
    )

    setConversations(mapped)
  }, [])

  // Track whether the table exists to avoid repeated 400s
  const tableOk = useRef(true)

  // Load on mount, only poll if initial load succeeds
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    loadConversations().then(() => {
      if (tableOk.current) {
        interval = setInterval(loadConversations, 30000)
      }
    })

    return () => { if (interval) clearInterval(interval) }
  }, [loadConversations])

  // Calculate total unread count from all conversations
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0)
  const pendingRequestsCount = pendingRequests.length

  // Mark a conversation as read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
      )
    )

    // Mark all unread messages in this conversation as read
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', session.user.id)
      .eq('is_read', false)
  }, [])

  // Update a conversation
  const updateConversation = useCallback((conversationId: string, updates: Partial<Conversation>) => {
    setConversations(prev => {
      const updated = prev.map(conv =>
        conv.id === conversationId ? { ...conv, ...updates } : conv
      )
      return updated.sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      )
    })
  }, [])

  // Add a new conversation (local state only — Supabase insert is done by the caller)
  const addConversation = useCallback((conversation: Conversation) => {
    setConversations(prev => {
      // Avoid duplicates
      if (prev.find(c => c.id === conversation.id)) return prev
      return [conversation, ...prev]
    })
  }, [])

  // Accept a connection request
  const acceptRequest = useCallback((connectionId: string) => {
    const connection = pendingRequests.find(c => c.id === connectionId)
    setPendingRequests(prev => prev.filter(req => req.id !== connectionId))

    if (connection) {
      const newConversation: Conversation = {
        id: `conv-new-${Date.now()}`,
        connectionId: connection.id,
        participantId: connection.employerId,
        participantName: connection.employerName,
        participantRole: 'employer',
        participantCompany: connection.employerCompany,
        participantProfilePicture: null,
        lastMessage: connection.message || 'Connection accepted',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 1,
        isOnline: false
      }
      setConversations(prev => [newConversation, ...prev])
    }
  }, [pendingRequests])

  // Decline a connection request
  const declineRequest = useCallback((connectionId: string) => {
    setPendingRequests(prev => prev.filter(req => req.id !== connectionId))
  }, [])

  const refreshConversations = loadConversations

  return (
    <MessagesContext.Provider
      value={{
        conversations,
        pendingRequests,
        totalUnreadCount,
        pendingRequestsCount,
        markConversationAsRead,
        updateConversation,
        addConversation,
        acceptRequest,
        declineRequest,
        refreshConversations
      }}
    >
      {children}
    </MessagesContext.Provider>
  )
}

export function useMessages() {
  const context = useContext(MessagesContext)
  if (context === undefined) {
    throw new Error('useMessages must be used within a MessagesProvider')
  }
  return context
}
