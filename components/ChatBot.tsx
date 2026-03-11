'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import styles from './ChatBot.module.css'

const HexIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinejoin="round" />
  </svg>
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

// Bot response patterns — keyword-matched knowledge base
const responsePatterns: { keywords: string[]; response: string; links?: { text: string; href: string }[] }[] = [
  // ── GENERAL / ABOUT ──
  {
    keywords: ['what is hex', 'about hex', 'how does it work', 'tell me about', 'what does hex do'],
    response: "Hex | Talent Recruitment is the UK's recruitment platform connecting employers across all industries with qualified professionals.\n\n**For Job Seekers:** Completely free! Create your profile, upload your CV, browse jobs, and apply directly.\n\n**For Employers:** Post jobs, browse candidate profiles, schedule interviews, send offers, and track your hiring pipeline. Start with a 14-day free trial, then from £29.99/month.",
    links: [{ text: 'Learn More', href: '/' }]
  },
  {
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
    response: "Hello! Welcome to Hex | Talent Recruitment! I'm here to help you find your next opportunity or hire great talent. What would you like to know?"
  },
  {
    keywords: ['thanks', 'thank you', 'cheers', 'appreciate', 'ta'],
    response: "You're welcome! If you have any other questions, I'm always here to help. Good luck!"
  },
  {
    keywords: ['contact', 'support', 'email', 'phone number'],
    response: "Need more help? Our support team is here for you!\n\nEmail: support@hexrecruitment.co.uk\n\nWe typically respond within 24 hours."
  },

  // ── REGISTRATION & LOGIN ──
  {
    keywords: ['register', 'sign up', 'create account', 'join', 'get started'],
    response: "There are two ways to join Hex:\n\n**Job Seekers:** Create a free profile — browse jobs, upload your CV, and apply directly. No cost, ever.\n\n**Employers:** Subscribe to a plan to post jobs and access candidate profiles. Start with 14 days free!",
    links: [{ text: 'I\'m a Job Seeker', href: '/register/employee' }, { text: 'I\'m an Employer', href: '/subscribe' }]
  },
  {
    keywords: ['log in', 'login', 'sign in', 'forgot password', 'reset password', 'can\'t log in'],
    response: "You can log in from the top-right of the site. If you've forgotten your password, click \"Forgot Password\" on the login page and we'll send you a reset link via email.",
    links: [{ text: 'Log In', href: '/login' }]
  },

  // ── PRICING & SUBSCRIPTION ──
  {
    keywords: ['cost', 'price', 'pay', 'how much', 'pricing', 'fee', 'charge', 'subscription', 'plan'],
    response: "Great question! Hex offers a 14-day FREE trial, then two plans:\n\n**Standard:** £29.99/month\n• Up to 3 active job listings\n• Browse candidate profiles\n• Direct messaging\n• Interview scheduling\n\n**Professional:** £59.99/month\n• Unlimited job listings\n• Priority candidate access\n• Full analytics dashboard\n• All Standard features\n\nJust give 1 week's notice to cancel. No hidden fees.",
    links: [{ text: 'View Plans', href: '/subscribe' }]
  },
  {
    keywords: ['free trial', 'trial', '14 day', 'fourteen day', 'try free'],
    response: "Yes! You get 14 days completely FREE when you sign up as an employer. During your trial you get full access to:\n• Post jobs based on your plan tier\n• Browse all candidate profiles\n• Send and receive messages\n• Schedule interviews\n• Send job offers\n\nNo charges until your trial ends. Cancel with 1 week's notice.",
    links: [{ text: 'Start Free Trial', href: '/subscribe' }]
  },
  {
    keywords: ['standard plan', 'basic plan', 'starter plan'],
    response: "The **Standard plan** is £29.99/month and includes:\n• Up to 3 active job listings at a time\n• Browse and contact candidates\n• Direct messaging\n• Interview scheduling\n• Offer management\n\nPerfect for small businesses or occasional hiring!",
    links: [{ text: 'Subscribe', href: '/subscribe' }]
  },
  {
    keywords: ['professional plan', 'pro plan', 'premium plan', 'unlimited'],
    response: "The **Professional plan** is £59.99/month and includes:\n• Unlimited active job listings\n• Priority access to new candidates\n• Full analytics dashboard with charts, trends, and performance metrics\n• All Standard features included\n\nIdeal for businesses with ongoing recruitment needs!",
    links: [{ text: 'Subscribe', href: '/subscribe' }]
  },
  {
    keywords: ['cancel', 'unsubscribe', 'stop subscription', 'end subscription'],
    response: "You can cancel your subscription from your Settings page with 1 week's notice. If you cancel during your free trial, you won't be charged at all. Your access continues until the end of the notice period.",
    links: [{ text: 'Settings', href: '/settings' }]
  },
  {
    keywords: ['upgrade', 'change plan', 'switch plan', 'downgrade'],
    response: "You can upgrade or change your plan from the Settings page. Upgrading to Professional unlocks unlimited job listings and the full analytics dashboard. Changes take effect immediately.",
    links: [{ text: 'Settings', href: '/settings' }]
  },

  // ── EMPLOYER: POSTING JOBS ──
  {
    keywords: ['post job', 'post a job', 'add job', 'create job', 'new job', 'advertise', 'list job', 'job listing'],
    response: "To post a job on Hex:\n1. Subscribe to a plan (or start a free trial)\n2. Click \"Post Job\" in the sidebar\n3. Fill in the job details: title, description, salary, location, job type, and category\n4. Publish and your job is live!\n\nYour listing will be visible to thousands of candidates across the UK.",
    links: [{ text: 'Post a Job', href: '/post-job' }]
  },
  {
    keywords: ['edit job', 'update job', 'change job', 'modify listing'],
    response: "You can edit any of your job listings from the \"My Candidates\" page. Find the job card and click \"Edit\" to update the title, description, salary, location, or any other details. Changes go live immediately."
  },
  {
    keywords: ['pause job', 'deactivate job', 'hide job'],
    response: "You can pause a job listing from the \"My Candidates\" page. Click the \"Pause\" button on any active job card. Paused jobs are hidden from candidates but can be reactivated at any time."
  },
  {
    keywords: ['delete job', 'remove job', 'close job'],
    response: "You can delete a job listing from the \"My Candidates\" page. Click the \"Delete\" button on the job card. Please note that deleting a job will also remove all associated applications."
  },

  // ── EMPLOYER: BROWSING CANDIDATES ──
  {
    keywords: ['find candidate', 'browse candidate', 'search candidate', 'view candidate', 'candidate profile', 'talent pool'],
    response: "As an employer with an active subscription, you can browse our full database of candidates!\n\n• View detailed profiles with skills, experience, and qualifications\n• Download candidate CVs\n• See their availability status\n• Send messages directly to candidates you're interested in\n\nUse filters to narrow by skills, location, and more.",
    links: [{ text: 'Browse Candidates', href: '/candidates' }]
  },

  // ── EMPLOYER: MY CANDIDATES (HIRING PIPELINE) ──
  {
    keywords: ['my candidate', 'my jobs', 'application', 'applicant', 'pipeline', 'hiring pipeline', 'manage candidate'],
    response: "The \"My Candidates\" page is your central hiring dashboard! It shows all your job listings and their applicants. You can:\n\n• View all candidates who applied to your jobs\n• Review their profiles and CVs\n• Move candidates through stages: Reviewing, Interviewing, Offers, Hired\n• Filter by status to focus on what needs attention\n\nUse the sidebar links to quickly jump to Interviews, Offers, or Hired views.",
    links: [{ text: 'My Candidates', href: '/my-jobs' }]
  },

  // ── EMPLOYER: INTERVIEWS ──
  {
    keywords: ['interview', 'schedule interview', 'interview date', 'interview time', 'calendar', 'book interview'],
    response: "Hex makes interview scheduling easy!\n\n• Schedule interviews directly from a candidate's application\n• Set the date, time, duration, and interview type (in-person, video, or phone)\n• Add a location or video call link\n• Interviews sync with Google Calendar automatically\n• Track all upcoming interviews from the \"Interviews\" tab in the sidebar\n\nThe Interviews view shows today's, this week's, pending confirmation, and completed interviews.",
    links: [{ text: 'View Interviews', href: '/my-jobs?filter=interviewing' }]
  },
  {
    keywords: ['reschedule', 'change interview', 'move interview', 'cancel interview'],
    response: "You can reschedule or cancel an interview from the candidate's application page. Update the date, time, or location as needed. The candidate will be notified of any changes. Cancelled interviews are tracked separately from completed ones."
  },

  // ── EMPLOYER: OFFERS ──
  {
    keywords: ['offer', 'job offer', 'send offer', 'make offer', 'offer letter', 'signature'],
    response: "When you're ready to hire, you can send a formal job offer through Hex!\n\n• Create an offer with salary, start date, and terms\n• The candidate receives a notification and can review the offer\n• Candidates can accept and sign digitally, or decline\n• Track all your pending and accepted offers from the \"Offers\" tab\n\nOffers include a digital signature system for quick acceptance.",
    links: [{ text: 'View Offers', href: '/my-jobs?filter=offers' }]
  },

  // ── EMPLOYER: HIRED ──
  {
    keywords: ['hired', 'accepted offer', 'onboard', 'successful hire', 'filled position'],
    response: "The \"Hired\" tab shows all candidates who have accepted your job offers. From here you can:\n\n• View the details of each successful hire\n• See which positions have been filled\n• Archive completed hires\n• Track your overall hiring success rate\n\nCongratulations on each new team member!",
    links: [{ text: 'View Hired', href: '/my-jobs?filter=hired' }]
  },

  // ── EMPLOYER: ANALYTICS ──
  {
    keywords: ['analytics', 'dashboard', 'stats', 'statistics', 'performance', 'metrics', 'report', 'chart'],
    response: "The Analytics dashboard gives you insights into your recruitment performance:\n\n• Job posting views and application rates\n• Candidate pipeline breakdown\n• Hiring funnel conversion rates\n• Trend charts over time\n• Top-performing job listings\n\nThe full analytics dashboard is available on the Professional plan (£59.99/month).",
    links: [{ text: 'View Analytics', href: '/dashboard/analytics' }]
  },

  // ── EMPLOYER: REVIEWS ──
  {
    keywords: ['review', 'feedback', 'rating', 'employer review', 'candidate review'],
    response: "The Reviews section lets you manage feedback and ratings. Both employers and candidates can leave reviews after the hiring process. Good reviews help build trust and attract better candidates to your future listings.",
    links: [{ text: 'View Reviews', href: '/reviews' }]
  },

  // ── MESSAGING ──
  {
    keywords: ['message', 'chat', 'inbox', 'direct message', 'dm', 'communicate', 'send message'],
    response: "Hex has built-in messaging so you can communicate directly with candidates or employers!\n\n• Send and receive messages from your inbox\n• Get notifications for new messages\n• Discuss job details, arrange interviews, or ask questions\n• Messages are accessible from the top navigation bar\n\nLook for the message icon in the navbar to access your conversations.",
    links: [{ text: 'Browse Jobs', href: '/jobs' }]
  },

  // ── NOTIFICATIONS ──
  {
    keywords: ['notification', 'alert', 'bell', 'updates', 'notify'],
    response: "Stay up to date with Hex notifications! You'll receive alerts for:\n\n• New job applications\n• Messages from candidates or employers\n• Interview confirmations and reminders\n• Offer responses (accepted or declined)\n• Profile views\n\nClick the bell icon in the top navigation bar to see all your notifications."
  },

  // ── SETTINGS ──
  {
    keywords: ['setting', 'account setting', 'profile setting', 'preferences', 'account details'],
    response: "From the Settings page you can manage:\n\n• Your company/profile information\n• Subscription plan and billing\n• Notification preferences\n• Account security and password\n• Phone number verification\n\nAccess Settings from the sidebar menu.",
    links: [{ text: 'Settings', href: '/settings' }]
  },

  // ── CANDIDATE: PROFILE & CV ──
  {
    keywords: ['candidate profile', 'create profile', 'my profile', 'set up profile'],
    response: "Creating your candidate profile is quick and free!\n\n1. Register as a job seeker\n2. Fill in your details: name, skills, experience, and qualifications\n3. Upload your CV (PDF recommended)\n4. Set your availability status\n5. Start browsing and applying for jobs!\n\nA complete profile helps employers find and contact you.",
    links: [{ text: 'Create Profile', href: '/register/employee' }]
  },
  {
    keywords: ['cv', 'resume', 'upload cv', 'upload resume', 'document'],
    response: "You can upload your CV when creating or editing your candidate profile. Employers can view and download it when considering you for positions.\n\n• PDF format is recommended\n• Keep it up to date with your latest experience\n• A strong CV increases your chances of getting noticed\n\nYou can update your CV at any time from your profile settings.",
    links: [{ text: 'Create Profile', href: '/register/employee' }]
  },
  {
    keywords: ['availability', 'available', 'status', 'looking for work', 'open to work'],
    response: "Candidates can set their availability status on their profile to let employers know if they're:\n\n• Actively looking for work\n• Open to offers\n• Not currently available\n\nKeeping your status up to date helps employers know when to reach out."
  },

  // ── CANDIDATE: BROWSING & APPLYING ──
  {
    keywords: ['job seeker', 'find job', 'apply', 'get hired', 'search job', 'browse job', 'look for job'],
    response: "Job seekers can use Hex completely FREE!\n\n• Browse hundreds of jobs across all UK sectors\n• Filter by location, category, salary, and job type\n• Apply with one click using your profile and CV\n• Track your applications and their status\n• Receive messages from interested employers\n\nCreate your free profile to get started!",
    links: [{ text: 'Browse Jobs', href: '/jobs' }, { text: 'Create Profile', href: '/register/employee' }]
  },
  {
    keywords: ['track application', 'application status', 'my application', 'where is my application'],
    response: "You can track all your job applications from your dashboard. Each application shows its current status:\n\n• **Pending** — Submitted, awaiting employer review\n• **Reviewing** — Employer is reviewing your profile\n• **Interviewing** — You've been invited for an interview\n• **Offer** — You've received a job offer\n• **Accepted** — Congratulations, you're hired!\n\nYou'll receive notifications when your application status changes."
  },

  // ── CANDIDATE: INTERVIEWS ──
  {
    keywords: ['my interview', 'interview invite', 'confirm interview', 'interview notification'],
    response: "When an employer schedules an interview with you, you'll receive a notification with the details:\n\n• Date, time, and duration\n• Interview type (in-person, video, or phone)\n• Location or video call link\n• Option to confirm or request a reschedule\n\nInterviews can also sync with Google Calendar so you never miss one!"
  },

  // ── CANDIDATE: OFFERS ──
  {
    keywords: ['receive offer', 'got an offer', 'accept offer', 'decline offer', 'sign offer'],
    response: "When an employer sends you a job offer, you'll see it in your notifications and dashboard. You can:\n\n• Review the full offer details (salary, start date, terms)\n• Accept and digitally sign the offer\n• Decline if it's not the right fit\n\nTake your time to review, but don't wait too long — the employer is excited about you!"
  },

  // ── SECTORS & CATEGORIES ──
  {
    keywords: ['sector', 'industry', 'category', 'what jobs', 'job type', 'positions', 'field'],
    response: "Hex covers all major UK job sectors:\n\n• Accountancy, Banking & Finance\n• Admin, Secretarial & PA\n• Digital & IT\n• Engineering & Manufacturing\n• Healthcare & Social Care\n• Hospitality, Tourism & Sport\n• Legal\n• Marketing, Advertising & PR\n• Retail & Sales\n• Teaching & Education\n• Construction & Property\n• Transport & Logistics\n\nAnd many more!",
    links: [{ text: 'Browse All Jobs', href: '/jobs' }]
  },

  // ── LOCATION ──
  {
    keywords: ['london', 'manchester', 'birmingham', 'location', 'where', 'city', 'area', 'region'],
    response: "Hex covers jobs across the entire UK! We have listings in:\n\n• London\n• Manchester\n• Birmingham\n• Edinburgh\n• Leeds\n• Bristol\n• And many more cities\n\nUse the location filter when browsing jobs to find opportunities near you.",
    links: [{ text: 'Browse Jobs', href: '/jobs' }]
  },

  // ── SIDEBAR / NAVIGATION ──
  {
    keywords: ['sidebar', 'navigation', 'menu', 'where do i find', 'how to navigate'],
    response: "The employer sidebar gives you quick access to all key areas:\n\n• **Post Job** — Create a new listing\n• **Browse Jobs** — See all active jobs on the platform\n• **Candidates** — Browse the candidate database\n• **My Candidates** — Your jobs and applicants\n• **Interviews** — Upcoming and past interviews\n• **Offers** — Pending and accepted offers\n• **Hired** — Successfully hired candidates\n• **Analytics** — Performance dashboard (Professional plan)\n• **Reviews** — Feedback and ratings\n• **Settings** — Account and subscription management\n\nYou can collapse or expand the sidebar using the arrow button."
  },

  // ── EMPLOYER: GENERAL HIRING ──
  {
    keywords: ['hire', 'hiring process', 'recruitment process', 'how to hire'],
    response: "The hiring process on Hex is straightforward:\n\n1. **Post a Job** — Create your listing with details\n2. **Review Applications** — Candidates apply and you review them\n3. **Schedule Interviews** — Book interviews with top candidates\n4. **Send Offers** — Make formal offers with digital signatures\n5. **Hire!** — Track successful hires in your dashboard\n\nEverything is managed from your employer dashboard.",
    links: [{ text: 'Post a Job', href: '/post-job' }, { text: 'Browse Candidates', href: '/candidates' }]
  },

  // ── FREE FOR CANDIDATES ──
  {
    keywords: ['free for candidate', 'candidate cost', 'does it cost candidate', 'job seeker free', 'do i pay'],
    response: "Hex is completely FREE for job seekers! You can:\n\n• Create your profile at no cost\n• Browse and apply for unlimited jobs\n• Receive messages from employers\n• Track your applications\n• Accept job offers\n\nThere are no hidden fees for candidates — ever.",
    links: [{ text: 'Create Free Profile', href: '/register/employee' }]
  },

  // ── VERIFICATION ──
  {
    keywords: ['verify', 'verification', 'phone number', 'verify phone', 'confirm identity'],
    response: "Employers are required to verify their phone number before posting jobs. This helps maintain trust and quality on the platform. Verification is quick — just enter your phone number and confirm the code sent via SMS."
  },

  // ── GOOGLE CALENDAR ──
  {
    keywords: ['google calendar', 'calendar sync', 'calendar integration'],
    response: "Hex integrates with Google Calendar! When interviews are scheduled, they can be automatically added to your Google Calendar with all the details — date, time, location or video link, and candidate/employer information. Never miss an interview!"
  }
]

