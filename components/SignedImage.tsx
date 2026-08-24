'use client'

import { useState, useEffect } from 'react'
import { getSignedStorageUrl } from '@/lib/storageUrl'

interface SignedImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  style?: React.CSSProperties
  fallback?: React.ReactNode
}

/**
 * Image component that resolves Supabase storage paths/URLs to
 * short-lived signed URLs. External URLs (Google avatars, etc.)
 * pass through unchanged.
 */
export default function SignedImage({ src, alt, className, style, fallback }: SignedImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // RESET THE FAILURE WHEN THE SOURCE CHANGES. Without this, one broken
    // image poisons every later src on the same mounted component: `failed`
    // stayed true forever and the fallback showed for a photo that was
    // perfectly fine. It matters wherever this component is REUSED rather than
    // remounted — the employer applications carousel swaps candidates through
    // one card, so a single bad photo would blank the rest of the pipeline.
    setFailed(false)
    if (!src) { setResolvedSrc(''); return }
    // External URLs don't need signing
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (src.startsWith('http') && !src.includes(supabaseUrl)) {
      setResolvedSrc(src)
      return
    }
    let cancelled = false
    getSignedStorageUrl(src).then(url => {
      if (!cancelled) setResolvedSrc(url)
    })
    return () => { cancelled = true }
  }, [src])

  if (!resolvedSrc || failed) {
    return fallback ? <>{fallback}</> : null
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  )
}
