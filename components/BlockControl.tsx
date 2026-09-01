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

export default function BlockControl({
  conversationId,
  otherUserId,
  otherName,
  onChange,
}: {
  conversationId: string
  otherUserId: string
  otherName: string
  onChange?: (blocked: boolean) => void
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

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => (blocked ? apply(false) : setOpen(true))}
        disabled={working}
        data-block-control={blocked ? 'blocked' : 'open'}
      >
        <Ico name="flag" size={16} /> {blocked ? `Unblock ${otherName}` : `Block ${otherName}`}
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
