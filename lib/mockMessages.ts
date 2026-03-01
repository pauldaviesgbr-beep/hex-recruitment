export interface Connection {
  id: string
  employerId: string
  employerName: string
  employerCompany: string
  candidateId: string
  candidateName: string
  candidateJobTitle: string
  candidateProfilePicture: string | null
  status: 'pending' | 'accepted' | 'declined'
  requestedAt: string
  respondedAt: string | null
  message?: string
}

export interface Conversation {
  id: string
  connectionId: string
  participantId: string
  participantName: string
  participantRole: 'employer' | 'candidate'
  participantJobTitle?: string
  participantCompany?: string
  participantProfilePicture: string | null
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
  isOnline: boolean
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderRole: 'employer' | 'candidate'
  content: string
  timestamp: string
  isRead: boolean
  attachments?: { name: string; url: string; type: string }[]
}

// Mock connections (for demonstrating the request system)
export const mockConnections: Connection[] = [
  {
    id: 'conn-1',
    employerId: 'emp-1',
    employerName: 'Sarah Mitchell',
    employerCompany: 'The Grand Hotel London',
    candidateId: '1',
    candidateName: 'James Wilson',
    candidateJobTitle: 'Executive Chef',
    candidateProfilePicture: null,
    status: 'accepted',
    requestedAt: '2024-01-20T10:30:00Z',
    respondedAt: '2024-01-20T14:15:00Z',
    message: 'Hi James, we love your experience at Michelin-starred restaurants. Would love to discuss our Head Chef position!'
  },
  {
    id: 'conn-2',
    employerId: 'emp-1',
    employerName: 'Sarah Mitchell',
    employerCompany: 'The Grand Hotel London',
    candidateId: '3',
    candidateName: 'Marcus Thompson',
    candidateJobTitle: 'Senior Bartender',
    candidateProfilePicture: null,
    status: 'accepted',
    requestedAt: '2024-01-18T09:00:00Z',
    respondedAt: '2024-01-18T11:30:00Z',
    message: 'Marcus, your cocktail expertise is exactly what we need for our new rooftop bar!'
  },
  {
    id: 'conn-3',
    employerId: 'emp-1',
    employerName: 'Sarah Mitchell',
    employerCompany: 'The Grand Hotel London',
    candidateId: '5',
    candidateName: 'David Park',
    candidateJobTitle: 'Hotel Front Desk Manager',
    candidateProfilePicture: null,
    status: 'pending',
    requestedAt: '2024-01-25T16:00:00Z',
    respondedAt: null,
    message: 'Hi David, your front desk experience is impressive. We have an exciting opportunity!'
  }
]

// Mock conversations (for the messages page)
export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    connectionId: 'conn-1',
    participantId: '1',
    participantName: 'James Wilson',
    participantRole: 'candidate',
    participantJobTitle: 'Executive Chef',
    participantProfilePicture: null,
    lastMessage: 'That sounds great! When would you like me to come in for a trial shift?',
    lastMessageAt: '2024-01-26T15:30:00Z',
    unreadCount: 2,
    isOnline: true
  },
  {
    id: 'conv-2',
    connectionId: 'conn-2',
    participantId: '3',
    participantName: 'Marcus Thompson',
    participantRole: 'candidate',
    participantJobTitle: 'Senior Bartender',
    participantProfilePicture: null,
    lastMessage: 'I can start from next Monday if that works for you.',
    lastMessageAt: '2024-01-25T11:45:00Z',
    unreadCount: 0,
    isOnline: false
  }
]