const defaultResponse = {
  response: "I'm here to help! You can ask me about:\n\n**For Employers:**\n• Posting jobs & pricing\n• Browsing candidates\n• Interviews, offers & hiring\n• Analytics dashboard\n\n**For Job Seekers:**\n• Creating a free profile\n• Browsing & applying for jobs\n• Tracking applications\n\nWhat would you like to know?",
  links: [{ text: 'Browse Jobs', href: '/jobs' }, { text: 'Post a Job', href: '/post-job' }]
}

function getBotResponse(message: string): { response: string; links?: { text: string; href: string }[] } {
  const lowerMessage = message.toLowerCase()

  for (const pattern of responsePatterns) {
    if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
      return { response: pattern.response, links: pattern.links }
    }
  }

  return defaultResponse
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

  // Hide chatbot on the messages page to avoid overlapping the send button
  // NOTE: must NOT early-return here — that would break the Rules of Hooks by
  // skipping useEffect calls below. The pathname check is applied in the return instead.
  const hiddenOnPage = pathname === '/messages'

  // Initial welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        content: "Hi! I'm your Hex Assistant. How can I help you today?",
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
      const { response, links } = getBotResponse(content)
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
      content: "Hi! I'm your Hex Assistant. How can I help you today?",
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
        aria-label="Open chat assistant"
      >
        <span className={styles.chatIcon}><HexIcon size={24} /></span>
        {showBadge && <span className={styles.chatBadge}>Need help?</span>}
      </button>

      {/* Chat Window */}
      <div
        className={`${styles.chatWindow} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-label="Chat with Hex Assistant"
      >
        {/* Header */}
        <div className={styles.chatHeader}>
          <div className={styles.headerInfo}>
            <span className={styles.headerIcon}><HexIcon size={18} /></span>
            <h3 className={styles.headerTitle}>HEX Chat</h3>
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
                <span className={styles.messageIcon}><HexIcon size={14} /></span>
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
              <span className={styles.messageIcon}><HexIcon size={14} /></span>
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
          Powered by Hex AI
        </div>
      </div>
    </>
  )
}
