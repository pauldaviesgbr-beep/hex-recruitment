'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { enforceAppCookiePolicy } from '@/lib/cookies'
import { JobsProvider } from '@/lib/JobsContext'
import { NotificationsProvider } from '@/lib/NotificationsContext'
const ChatBot = dynamic(() => import('@/components/ChatBot'), { ssr: false })
const CookieConsent = dynamic(() => import('@/components/CookieConsent'), { ssr: false })

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')

  // HERE, NOT IN CookieConsent: this provider is mounted on every page,
  // /admin included, and the clear has to run wherever the app happens to
  // open. A no-op on the website.
  useEffect(() => { enforceAppCookiePolicy() }, [])

  return (
    <JobsProvider>
      <NotificationsProvider>
        {children}
        {!isAdmin && <ChatBot />}
        {!isAdmin && <CookieConsent />}
      </NotificationsProvider>
    </JobsProvider>
  )
}
