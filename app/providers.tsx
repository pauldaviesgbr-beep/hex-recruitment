'use client'

import { usePathname } from 'next/navigation'
import { JobsProvider } from '@/lib/JobsContext'
import ChatBot from '@/components/ChatBot'
import CookieConsent from '@/components/CookieConsent'

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')

  return (
    <JobsProvider>
      {children}
      {!isAdmin && <ChatBot />}
      {!isAdmin && <CookieConsent />}
    </JobsProvider>
  )
}
