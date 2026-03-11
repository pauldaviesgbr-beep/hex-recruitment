'use client'

import { useState, useEffect } from 'react'
import { MessagesProvider } from '@/lib/MessagesContext'

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <>{children}</>

  return <MessagesProvider>{children}</MessagesProvider>
}