// Mock messages for conversation 1 (James Wilson - Executive Chef)
export const mockMessagesConv1: Message[] = [
  {
    id: 'msg-1-1',
    conversationId: 'conv-1',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'Hi James! Thank you for accepting my connection request. I\'ve been really impressed by your profile and experience at The Ivy.',
    timestamp: '2024-01-20T14:20:00Z',
    isRead: true
  },
  {
    id: 'msg-1-2',
    conversationId: 'conv-1',
    senderId: '1',
    senderName: 'James Wilson',
    senderRole: 'candidate',
    content: 'Thank you Sarah! I\'m excited to learn more about the opportunity at The Grand Hotel. What position are you looking to fill?',
    timestamp: '2024-01-20T14:35:00Z',
    isRead: true
  },
  {
    id: 'msg-1-3',
    conversationId: 'conv-1',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'We\'re opening a new fine dining restaurant within the hotel and we\'re looking for a Head Chef to lead the kitchen. The role comes with full creative control over the menu, a team of 12, and a competitive salary package.',
    timestamp: '2024-01-20T14:50:00Z',
    isRead: true
  },
  {
    id: 'msg-1-4',
    conversationId: 'conv-1',
    senderId: '1',
    senderName: 'James Wilson',
    senderRole: 'candidate',
    content: 'That sounds like exactly what I\'ve been looking for! Creative freedom is really important to me. Could you tell me more about the concept you\'re going for?',
    timestamp: '2024-01-21T09:15:00Z',
    isRead: true
  },
  {
    id: 'msg-1-5',
    conversationId: 'conv-1',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'We\'re aiming for modern British cuisine with a focus on sustainable, locally-sourced ingredients. We\'ve already partnered with several farms in the Home Counties. Would you be available for an informal chat over coffee this week?',
    timestamp: '2024-01-21T10:00:00Z',
    isRead: true
  },
  {
    id: 'msg-1-6',
    conversationId: 'conv-1',
    senderId: '1',
    senderName: 'James Wilson',
    senderRole: 'candidate',
    content: 'I love that approach - sustainability is really close to my heart. Yes, I\'d be happy to meet! I\'m free Thursday or Friday afternoon.',
    timestamp: '2024-01-21T11:30:00Z',
    isRead: true
  },
  {
    id: 'msg-1-7',
    conversationId: 'conv-1',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'Perfect! Let\'s say Thursday at 3pm at the hotel? I can show you the kitchen space as well. We could also discuss having you do a trial shift where you could showcase some dishes.',
    timestamp: '2024-01-24T09:00:00Z',
    isRead: true
  },
  {
    id: 'msg-1-8',
    conversationId: 'conv-1',
    senderId: '1',
    senderName: 'James Wilson',
    senderRole: 'candidate',
    content: 'That sounds great! When would you like me to come in for a trial shift?',
    timestamp: '2024-01-26T15:30:00Z',
    isRead: false
  }
]

// Mock messages for conversation 2 (Marcus Thompson - Bartender)
export const mockMessagesConv2: Message[] = [
  {
    id: 'msg-2-1',
    conversationId: 'conv-2',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'Hi Marcus! Thanks for connecting. Your cocktail portfolio is impressive - those molecular mixology techniques are exactly what we need!',
    timestamp: '2024-01-18T11:35:00Z',
    isRead: true
  },
  {
    id: 'msg-2-2',
    conversationId: 'conv-2',
    senderId: '3',
    senderName: 'Marcus Thompson',
    senderRole: 'candidate',
    content: 'Thank you! I\'ve spent years perfecting those techniques. What kind of bar are you looking to create?',
    timestamp: '2024-01-18T12:00:00Z',
    isRead: true
  },
  {
    id: 'msg-2-3',
    conversationId: 'conv-2',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'We\'re opening a rooftop cocktail bar with panoramic views of London. We want a creative Head Bartender who can design a signature cocktail menu. The salary is £38,000 plus tips.',
    timestamp: '2024-01-18T12:30:00Z',
    isRead: true
  },
  {
    id: 'msg-2-4',
    conversationId: 'conv-2',
    senderId: '3',
    senderName: 'Marcus Thompson',
    senderRole: 'candidate',
    content: 'A rooftop bar sounds amazing! I\'ve always wanted to create a menu that tells a story through cocktails. I have some ideas already!',
    timestamp: '2024-01-19T10:00:00Z',
    isRead: true
  },
  {
    id: 'msg-2-5',
    conversationId: 'conv-2',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'I love your enthusiasm! Would you be able to come in for a trial shift? We\'d love to see some of your signature creations.',
    timestamp: '2024-01-22T14:00:00Z',
    isRead: true
  },
  {
    id: 'msg-2-6',
    conversationId: 'conv-2',
    senderId: '3',
    senderName: 'Marcus Thompson',
    senderRole: 'candidate',
    content: 'Absolutely! The trial went really well I think. I really enjoyed meeting the team.',
    timestamp: '2024-01-24T18:00:00Z',
    isRead: true
  },
  {
    id: 'msg-2-7',
    conversationId: 'conv-2',
    senderId: 'emp-1',
    senderName: 'Sarah Mitchell',
    senderRole: 'employer',
    content: 'You were fantastic! The team loved you. We\'d like to offer you the position. When would you be able to start?',
    timestamp: '2024-01-25T09:30:00Z',
    isRead: true
  },
  {
    id: 'msg-2-8',
    conversationId: 'conv-2',
    senderId: '3',
    senderName: 'Marcus Thompson',
    senderRole: 'candidate',
    content: 'I can start from next Monday if that works for you.',
    timestamp: '2024-01-25T11:45:00Z',
    isRead: true
  }
]

// Helper function to get messages by conversation ID
export function getMessagesByConversationId(conversationId: string): Message[] {
  switch (conversationId) {
    case 'conv-1':
      return mockMessagesConv1
    case 'conv-2':
      return mockMessagesConv2
    default:
      return []
  }
}

// Helper function to format relative time
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Helper function to format message time
export function formatMessageTime(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const isToday = date.toDateString() === today.toDateString()
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  if (isYesterday) {
    return 'Yesterday ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
         date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
