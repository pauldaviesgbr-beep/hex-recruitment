'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Sprout } from 'lucide-react'
import { getKeywordResponse } from '@/lib/chatbot/keywordFallback'
import { detectHighStakes, interceptsEnabled } from '@/lib/chatbot/intercepts'
import styles from './ChatBot.module.css'

const ThriveIcon = ({ size = 20 }: { size?: number }) => (
  <Sprout size={size} color="#FFE500" strokeWidth={2} />
)

interface Message {
  id: string
  content: string
  sender: 'user' | 'bot'
  timestamp: Date
  links?: { text: string; href: string }[]
}

interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME_TEXT =
  "Hi! I'm here to help. Ask me about pricing, posting jobs, scheduling interviews, or anything else."

const suggestedQuestions = [
  'How does the trial work?',
  'Can I hire for tech or finance roles?',
  'How do I schedule interviews?',
  'What support do you offer?',
]

const MAX_HISTORY_TURNS = 15
const FIRST_BYTE_TIMEOUT_MS = 15000

// Pull "[text](path)" markdown out of an aggregated bot response and
// expose it as a pill-chip array, leaving the inline mention in place
// as plain text. The LLM emits links as inline markdown so it can name
// them descriptively in-sentence; the UI surfaces them as chips below
// the bubble (the existing rendering — the LLM swap preserves it).
function parseLinks(text: string): { content: string; links?: { text: string; href: string }[] } {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: { text: string; href: string }[] = []
  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(text)) !== null) {
    links.push({ text: match[1], href: match[2] })
  }
  const stripped = text.replace(linkRegex, '$1')
  return { content: stripped, links: links.length > 0 ? links : undefined }
}

