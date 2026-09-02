'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Ico } from '@/components/icons'
import styles from './ReportControl.module.css'

// BLOCK AND UNBLOCK THE OTHER PERSON IN A CONVERSATION.
//
// ── THE CONTROL IS NOT WHERE THE BLOCK IS ENFORCED ───────────────────────
//
// This writes a row to `user_blocks`. What actually STOPS the messages is one
// clause in the `messages` INSERT policy:
//
//     and (not is_blocked_in_conversation(conversation_id))
//
// TEN places in this codebase insert into `messages` — the messages page twice,
// the applications page, temp-work twice, DeclineModal, DeclineOfferModal,
// MakeOfferModal, ScheduleInterviewModal and WithdrawModal. Ten call sites is
// ten chances to miss one, and a block that works on nine of them is worse than
// none: the person believes they are protected. Enforcing at the database
// covers all ten, both directions, and every call site added later, without
// touching any of them.
//
// SO DO NOT ADD A CHECK HERE AND CALL IT THE BLOCK. This component only
// records the intent.
//
// ── IT STOPS BOTH PEOPLE, INCLUDING THE BLOCKER ──────────────────────────
//
// `is_blocked_in_conversation` is true if EITHER participant has blocked the
// other, so one row closes the thread in both directions. That is deliberate:
// a block that only silences the other person is a MUTE, and leaves the two
// sharing a thread one of them can keep writing into. The copy below says so,
// because a person choosing to block should know they are closing the
// conversation rather than hiding it.

// ── THE GLYPH WAS THE REPORT CONTROL'S, AND SO WAS THE STYLING ───────────
//
// Until 1 Sept 2026 this rendered `<Ico name="flag">` — the SAME icon as
// ReportControl, drawn from the same Lucide path, sitting immediately beside
// it in the conversation header. Read off the live page, the two path strings
// were byte-identical. It also used `ReportControl.module.css`'s `.trigger`,
// so it wore the report control's styling as well as its glyph.
//
// TWO IDENTICAL ICONS SIDE BY SIDE IS HOW SOMEBODY BLOCKS AN EMPLOYER WHEN
// THEY MEANT TO REPORT THEM, and the person reaching for either is by
// definition already upset. One of the two is destructive and reversible only
// by finding the same control again.
//
// A SOURCE GREP COULD NOT HAVE FOUND THIS. Both are `<Ico name="…"/>` with
// different names in the file; whether the names resolve to different drawings
// is a question only the rendered DOM answers. It was found by reading the
// SVGs off a driven page.
//
// `ban` is the circle-and-slash — the conventional block mark, and about as
// far from a flag as the set goes.
export default function BlockControl({
  conversationId,
  otherUserId,
  otherName,
  onChange,
  className,
  iconOnly = false,
}: {
  conversationId: string
  otherUserId: string
  otherName: string
  onChange?: (blocked: boolean) => void
  className?: string
  iconOnly?: boolean
}) {
  const [blocked, setBlocked] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // NULL UNTIL ASKED, so the button does not flicker from "Block" to
  // "Unblock" — telling someone they have not blocked a person they have is a
  // wrong statement about their own safety, even for one render.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data, error: qErr } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', session.user.id)
        .eq('blocked_id', otherUserId)
        .maybeSingle()
      // A failed lookup leaves it NULL rather than guessing "not blocked".
      if (!cancelled && !qErr) setBlocked(!!data)
    }
    load()
    return () => { cancelled = true }
  }, [otherUserId])

  const apply = async (next: boolean) => {
    setWorking(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Please sign in.'); setWorking(false); return }
      if (next) {
        const { error: e } = await supabase.from('user_blocks')
          .insert({ blocker_id: session.user.id, blocked_id: otherUserId })
        if (e && e.code !== '23505') throw e   // 23505: already blocked, fine
      } else {
        const { error: e } = await supabase.from('user_blocks')
          .delete().eq('blocker_id', session.user.id).eq('blocked_id', otherUserId)
        if (e) throw e
      }
      setBlocked(next)
      setOpen(false)
      onChange?.(next)
    } catch (e: any) {
      setError(e?.message || 'That did not work. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  if (blocked === null) return null

  // ONE LABEL, USED BY THE VISIBLE TEXT AND BY THE ACCESSIBLE NAME. Two pieces
  // of state that must agree need one path that sets both — an icon-only
  // control whose aria-label says "Block" while its action unblocks is a
  // confidently wrong statement about somebody's own safety.
  const label = blocked ? `Unblock ${otherName}` : `Block ${otherName}`

  return (
    <>
      <button
        type="button"
        className={className || styles.trigger}
        onClick={() => (blocked ? apply(false) : setOpen(true))}
        disabled={working}
        data-block-control={blocked ? 'blocked' : 'open'}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        {iconOnly
          ? <Ico name="ban" size={20} />
          : <><Ico name="ban" size={16} /> {label}</>}
      </button>

      {open && (
        <div className={styles.backdrop} role="presentation" onClick={() => setOpen(false)}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="blockControlTitle"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="blockControlTitle" className={styles.title}>Block {otherName}?</h2>
            <p className={styles.body}>
              Neither of you will be able to send any more messages in this conversation.
              The messages already here stay. You can undo this at any time.
            </p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => apply(true)}
                disabled={working}
              >
                {working ? 'Blocking…' : `Block ${otherName}`}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setOpen(false)}
                disabled={working}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
