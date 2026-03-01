'use client'

import { useState } from 'react'
import styles from './CompanyLogo.module.css'

interface CompanyLogoProps {
  src?: string | null
  alt: string
  className?: string
}

export default function CompanyLogo({ src, alt, className = '' }: CompanyLogoProps) {
  const [imgError, setImgError] = useState(false)

  const getInitial = (name: string): string => {
    const prefixes = ['the ', 'a ', 'an ']
    const lower = name.toLowerCase()
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix)) {
        return name.charAt(prefix.length).toUpperCase()
      }
    }
    return name.charAt(0).toUpperCase()
  }

  const initial = alt ? getInitial(alt) : '?'

  if (!src || imgError) {
    return (
      <div className={`${styles.placeholder} ${className}`} aria-label={alt}>
        <span className={styles.initial}>{initial}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
    />
  )
}
