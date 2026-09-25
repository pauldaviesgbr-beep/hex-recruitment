'use client'

import { useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/nativeShell'

/**
 * The footer's "Cookie Settings" control — on the website only.
 *
 * In the app there are no optional cookies and no preferences panel, so the
 * global this button calls is never registered. Rendered there, it would be a
 * control that does nothing when tapped. It was written out inline three times
 * (home, privacy policy, terms); it is one component now so the app rule lives
 * in one place.
 *
 * Decided in an effect, not during render: the server has no window, and a
 * render-time answer would hydrate differently from the server's HTML.
 */
export default function CookieSettingsButton({ className }: { className?: string }) {
  const [inApp, setInApp] = useState(false)
  useEffect(() => { setInApp(isNativeApp()) }, [])
  if (inApp) return null
  return (
    <button
      onClick={() => (window as any).__openCookiePreferences?.()}
      className={className}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
    >
      Cookie Settings
    </button>
  )
}
