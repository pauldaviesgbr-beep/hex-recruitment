'use client'

import { useState, useEffect } from 'react'
import { getSignedStorageUrl } from '@/lib/storageUrl'

interface SignedImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  style?: React.CSSProperties
  fallback?: React.ReactNode
  /**
   * Render size in CSS pixels. When given, the image is requested from storage
   * at 2x this size rather than at whatever the person uploaded — a 46px avatar
   * asks for 92px, not for 1052x1536.
   *
   * 2x rather than 1x because these are round avatars on retina phones, where
   * 1x is visibly soft. It is still two orders of magnitude less than the
   * original.
   */
  thumb?: { width: number; height: number }
}

/**
 * Image component that resolves Supabase storage paths/URLs to
 * short-lived signed URLs. External URLs (Google avatars, etc.)
 * pass through unchanged.
 */
export default function SignedImage({ src, alt, className, style, fallback, thumb }: SignedImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!src) { setResolvedSrc(''); return }
    // External URLs don't need signing
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (src.startsWith('http') && !src.includes(supabaseUrl)) {
      setResolvedSrc(src)
      return
    }
    let cancelled = false
    getSignedStorageUrl(
      src, 3600, undefined,
      thumb ? { width: thumb.width * 2, height: thumb.height * 2 } : undefined,
    ).then(url => {
      if (!cancelled) setResolvedSrc(url)
    })
    return () => { cancelled = true }
    // thumb is an object literal at most call sites, so depend on its VALUES
    // rather than its identity — a new object every render would re-sign the
    // URL on every render, which is a request storm rather than a cache.
  }, [src, thumb?.width, thumb?.height])

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
