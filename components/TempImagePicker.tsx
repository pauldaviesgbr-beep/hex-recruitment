'use client'

import { useRef, useState } from 'react'
import { compressImage } from '@/lib/compressImage'
import { supabase } from '@/lib/supabase'

// Effortless photo picker for Temp Work posts: drag-and-drop OR click, a live
// thumbnail preview with remove/replace, and no size/shape requirement — the
// image is auto-resized client-side then framed with object-fit: cover.
export default function TempImagePicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('That doesn’t look like an image. Try a JPG, PNG or phone photo.'); return }
    setUploading(true); setError('')
    try {
      const prepared = await compressImage(file)
      const fd = new FormData()
      fd.append('image', prepared)
      fd.append('bucket', 'temp-posts')
      // Requires manage_jobs at the route now, so the session travels with it.
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Upload failed. Please try another photo.'); return }
      onChange(json.url || json.dataUrl || '')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (disabled || uploading) return
    handleFile(e.dataTransfer.files?.[0])
  }

  const c = { border: '#cbd5e1', sub: '#64748b', ink: '#0f172a', accentBg: '#f8fafc' }

  if (value) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${c.border}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* 16/11 because that is the card slot, and the upload is cropped to it.
              Previewing any other shape would promise a framing the feed won't give. */}
          <img src={value} alt="Selected banner" style={{ width: '100%', aspectRatio: '16 / 11', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploading}
              style={pillBtn}>Replace</button>
            <button type="button" onClick={() => onChange('')} disabled={disabled || uploading}
              style={pillBtn}>Remove</button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden
          onChange={e => handleFile(e.target.files?.[0])} />
        {error && <p style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '0.4rem 0 0' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <div
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!disabled && !uploading) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled && !uploading) inputRef.current?.click() }}
        style={{
          border: `1.5px dashed ${dragOver ? c.ink : c.border}`,
          background: dragOver ? '#eef2ff' : c.accentBg,
          borderRadius: 12, padding: '1.4rem 1rem', textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
          transition: 'border-color .12s, background .12s',
        }}
      >
        {uploading ? (
          <span style={{ color: c.sub, fontSize: '0.9rem' }}>Adding your photo…</span>
        ) : (
          <>
            <div style={{ fontSize: '1.6rem', lineHeight: 1 }} aria-hidden>📷</div>
            <div style={{ fontWeight: 600, color: c.ink, fontSize: '0.9rem', marginTop: 6 }}>
              Drag a photo here, or click to choose
            </div>
            <div style={{ color: c.sub, fontSize: '0.8rem', marginTop: 4 }}>
              Any photo works — we’ll crop it for you. No photo is fine too.
            </div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => handleFile(e.target.files?.[0])} />
      {error && <p style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '0.4rem 0 0' }}>{error}</p>}
    </div>
  )
}

const pillBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700, color: '#0f172a',
  background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(15,23,42,0.15)',
  borderRadius: 999, cursor: 'pointer', backdropFilter: 'blur(2px)',
}
