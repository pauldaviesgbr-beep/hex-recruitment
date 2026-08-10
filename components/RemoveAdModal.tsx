'use client'

import { useEffect, useRef, useState } from 'react'

// Confirm step for taking a live advert off the public board.
//
// WHY A MODAL AND NOT window.confirm, WHICH /my-jobs USES FOUR TIMES.
//
// The other four are same-shape reversals a browser dialog can describe in one
// line. This one needs to say three separate things — it leaves the board now,
// the applications already received are untouched, and it can be put back — and
// a native confirm renders that as an unstyled wall of text under the site's
// own hostname, which reads like a browser warning rather than the product
// asking a question. It also cannot show WHICH advert is about to go, and the
// control is reached from a per-row kebab where picking the wrong row is the
// realistic mistake. So the advert's title is in the dialog.
//
// Deliberately NOT styled as a danger/delete action. Nothing is deleted, and
// dressing a reversible archive up in red teaches employers to fear a button
// they should be using freely.

interface RemoveAdModalProps {
  jobTitle: string
  /**
   * How many people have applied. NULL means "not known yet" and is NOT the
   * same as zero — a count is a claim, and the one thing this dialog must never
   * do is state a number it has not read. Unknown falls back to saying nothing
   * about applications, which is the safe direction: a missing true sentence
   * costs less than a confident wrong one.
   */
  applicationCount?: number | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export default function RemoveAdModal({ jobTitle, applicationCount, onCancel, onConfirm }: RemoveAdModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus lands on Cancel, not Remove — the safe option is the one under the
  // finger when the dialog opens, and Enter on an unread dialog then does nothing.
  useEffect(() => { cancelRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      // Stay open on failure. Closing on an error is how "it didn't work" gets
      // read as "it worked" — the row would still be listed and the employer
      // would have no idea whether to try again.
      setError(err instanceof Error ? err.message : 'Could not remove the advert. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Same safe-area-inset envelope as the pipeline modals — iOS notch and
        // dynamic browser chrome.
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
        aria-labelledby="remove-ad-title"
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 480,
          width: '100%',
          maxHeight: '100%',
          overflowY: 'auto',
          padding: '1.5rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="remove-ad-title" style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
          Remove this advert?
        </h2>

        <p style={{ margin: '0 0 1rem', color: '#334155', lineHeight: 1.5 }}>
          <strong style={{ color: '#0F172A' }}>{jobTitle}</strong> will come off the public job
          board straight away, and candidates will no longer be able to find it or apply.
        </p>

        <ul style={{ margin: '0 0 1.25rem', paddingLeft: '1.15rem', color: '#334155', lineHeight: 1.6 }}>
          {/* Only when there is a number AND it is above zero. An advert nobody
              has applied to needs no reassurance about applications, and a
              sentence about "0 people" reads as a bug. */}
          {typeof applicationCount === 'number' && applicationCount > 0 && (
            <li>
              <strong style={{ color: '#0F172A' }}>
                {applicationCount === 1
                  ? '1 person has applied to this ad'
                  : `${applicationCount} people have applied to this ad`}
              </strong>
              {applicationCount === 1
                ? ' — their application will be kept, and your pipeline is unchanged.'
                : ' — their applications will be kept, and your pipeline is unchanged.'}
            </li>
          )}
          {/* ONE sentence, true on every surface it can be read from. It used to
              say "with Reactivate in the same menu", which is written from the
              /my-jobs kebab and means nothing on the edit form — where it was
              being displayed. Naming the destination rather than the control
              survives being read from anywhere. */}
          <li>You can restore it any time from the <strong>Archived</strong> tab in My Jobs.</li>
        </ul>

        {error && (
          <p role="alert" style={{ margin: '0 0 1rem', padding: '0.65rem 0.8rem', borderRadius: 8, background: '#FEF2F2', color: '#991B1B', lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        {/* Wraps rather than scrolls: a control row that runs off the edge hides
            a whole button, and one of these two is the way out of the dialog. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#fff',
              color: '#0F172A',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: 8,
              border: '1px solid #0F172A',
              background: busy ? '#64748B' : '#0F172A',
              color: '#fff',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Removing…' : 'Remove ad'}
          </button>
        </div>
      </div>
    </div>
  )
}
