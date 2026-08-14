'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import RichTextEditor from './RichTextEditor'
import { sanitizeNoteHtml, NOTE_MAX_HTML } from '@/lib/sanitizeNoteHtml'
import styles from './PrepNotesModal.module.css'

interface PrepNotesModalProps {
  isOpen: boolean
  onClose: () => void
  interviewId: string
  candidateName: string
  jobTitle: string
}

type SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export default function PrepNotesModal({
  isOpen,
  onClose,
  interviewId,
  candidateName,
  jobTitle,
}: PrepNotesModalProps) {
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [dirty, setDirty] = useState(false)

  // AI interview-question generation (capability-flagged, daily-capped).
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [aiRemaining, setAiRemaining] = useState<number>(0)
  const [aiLimit, setAiLimit] = useState<number>(10)
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  // Neutral (non-error) notice — e.g. "not enough candidate info to generate".
  const [aiNotice, setAiNotice] = useState('')

  // Refs so the debounce/close/blur paths always see current values without
  // re-creating callbacks.
  const bodyRef = useRef('')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const savedRef = useRef('') // last successfully persisted value
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tooLong = (bodyRef.current?.length ?? 0) > NOTE_MAX_HTML

  // Load the existing note when the modal opens.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoaded(false)
    setStatus('loading')
    setDirty(false)
    dirtyRef.current = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const res = await fetch(`/api/interviews/${interviewId}/notes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        // Sanitise on render too (defence-in-depth before it reaches the editor).
        const clean = sanitizeNoteHtml(json?.body ?? '')
        setBody(clean)
        bodyRef.current = clean
        savedRef.current = clean
        setStatus('idle')
        setLoaded(true)
      } catch {
        if (cancelled) return
        setStatus('error')
        setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, interviewId])

  // Fetch capability + remaining quota when the modal opens, so the button can
  // show/hide and display how many generations are left today.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const res = await fetch(`/api/interviews/${interviewId}/questions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        })
        if (!res.ok) { if (!cancelled) setAiEnabled(false); return }
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        setAiEnabled(!!j.enabled)
        setAiLimit(typeof j.limit === 'number' ? j.limit : 10)
        setAiRemaining(typeof j.remaining === 'number' ? j.remaining : 0)
      } catch {
        if (!cancelled) setAiEnabled(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, interviewId])

  const saveNow = useCallback(async () => {
    if (savingRef.current) return
    const current = bodyRef.current
    // Nothing to do if unchanged since the last successful save.
    if (current === savedRef.current) { setDirty(false); dirtyRef.current = false; return }
    if ((current?.length ?? 0) > NOTE_MAX_HTML) { setStatus('error'); return }

    savingRef.current = true
    setStatus('saving')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/interviews/${interviewId}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body: current }),
      })
      if (!res.ok) throw new Error(`save failed ${res.status}`)
      const json = await res.json().catch(() => ({}))
      // Adopt the server's sanitised value as the source of truth.
      const persisted = typeof json?.body === 'string' ? json.body : current
      savedRef.current = persisted
      setStatus('saved')
      setDirty(false)
      dirtyRef.current = false
    } catch {
      setStatus('error')
    } finally {
      savingRef.current = false
    }
  }, [interviewId])

  const handleChange = useCallback((html: string) => {
    setBody(html)
    bodyRef.current = html
    const changed = html !== savedRef.current
    setDirty(changed)
    dirtyRef.current = changed
    if (changed) setStatus('idle')
    // Debounced autosave.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void saveNow() }, 900)
  }, [saveNow])

  // Save-on-blur of the editor area.
  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (dirtyRef.current) void saveNow()
  }, [saveNow])

  // Save-on-close, then close.
  const handleClose = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (dirtyRef.current && !tooLong) await saveNow()
    onClose()
  }, [onClose, saveNow, tooLong])

  // Generate AI questions and APPEND below the existing notes (never overwrite),
  // then persist via the normal save path.
  const handleGenerate = useCallback(async () => {
    if (generating) return
    setGenerating(true)
    setAiError('')
    setAiNotice('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/interviews/${interviewId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // The browser sends ONLY the interview id (in the URL) — no candidate PII.
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 429) {
        setAiError(json?.error || `You've used today's ${aiLimit} AI generations.`)
        setAiRemaining(0)
        return
      }
      // Gateway/function timeout (the 504 body isn't our JSON) — make the rare
      // slow case read clearly rather than the generic error below.
      if (res.status === 504 || res.status === 408 || res.status === 524) {
        setAiError('This is taking longer than expected — please try again.')
        return
      }
      // Not enough candidate evidence — a distinct, friendly NOTICE (not an
      // error); the server made NO model call, so nothing was charged/consumed.
      if (res.status === 422 || json?.code === 'insufficient_evidence') {
        setAiNotice(json?.error || "There isn't enough information on this candidate yet to generate tailored questions. You can still add your own prep notes below.")
        return
      }
      if (!res.ok || typeof json?.html !== 'string' || !json.html) {
        setAiError(json?.error || "Couldn't generate right now — try again.")
        return
      }
      const existing = bodyRef.current || ''
      const hasExisting = existing.trim() && existing.replace(/<p>\s*<\/p>/gi, '').trim() !== ''
      const combined = hasExisting ? existing + json.html : json.html
      setBody(combined)
      bodyRef.current = combined
      setDirty(true)
      dirtyRef.current = true
      if (typeof json.remaining === 'number') setAiRemaining(json.remaining)
      await saveNow()
    } catch {
      setAiError("Couldn't generate right now — try again.")
    } finally {
      setGenerating(false)
    }
  }, [generating, interviewId, aiLimit, saveNow])

  // Flush a pending debounce if the modal unmounts.
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  if (!isOpen) return null

  const statusLabel =
    status === 'saving' ? 'Saving…'
    : status === 'saved' && !dirty ? 'Saved'
    : status === 'error' ? "Couldn't save"
    : dirty ? 'Unsaved changes'
    : ''

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Prep notes</h2>
            <p className={styles.subtitle}>{candidateName} · {jobTitle}</p>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.hint}>
            Private to you — the candidate never sees this. Jot the questions or
            things you want to cover in this interview.
          </p>

          {!loaded ? (
            <div className={styles.loading}>Loading note…</div>
          ) : (
            <div onBlur={handleBlur}>
              <RichTextEditor
                value={body}
                onChange={handleChange}
                placeholder="Add prep questions or notes for this interview…"
              />
            </div>
          )}

          {tooLong && (
            <p className={styles.tooLong}>
              This note is too long ({body.length.toLocaleString()} / {NOTE_MAX_HTML.toLocaleString()} characters of formatting). Trim it to save.
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {aiEnabled && (
              <button
                type="button"
                className={styles.generateBtn}
                onClick={() => void handleGenerate()}
                disabled={generating || aiRemaining <= 0 || tooLong || !loaded}
                title={aiRemaining <= 0
                  ? `Daily limit reached (${aiLimit}/day)`
                  : `Generate AI interview questions — ${aiRemaining} left today`}
              >
                {generating ? 'Generating…' : 'Generate questions'}
              </button>
            )}
            {generating
              ? <span className={styles.aiHint}>this takes a few seconds…</span>
              : aiError
                ? <span className={styles.aiError}>{aiError}</span>
                : aiNotice
                  ? <span className={styles.aiNotice}>{aiNotice}</span>
                  : aiEnabled && aiRemaining > 0
                    ? <span className={styles.aiHint}>{aiRemaining} of {aiLimit} left today</span>
                    : null}
          </div>
          <div className={styles.footerActions}>
            <span
              className={`${styles.status} ${
                status === 'saved' && !dirty ? styles.statusSaved
                : status === 'error' ? styles.statusError
                : status === 'saving' ? styles.statusSaving
                : ''
              }`}
              aria-live="polite"
            >
              {status === 'saved' && !dirty && <span aria-hidden="true">✓ </span>}
              {statusLabel}
            </span>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => void saveNow()}
              disabled={!dirty || status === 'saving' || tooLong}
            >
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={styles.doneBtn} onClick={handleClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
