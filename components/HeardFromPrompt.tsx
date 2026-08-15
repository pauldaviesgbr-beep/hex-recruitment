'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { HEARD_FROM_OPTIONS, normalizeSource } from '@/lib/attribution'
import { Ico } from '@/components/icons'

/*
  "HOW DID YOU HEAR ABOUT US?" — ASKED AFTER THE ACCOUNT EXISTS.

  The design handoff removed this from signup step one, correctly: it is our
  attribution problem, not the candidate's, and it sat between a person and
  the thing they came to do. But the dropdown is also the ONLY attribution
  layer that actually works — it is what caught Fraser when his tagged link
  lost its ref, and 42 of 49 recent signups are 'unknown' from the tag layer
  alone. So Paul's rule: it does not leave signup unless the post-signup ask
  ships in the same change. This is that ask.

  Design constraints it keeps to:
    · it never blocks anything — one dismissible line, no modal, no gate
    · it asks ONCE. Answered or dismissed, it does not come back (dismissal
      is remembered in localStorage; an answer is remembered in the row)
    · it does not overwrite a source we already know. If the tag layer
      established signup_source, the answer is stored in heard_from and the
      normalized source is left alone — explicit ref/utm outranks
      self-report, which is the priority normalizeSource already encodes.
*/

const DISMISS_KEY = 'thrive_heard_from_dismissed'

export default function HeardFromPrompt() {
  const [show, setShow] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ signup_ref: string | null; utm_source: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY)) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || cancelled) return
        const { data } = await supabase
          .from('candidate_profiles')
          .select('heard_from, signup_ref, utm_source')
          .eq('user_id', session.user.id)
          .maybeSingle()
        // Already answered — never ask twice.
        if (!data || data.heard_from || cancelled) return
        setUserId(session.user.id)
        setExisting({ signup_ref: data.signup_ref ?? null, utm_source: data.utm_source ?? null })
        setShow(true)
      } catch { /* the prompt is optional: never break the dashboard */ }
    })()
    return () => { cancelled = true }
  }, [])

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
    setShow(false)
  }

  const answer = async (choice: string) => {
    if (!userId || saving) return
    setSaving(true)
    try {
      const patch: Record<string, string> = { heard_from: choice }
      // Only fill the normalized source if the tag layer never established
      // one — an explicit ref/utm is better evidence than a self-report.
      if (!existing?.signup_ref && !existing?.utm_source) {
        patch.signup_source = normalizeSource({ heard_from: choice })
      }
      await supabase.from('candidate_profiles').update(patch).eq('user_id', userId)
      try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
      setSaved(true)
      setTimeout(() => setShow(false), 1600)
    } catch {
      setShow(false)
    } finally {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    <div
      style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '14px 16px', marginBottom: '1rem',
      }}
    >
      {saved ? (
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ico name="check" size={16} /> Thanks — that helps us reach more people like you.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>
              One quick thing — how did you hear about Thrive?
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2, lineHeight: 0 }}
            >
              <Ico name="x" size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {HEARD_FROM_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                disabled={saving}
                onClick={() => answer(opt)}
                style={{
                  border: '1px solid #CBD5E1', background: '#fff', borderRadius: 999,
                  padding: '7px 13px', fontSize: '0.82rem', fontWeight: 600, color: '#0F172A',
                  cursor: saving ? 'default' : 'pointer', minHeight: 36,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
