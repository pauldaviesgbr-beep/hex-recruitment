import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nameMatchKey, markHeld, EMPTY_HOLD, type NotCheckedReason } from '@/lib/duplicateHold'

/**
 * ONE CALL, SHARED BY ALL THREE PROFILE-CREATING PATHS.
 *
 * THE GUARD IS "FIRST INSERT ONLY", WHICH IS STRONGER THAN "a different
 * user_id". The worry is a candidate editing their own name being held against
 * themselves, and all three paths already know whether the row is new:
 *
 *   /api/profile/create        selects the row to decide is_discoverable
 *   lib/authCallback           upserts with ignoreDuplicates — insert-only by
 *                              construction, so it cannot fire on an edit
 *   /auth/callback/employee    runs on EVERY OAuth login and says so in a
 *                              comment; it selects existingProfile first
 *
 * So this is called only where that signal says "new", and a rename can never
 * trigger it — not because we compare ids, but because the code path is not
 * reached at all.
 *
 * FAILURE IS SAFE BUT NO LONGER SILENT. If the check cannot run, the profile
 * is still created exactly as before — visible, unheld — because a signup that
 * fails because the duplicate check broke is far worse than a duplicate.
 *
 * AN ERRORED LOOKUP NOW LEAVES A RECORD ON THE ROW. It used to return null
 * without a trace, so a dedup that had stopped working entirely looked
 * exactly like a dedup finding no duplicates — profile visible, unheld,
 * nothing written anywhere. The only evidence was a console line in a
 * serverless log this project cannot read back.
 *
 * THE NO-KEY PATH WRITES NOTHING, ON PURPOSE, AND THAT IS NOT THE OLD
 * SILENCE. An error is an EVENT and is unreconstructable after the fact. A
 * name with fewer than two words is a PROPERTY, still true and still readable
 * on the row today — so /admin/duplicates derives that count live from the
 * names, using this same nameMatchKey. Which means it is right on day one
 * rather than empty, it costs no write to a real candidate's row, and it
 * DROPS ON ITS OWN when somebody completes their name. A stored record would
 * have sat there for ever describing a state that no longer existed.
 *
 * THIS MATTERS MORE FROM TODAY. The design rests on "email is useless, the
 * name is all we have" (see lib/duplicateHold.ts). Sign in with Apple removes
 * the name too: it returns one ONCE, on first authorisation only, and a
 * private relay address gives nothing to fall back on. So the no-key path
 * stops being a rare edge and becomes the normal case for a whole provider.
 */
export async function applyDuplicateHold(
  admin: SupabaseClient,
  userId: string,
  fullName: string | null | undefined,
): Promise<{ heldAgainst: string } | null> {
  const key = nameMatchKey(fullName)
  // Single-word and initials-only names produce no key on purpose. A known
  // blind spot and the right trade: "Adnan" matching every other Adnan hides
  // real people, and a missed duplicate only looks untidy.
  //
  // NO RECORD IS WRITTEN HERE and the silence is only apparent: the same
  // nameMatchKey call, run over the rows, is what /admin/duplicates counts to
  // show these people. The fact is derivable, so deriving it beats storing it.
  if (!key) return null

  try {
    const { data, error } = await admin
      .from('candidate_profiles')
      .select('user_id, full_name')
      .neq('user_id', userId)
    if (error || !data) {
      await recordNotChecked(admin, userId, 'lookup-failed')
      return null
    }

    const match = data.find(r => nameMatchKey(r.full_name as string | null) === key)
    if (!match) return null

    // HELD: hidden, with an expiry that releases itself. Only ever applied to
    // the row being created — the existing profile is not touched, and is not
    // hidden, now or ever, by this code.
    const { error: writeError } = await admin
      .from('candidate_profiles')
      .update({ is_discoverable: false, duplicate_hold: markHeld(match.user_id as string) })
      .eq('user_id', userId)
    if (writeError) {
      console.error('[duplicate-hold] matched but could not hold', userId, writeError.message)
      return null
    }

    console.log(`[duplicate-hold] held ${userId} against ${match.user_id} on key "${key}"`)
    return { heldAgainst: match.user_id as string }
  } catch (e: any) {
    console.error('[duplicate-hold] lookup failed, letting the signup through', e?.message)
    await recordNotChecked(admin, userId, 'lookup-failed')
    return null
  }
}

/**
 * Stamp the row with the fact that we could not dedup it.
 *
 * ITS OWN FAILURE IS SWALLOWED, AND THAT IS NOT A CONTRADICTION. This exists
 * so an unchecked signup is visible; it must never be the reason a signup
 * fails. If even this write cannot land, the console line is all that is left
 * — which is exactly the state everything was in before.
 */
async function recordNotChecked(
  admin: SupabaseClient,
  userId: string,
  reason: NotCheckedReason,
): Promise<void> {
  try {
    const { error } = await admin
      .from('candidate_profiles')
      .update({
        duplicate_hold: {
          ...EMPTY_HOLD,
          notCheckedAt: new Date().toISOString(),
          notCheckedReason: reason,
        },
      })
      .eq('user_id', userId)
    if (error) console.error('[duplicate-hold] could not record not-checked', userId, reason, error.message)
    else console.log('[duplicate-hold] NOT CHECKED', userId, reason)
  } catch (e: any) {
    console.error('[duplicate-hold] could not record not-checked', userId, reason, e?.message)
  }
}
