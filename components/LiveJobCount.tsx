'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Small, reusable trust cue: "N roles live now" with a pulsing green dot.
// Reads the real active-job count via the anon client (same public read the
// homepage + feed use). Fail-soft: renders nothing on error or a zero/failed
// count, so it never shows a broken or "0 roles" state. Respects
// prefers-reduced-motion for the pulse.
/**
 * `inline` renders JUST THE NUMBER, for use inside a sentence —
 * "Apply to 251 live roles." The default block form ("N roles live now") is a
 * standalone trust cue and cannot be nested in prose.
 *
 * IT IS THE SAME COMPONENT ON PURPOSE. The obvious alternative was to write
 * the number into the fork's copy, and this product has a history of that: the
 * board said 247 in three places for weeks while it carried more. A count that
 * is wrong on the screen where somebody decides whether to join is worse than
 * no count. One reader, two presentations.
 *
 * Fail-soft is inherited and it matters more inline: if the count cannot be
 * read, the sentence must still parse. It renders nothing, so "Apply to live
 * roles" reads a little oddly and says nothing false — which is the right way
 * round.
 */
export default function LiveJobCount({ className, style, inline }: { className?: string; style?: React.CSSProperties; inline?: boolean }) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { count: n, error } = await supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
        if (!cancelled && !error && typeof n === 'number' && n > 0) setCount(n)
      } catch {
        /* fail-soft: show nothing */
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (count === null) return null

  if (inline) return <strong className={className} style={style}>{count.toLocaleString('en-GB')}</strong>

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.95rem', ...style }}
    >
      {/* The pulsing green dot is GONE — design phase 1: green is retired
          from the product, and the number does the work by itself. */}
      <span>
        <strong>{count.toLocaleString('en-GB')}</strong> roles live now
      </span>
    </div>
  )
}
