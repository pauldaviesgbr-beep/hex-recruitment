'use client'

import { usePathname } from 'next/navigation'
import { JobsProvider } from '@/lib/JobsContext'
import { MessagesProvider } from '@/lib/MessagesContext'
import ChatBot from '@/components/ChatBot'
import CookieConsent from '@/components/CookieConsent'

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')

  return (
    <JobsProvider>
      <MessagesProvider>
        {children}
        {!isAdmin && <ChatBot />}
        {!isAdmin && <CookieConsent />}
      </MessagesProvider>
    </JobsProvider>
  )
}
