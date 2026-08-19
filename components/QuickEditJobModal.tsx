'use client'

import { useEffect, useRef, useState } from 'react'

// EDIT AN ADVERT WITHOUT LEAVING THE LIST.
//
// "Edit job" used to push to /post-job?edit=<id> — the whole posting wizard —
// so changing a salary meant leaving the page, loading a multi-step form, and
// finding your way back. For an agency changing salaries and briefs all week
// that is the difference between a tool they use and one they avoid.
//
// WHY A SUBSET OF THE FIELDS, AND NOT ALL OF THEM. These five are what changes
// on a live role: the title, where it is, what it pays, and the pitch. The
// rest — screening questions, benefits, logos, employment type — are set once
// when the advert is written and almost never touched. Putting all of them in
// a modal would rebuild the wizard inside a dialog and be worse than both.
//
// SO THE FULL EDITOR STAYS ONE CLICK AWAY, and is named in the dialog. Removing
// the route would be taking capability away in the name of convenience; this
// adds a fast path and keeps the complete one.
//
// NOTHING HERE TOUCHES STATUS. Closing, archiving and reactivating are separate
// actions with their own confirmations, and a status change hiding inside a
// "save" is exactly the sort of thing nobody expects.

export interface QuickEditValues {
  title: string
  location: string
  salaryMin: number
  salaryMax: number
  salaryPeriod: 'hour' | 'year'
  description: string
}

interface Props {
  job: QuickEditValues & { id: string }
  /** Resolves when the write is confirmed. Must THROW on failure — this dialog
   *  stays open on an error, because closing is how "it did not save" gets read
   *  as "it saved". */
  onSave: (id: string, values: QuickEditValues) => Promise<void>
  onCancel: () => void
  /** The full editor, for everything this dialog deliberately leaves out. */
  fullEditHref: string
}

export default function QuickEditJobModal({ job, onSave, onCancel, fullEditHref }: Props) {
  const [values, setValues] = useState<QuickEditValues>({
    title: job.title,
    location: job.location,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryPeriod: job.salaryPeriod,
    description: job.description,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<keyof QuickEditValues | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // ONE PATH SETS BOTH THE MESSAGE AND THE FIELD IT IS ABOUT, so a message can
  // never end up beside the wrong input — which is worse than one at the top,
  // because it is confidently and specifically wrong.
  const fail = (message: string, field: keyof QuickEditValues | null) => {
    setError(message); setErrorField(field)
  }

  const set = <K extends keyof QuickEditValues>(k: K, v: QuickEditValues[K]) =>
    setValues(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    setError(null); setErrorField(null)

    if (!values.title.trim()) return fail('Give the role a title.', 'title')
    if (!values.location.trim()) return fail('Say where the role is.', 'location')
    // A max below a min is not a validation nicety: six code paths annualise
    // pay before comparing, so an inverted range misfires in matching long
    // before anyone reads the advert.
    if (values.salaryMin && values.salaryMax && values.salaryMax < values.salaryMin) {
      return fail('The top of the range is below the bottom.', 'salaryMax')
    }

    setBusy(true)
    try {
      await onSave(job.id, {
        ...values,
        title: values.title.trim(),
        location: values.location.trim(),
        description: values.description.trim(),
      })
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not save. Please try again.', null)
      setBusy(false)
    }
  }

  const label: React.CSSProperties = {
    display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4,
  }
  const input = (field: keyof QuickEditValues): React.CSSProperties => ({
    // fontFamily: inherit because a <textarea> defaults to MONOSPACE while a
    // sibling <input> does not — so the description rendered in Courier next to
    // four fields in the site face. Nothing was broken; it just looked unfinished.
    width: '100%', padding: '0.55rem 0.7rem', fontSize: 14, fontFamily: 'inherit',
    border: `1px solid ${errorField === field ? '#dc2626' : '#e2e8f0'}`,
    borderRadius: 8, background: '#fff', color: '#0f172a',
  })

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      }}
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-edit-title"
        style={{
          background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%',
          maxHeight: '100%', overflowY: 'auto', padding: '1.5rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="quick-edit-title" style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
          Edit advert
        </h2>
        <p style={{ margin: '0 0 1.25rem', fontSize: 13, color: '#64748b' }}>
          Changes go live on the public advert as soon as you save.
        </p>

        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <div>
            <label style={label} htmlFor="qe-title">Job title</label>
            <input id="qe-title" ref={titleRef} style={input('title')} value={values.title}
              onChange={(e) => set('title', e.target.value)} disabled={busy} />
          </div>

          <div>
            <label style={label} htmlFor="qe-location">Location</label>
            <input id="qe-location" style={input('location')} value={values.location}
              onChange={(e) => set('location', e.target.value)} disabled={busy} />
          </div>

          {/* Controls WRAP. A row that runs off the edge on a phone hides a
              control with no affordance. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <label style={label} htmlFor="qe-min">Salary from</label>
              <input id="qe-min" type="number" inputMode="numeric" style={input('salaryMin')}
                value={values.salaryMin || ''} disabled={busy}
                onChange={(e) => set('salaryMin', Number(e.target.value) || 0)} />
            </div>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <label style={label} htmlFor="qe-max">Salary to</label>
              <input id="qe-max" type="number" inputMode="numeric" style={input('salaryMax')}
                value={values.salaryMax || ''} disabled={busy}
                onChange={(e) => set('salaryMax', Number(e.target.value) || 0)} />
            </div>
            <div style={{ flex: '1 1 130px', minWidth: 0 }}>
              <label style={label} htmlFor="qe-period">Per</label>
              <select id="qe-period" style={input('salaryPeriod')} value={values.salaryPeriod}
                disabled={busy}
                onChange={(e) => set('salaryPeriod', e.target.value as 'hour' | 'year')}>
                <option value="year">Year</option>
                <option value="hour">Hour</option>
              </select>
            </div>
          </div>

          <div>
            <label style={label} htmlFor="qe-desc">Short description</label>
            <textarea id="qe-desc" rows={5} style={{ ...input('description'), resize: 'vertical' }}
              value={values.description} disabled={busy}
              onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>

        {error && (
          <p role="alert" style={{ margin: '1rem 0 0', padding: '0.65rem 0.8rem', borderRadius: 8, background: '#FEF2F2', color: '#991B1B', lineHeight: 1.45, fontSize: 13.5 }}>
            {error}
          </p>
        )}

        <p style={{ margin: '1rem 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
          Screening questions, benefits and the rest are in the{' '}
          <a href={fullEditHref} style={{ color: '#0f172a', fontWeight: 600 }}>full editor</a>.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy}
            style={{ padding: '0.6rem 1.1rem', borderRadius: 8, border: '1px solid #0f172a', background: '#0f172a', color: '#FFE500', fontWeight: 600, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
