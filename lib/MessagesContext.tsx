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
  // ── State (all useState calls, unconditionally, at the top) ────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [pendingRequests, setPendingRequests] = useState<Connection[]>([])

  // ── Refs (all useRef calls, before any useCallback that captures them) ─
  const tableOk = useRef(true)

  // ── Callbacks (all useCallback calls, before useEffect) ───────────────

  const loadConversations = useCallback(async () => {
    try {
      const sessionResult = await supabase.auth.getSession()
      const session = sessionResult?.data?.session
      if (!session) return

      const userId = session.user.id

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order('last_message_at', { ascending: false })

      if (error) {
        tableOk.current = false
        return
      }

      if (!data) return

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

      setConversations(mapped)
    } catch {
      // Network or unexpected errors — fail silently
    }
  }, [])

  const markConversationAsRead = useCallback(async (conversationId: string) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
      )
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
      // Fail silently — unread count already updated locally
    }
  }, [])

  const updateConversation = useCallback((conversationId: string, updates: Partial<Conversation>) => {
    setConversations(prev => {
      const updated = prev.map(conv =>
        conv.id === conversationId ? { ...conv, ...updates } : conv
      )
      return updated.sort((a, b) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta)
      })
    })
  }, [])

  const addConversation = useCallback((conversation: Conversation) => {
    setConversations(prev => {
      if (prev.find(c => c.id === conversation.id)) return prev
      return [conversation, ...prev]
    })
  }, [])

  const acceptRequest = useCallback((connectionId: string) => {
    const connection = pendingRequests.find(c => c.id === connectionId)
    setPendingRequests(prev => prev.filter(req => req.id !== connectionId))
    if (connection) {
      const newConversation: Conversation = {
        id: `conv-new-${Date.now()}`,
        connectionId: connection.id,
        participantId: connection.employerId || '',
        participantName: connection.employerName || 'Unknown',
        participantRole: 'employer',
        participantCompany: connection.employerCompany,
        participantProfilePicture: null,
        lastMessage: connection.message || 'Connection accepted',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 1,
        isOnline: false,
      }
      setConversations(prev => [newConversation, ...prev])
    }
  }, [pendingRequests])

  const declineRequest = useCallback((connectionId: string) => {
    setPendingRequests(prev => prev.filter(req => req.id !== connectionId))
  }, [])

  // ── Effects (all useEffect calls, after all useCallback declarations) ──

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    loadConversations().then(() => {
      if (tableOk.current) {
        interval = setInterval(loadConversations, 30000)
      }
    }).catch(() => {})
    return () => { if (interval) clearInterval(interval) }
  }, [loadConversations])

  // ── Derived values (no hooks below this line) ──────────────────────────

  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0)
  const pendingRequestsCount = pendingRequests.length

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
        refreshConversations: loadConversations,
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
