'use client'

import { useEffect, useRef } from 'react'

/**
 * The one place a form error is rendered.
 *
 * There was no shared error component before this: 33 files set an error and
 * 30+ rendered it independently, in three different conventions — a per-page
 * `styles.error` CSS module, raw inline style objects, and one global `err`
 * class. None carried role="alert", so a screen reader was never told, and
 * none was focusable.
 *
 * IT TAKES A className RATHER THAN OWNING ITS LOOK. That is deliberate: it
 * means adopting it is a one-line swap that keeps each page's existing styling,
 *
 *     {error && <div className={styles.error}>{error}</div>}
 *     <FormError message={error} className={styles.error} />
 *
 * so the four long forms can adopt it today without a mass edit across three
 * styling conventions, and the next form written is right by default.
 *
 * FOCUS: by default it does NOT take focus, because the caller usually focuses
 * the offending FIELD instead — which is better, since it says which one. Pass
 * focusSelf for an error with no single field to blame (a failed save, a server
 * error), where the banner is the only thing there is to move to.
 */
export default function FormError({
  message,
  className,
  style,
  focusSelf = false,
}: {
  message?: string | null
  className?: string
  /** For the pages that style errors inline rather than with a CSS module. */
  style?: React.CSSProperties
  focusSelf?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (message && focusSelf) ref.current?.focus()
  }, [message, focusSelf])

  if (!message) return null

  return (
    <div
      ref={ref}
      role="alert"
      // -1 so it can be focused programmatically but never lands in tab order.
      tabIndex={-1}
      className={className}
      style={{ outline: 'none', ...style }}
    >
      {message}
    </div>
  )
}
