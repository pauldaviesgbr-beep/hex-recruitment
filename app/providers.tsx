'use client'

import { usePathname } from 'next/navigation'
import { JobsProvider } from '@/lib/JobsContext'
import { MessagesProvider } from '@/lib/MessagesContext'
import ErrorBoundary from '@/components/ErrorBoundary'
import ChatBot from '@/components/ChatBot'
import CookieConsent from '@/components/CookieConsent'

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')

  return (
    <JobsProvider>
      <ErrorBoundary label="MessagesProvider">
        <MessagesProvider>
          {children}
          {!isAdmin && <ChatBot />}
          {!isAdmin && <CookieConsent />}
        </MessagesProvider>
      </ErrorBoundary>
    </JobsProvider>
  )
}
