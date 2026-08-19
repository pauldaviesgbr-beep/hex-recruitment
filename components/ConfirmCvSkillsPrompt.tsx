'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Ico } from '@/components/icons'

/*
  "WE READ YOUR CV — IS THIS RIGHT?" — TURNING AN INFERENCE INTO A DECLARATION.

  WHY THIS AND NOT SCORING THE CV DIRECTLY. Phase 1 read 26 CVs and produced
  good data, but three things stop it being matched on as-is:

    · OVER-EXTRACTION. Skills per CV came out between 1 and 44, averaging 16.7
      of ~90 possible terms. One CV was tagged with half the vocabulary. Scored
      raw, the most verbose CV outranks everyone regardless of what they are
      actually good at. A person picking from the list is the filter nobody
      could write.

    · INDUSTRY DRIFT. 5 of 26 most recent roles were not hospitality at all —
      Nursery Assistant, Day Porter, Customer Advisor. Those people are moving
      INTO the industry, and a CV-driven match would keep offering them the job
      they just left. Only they can say otherwise.

    · DECLARED OUTRANKS INFERRED. Our own rule, and the reason
      signup_source_basis exists. A confirmed skill is better evidence than an
      extracted one, and it is worth more in the scorer because it should be.

  So the CV does the typing and the candidate does the deciding. One tap per
  chip instead of a blank "what are you good at?" box, which is the version
  that gets ignored.

  IT WRITES TO `skills` — THE DECLARED COLUMN, the one the scorer already reads
  at 35 points. cv_derived is left exactly as it was: it is the evidence, not
  the answer, and overwriting it would destroy the record of what we inferred
  versus what we were told.

  Same manners as HeardFromPrompt, which is the pattern this follows: never
  blocks, never a modal, asks once, dismissal remembered per USER and not per
  browser — a shared phone must not silence the prompt for the second person.
*/

const dismissKey = (userId: string) => `thrive_cv_skills_confirmed:${userId}`

interface Derived {
  skills?: string[]
  recentTitle?: string | null
  inferred?: boolean
}

export default function ConfirmCvSkillsPrompt() {
  const [show, setShow] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<string[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || cancelled) return
        const uid = session.user.id
        if (typeof window !== 'undefined' && window.localStorage.getItem(dismissKey(uid))) return

        const { data } = await supabase
          .from('candidate_profiles')
          .select('skills, cv_derived')
          .eq('user_id', uid)
          .maybeSingle()
        if (!data || cancelled) return

        // NEVER ASK SOMEONE WHO HAS ALREADY TOLD US. A candidate with declared
        // skills has answered this question; showing them a list derived from
        // their CV would invite them to overwrite their own words with our
        // guess, which is the wrong direction entirely.
        const alreadyDeclared = Array.isArray(data.skills) && data.skills.length > 0
        if (alreadyDeclared) return

        const derived = (data.cv_derived || null) as Derived | null
        const found = Array.isArray(derived?.skills) ? derived!.skills! : []
        if (found.length === 0) return

        setUserId(uid)
        setSuggested(found)
        // NOTHING IS PRE-SELECTED. Pre-ticking all 44 and asking someone to
        // untick is the same as not asking — the default becomes the answer,
        // and we would have laundered an inference into a declaration without
        // anyone actually deciding anything.
        setChosen(new Set())
        setShow(true)
      } catch { /* optional prompt: never break the dashboard */ }
    })()
    return () => { cancelled = true }
  }, [])

  const dismiss = () => {
    if (userId) {
      try { window.localStorage.setItem(dismissKey(userId), '1') } catch { /* private mode */ }
    }
    setShow(false)
  }

  const toggle = (skill: string) => {
    setChosen(prev => {
      const next = new Set(prev)
      if (next.has(skill)) next.delete(skill)
      else next.add(skill)
      return next
    })
  }

  const save = async () => {
    if (!userId || saving || chosen.size === 0) return
    setSaving(true)
    try {
      // ONLY `skills`. cv_derived is untouched — the inference stays on the
      // record beside the declaration, so it stays possible to ask later how
      // often people agreed with what we read.
      const { error } = await supabase
        .from('candidate_profiles')
        .update({ skills: Array.from(chosen) })
        .eq('user_id', userId)
      if (error) throw error
      try { window.localStorage.setItem(dismissKey(userId), '1') } catch { /* private mode */ }
      setSaved(true)
      setTimeout(() => setShow(false), 1800)
    } catch {
      // Stay open on failure. Closing on an error is how "it did not save"
      // reads as "it saved".
      setSaving(false)
    }
  }

  if (!show) return null

  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? '#0F172A' : '#CBD5E1'}`,
    background: active ? '#0F172A' : '#fff',
    color: active ? '#FFE500' : '#0F172A',
    borderRadius: 999, padding: '7px 13px', fontSize: '0.82rem', fontWeight: 600,
    cursor: saving ? 'default' : 'pointer', minHeight: 36,
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', marginBottom: '1rem' }}>
      {saved ? (
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ico name="check" size={16} /> Saved — employers searching for those will find you now.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: '0 0 2px', fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>
                We read your CV — which of these do you actually want to be found for?
              </p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#64748B', lineHeight: 1.5 }}>
                Tap the ones that fit. Leave out anything you have moved on from — this is
                about the work you want next, not everything you have ever done.
              </p>
            </div>
            <button type="button" onClick={dismiss} aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2, lineHeight: 0 }}>
              <Ico name="x" size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {suggested.map(s => (
              <button key={s} type="button" disabled={saving} onClick={() => toggle(s)}
                aria-pressed={chosen.has(s)} style={chip(chosen.has(s))}>
                {s}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" onClick={save} disabled={saving || chosen.size === 0}
              style={{
                border: '1px solid #0F172A',
                background: chosen.size === 0 ? '#94A3B8' : '#0F172A',
                borderColor: chosen.size === 0 ? '#94A3B8' : '#0F172A',
                color: chosen.size === 0 ? '#fff' : '#FFE500',
                borderRadius: 8, padding: '9px 16px', fontSize: '0.85rem', fontWeight: 600,
                cursor: saving || chosen.size === 0 ? 'default' : 'pointer', minHeight: 40,
              }}>
              {saving ? 'Saving…' : chosen.size === 0 ? 'Pick at least one' : `Save ${chosen.size}`}
            </button>
            <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
              {suggested.length} found in your CV
            </span>
          </div>
        </>
      )}
    </div>
  )
}
