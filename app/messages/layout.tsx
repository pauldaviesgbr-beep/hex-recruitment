'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { MessagesProvider } from '@/lib/MessagesContext'

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setError(event.message + '\n' + event.filename + ':' + event.lineno + '\n' + (event.error?.stack || ''))
    }
    const unhandledHandler = (event: PromiseRejectionEvent) => {
      setError('Unhandled promise: ' + (event.reason?.message || event.reason) + '\n' + (event.reason?.stack || ''))
    }
    window.addEventListener('error', handler)
    window.addEventListener('unhandledrejection', unhandledHandler)
    setMounted(true)
    return () => {
      window.removeEventListener('error', handler)
      window.removeEventListener('unhandledrejection', unhandledHandler)
    }
  }, [])

  if (error) {
    return (
      <div style={{ padding: '20px', background: 'white', color: 'red', fontSize: '12px', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, overflow: 'auto' }}>
        <h2>Error:</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</pre>
      </div>
    )
  }

  if (!mounted) return <>{children}</>

  return <MessagesProvider>{children}</MessagesProvider>
}
