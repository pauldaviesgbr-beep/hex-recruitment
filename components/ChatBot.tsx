'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Sprout } from 'lucide-react'
import { getKeywordResponse } from '@/lib/chatbot/keywordFallback'
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

const suggestedQuestions = [
  'How do I post a job?',
  'How much does it cost?',
  'How do I find candidates?',
  'How do I apply for jobs?',
]

export default function ChatBot() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showBadge, setShowBadge] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Hide chatbot on the messages page to avoid overlapping the send button
  // NOTE: must NOT early-return here — that would break the Rules of Hooks by
  // skipping useEffect calls below. The pathname check is applied in the return instead.
  const hiddenOnPage = pathname === '/messages'

  // Initial welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        content: "Hi! I'm here to help. Ask me about pricing, posting jobs, scheduling interviews, or anything else.",
        sender: 'bot',
        timestamp: new Date()
      }
      setMessages([welcomeMessage])
    }
  }, [isOpen, messages.length])

  // Auto-scroll to bottom
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

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: content.trim(),
      sender: 'user',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    // Simulate bot typing delay
    setTimeout(() => {
      const { response, links } = getKeywordResponse(content)
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        content: response,
        sender: 'bot',
        timestamp: new Date(),
        links
      }
      setMessages(prev => [...prev, botMessage])
      setIsTyping(false)
    }, 800 + Math.random() * 500) // Random delay between 800-1300ms
  }, [])

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
    setMessages([{
      id: 'welcome-new',
      content: "Hi! I'm here to help. Ask me about pricing, posting jobs, scheduling interviews, or anything else.",
      sender: 'bot',
      timestamp: new Date()
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