export default function ChatBot() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showBadge, setShowBadge] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Conversation ID is regenerated on first open AND on "New
  // conversation" click. Used as the partition key in chat_logs.
  const conversationIdRef = useRef<string>('')

  // Hide chatbot on the messages page to avoid overlapping the send button.
  // NOTE: must NOT early-return here — that would break the Rules of Hooks
  // by skipping useEffect calls below. The pathname check is applied in
  // the return instead.
  const hiddenOnPage = pathname === '/messages'

  // Initial welcome message + first conversation_id when the panel opens.
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (!conversationIdRef.current) {
        conversationIdRef.current = crypto.randomUUID()
      }
      setMessages([{
        id: 'welcome',
        content: WELCOME_TEXT,
        sender: 'bot',
        timestamp: new Date(),
      }])
    }
  }, [isOpen, messages.length])

  // Auto-scroll to bottom whenever messages change (including mid-stream).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // ESC key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen])

  // Open from mobile menu via custom event
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true)
      setShowBadge(false)
    }
    window.addEventListener('open-thrive-chatbot', handleOpen)
    return () => window.removeEventListener('open-thrive-chatbot', handleOpen)
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return

    // Snapshot the prior conversation for history BEFORE we append the
    // new user message. Exclude both welcome variants (system-side, never
    // sent), tail-truncate to MAX_HISTORY_TURNS so we cap context size.
    const history: HistoryEntry[] = messages
      .filter((m) => m.id !== 'welcome' && m.id !== 'welcome-new')
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
      }))

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: trimmed,
      sender: 'user',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    // Defensive: a conversation_id must exist by this point (set on first
    // open). If the user somehow sent before the open effect fired, mint
    // one now so the API call doesn't reject on UUID validation.
    if (!conversationIdRef.current) {
      conversationIdRef.current = crypto.randomUUID()
    }

    // Belt-and-braces intercept layer — off by default, opt in via
    // NEXT_PUBLIC_CHATBOT_INTERCEPTS_ENABLED. When on, we render a
    // canonical chip above the streamed LLM response on the five
    // high-stakes topics (cancellation, pricing, trial, support, gdpr).
    // The LLM call still happens — intercept is additive, not a
    // replacement, so the contextual answer follows underneath.
    let interceptUsed = false
    if (interceptsEnabled()) {
      const match = detectHighStakes(trimmed)
      if (match) {
        interceptUsed = true
        const interceptMessage: Message = {
          id: `intercept-${Date.now()}`,
          content: match.canonicalResponse,
          sender: 'bot',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, interceptMessage])
      }
    }

    const botMessageId = `bot-${Date.now()}`

    // Silent fallback rendered identically to the LLM path. Called for
    // any failure mode the spec lists: HTTP 503 with { fallback: true },
    // network error, no first byte within 15s. Never surfaces error UI.
    const runFallback = () => {
      const { response, links } = getKeywordResponse(trimmed)
      const fallbackMsg: Message = {
        id: botMessageId,
        content: response,
        sender: 'bot',
        timestamp: new Date(),
        links,
      }
      setMessages((prev) => {
        const withoutInProgress = prev.filter((m) => m.id !== botMessageId)
        return [...withoutInProgress, fallbackMsg]
      })
      setIsTyping(false)
    }

    const controller = new AbortController()
    let firstByteSeen = false
    const firstByteTimer = setTimeout(() => {
      if (!firstByteSeen) controller.abort()
    }, FIRST_BYTE_TIMEOUT_MS)

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          conversation_id: conversationIdRef.current,
          intercept_used: interceptUsed,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        clearTimeout(firstByteTimer)
        runFallback()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let aggregated = ''
      let bubbleAdded = false

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        if (!firstByteSeen) {
          firstByteSeen = true
          clearTimeout(firstByteTimer)
          // First byte arrived — drop the typing indicator and add the
          // empty bot bubble we'll stream into.
          setIsTyping(false)
          setMessages((prev) => [...prev, {
            id: botMessageId,
            content: '',
            sender: 'bot',
            timestamp: new Date(),
          }])
          bubbleAdded = true
        }

        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by \n\n. Keep the incomplete trailing
        // chunk in buffer for the next read.
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''

        for (const frame of frames) {
          if (!frame.startsWith('data: ')) continue
          const data = frame.slice(6)

          if (data === '[DONE]') {
            const { content: finalContent, links } = parseLinks(aggregated)
            setMessages((prev) => prev.map((m) => (
              m.id === botMessageId ? { ...m, content: finalContent, links } : m
            )))
            return
          }

          try {
            const parsed = JSON.parse(data) as { text?: unknown }
            if (typeof parsed.text === 'string') {
              aggregated += parsed.text
              setMessages((prev) => prev.map((m) => (
                m.id === botMessageId ? { ...m, content: aggregated } : m
              )))
            }
          } catch {
            // Malformed chunk — skip and keep streaming.
          }
        }
      }

      // Stream ended without an explicit [DONE]. If we got text, finalize
      // it; otherwise fall back.
      if (aggregated) {
        const { content: finalContent, links } = parseLinks(aggregated)
        setMessages((prev) => prev.map((m) => (
          m.id === botMessageId ? { ...m, content: finalContent, links } : m
        )))
      } else {
        if (bubbleAdded) {
          setMessages((prev) => prev.filter((m) => m.id !== botMessageId))
        }
        runFallback()
      }
    } catch {
      clearTimeout(firstByteTimer)
      runFallback()
    }
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const handleSuggestedQuestion = (question: string) => {
    sendMessage(question)
  }

  const handleOpenChat = () => {
    setIsOpen(true)
    setShowBadge(false)
  }

  const handleNewConversation = () => {
    // Mint a fresh conversation_id so chat_logs partitions the new
    // conversation separately from the prior one.
    conversationIdRef.current = crypto.randomUUID()
    setMessages([{
      id: 'welcome-new',
      content: WELCOME_TEXT,
      sender: 'bot',
      timestamp: new Date(),
    }])
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  if (hiddenOnPage) return null

  return (
    <>
      {/* Chat Button */}
      <button
        className={`${styles.chatButton} ${isOpen ? styles.hidden : ''}`}
        onClick={handleOpenChat}
        aria-label="Open Ask Thrive chat"
      >
        <span className={styles.chatIcon}><ThriveIcon size={24} /></span>
        {showBadge && <span className={styles.chatBadge}>Need help?</span>}
      </button>

      {/* Chat Window */}
      <div
        className={`${styles.chatWindow} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-label="Ask Thrive — help chat"
      >
        {/* Header */}
        <div className={styles.chatHeader}>
          <div className={styles.headerInfo}>
            <span className={styles.headerIcon}><ThriveIcon size={18} /></span>
            <h3 className={styles.headerTitle}>Ask Thrive</h3>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.headerBtn}
              onClick={handleNewConversation}
              aria-label="Start new conversation"
              title="New conversation"
            >
              🔄
            </button>
            <button
              className={styles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messagesContainer}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${message.sender === 'user' ? styles.userMessage : styles.botMessage}`}
            >
              {message.sender === 'bot' && (
                <span className={styles.messageIcon}><ThriveIcon size={14} /></span>
              )}
              <div className={styles.messageContent}>
                <p className={styles.messageText}>
                  {message.content.split('\n').map((line, i) => (
                    <span key={i}>
                      {line.startsWith('**') && line.endsWith('**') ? (
                        <strong>{line.slice(2, -2)}</strong>
                      ) : line.startsWith('• ') ? (
                        <span className={styles.bulletPoint}>{line}</span>
                      ) : (
                        line
                      )}
                      {i < message.content.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </p>
                {message.links && message.links.length > 0 && (
                  <div className={styles.messageLinks}>
                    {message.links.map((link, i) => (
                      <Link key={i} href={link.href} className={styles.messageLink}>
                        {link.text}
                      </Link>
                    ))}
                  </div>
                )}
                <span className={styles.messageTime}>{formatTime(message.timestamp)}</span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className={`${styles.message} ${styles.botMessage}`}>
              <span className={styles.messageIcon}><ThriveIcon size={14} /></span>
              <div className={styles.typingIndicator}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Questions (show only at start) */}
        {messages.length === 1 && (
          <div className={styles.suggestedQuestions}>
            {suggestedQuestions.map((question, i) => (
              <button
                key={i}
                className={styles.suggestedBtn}
                onClick={() => handleSuggestedQuestion(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className={styles.inputForm}>
          <input
            ref={inputRef}
            type="text"
            id="chatBotInput"
            name="chatBotInput"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your message..."
            className={styles.input}
            disabled={isTyping}
            autoComplete="off"
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!inputValue.trim() || isTyping}
            aria-label="Send message"
          >
            ➤
          </button>
        </form>

        {/* Footer */}
        <div className={styles.chatFooter}>
          Built-in help
        </div>
      </div>
    </>
  )
}
