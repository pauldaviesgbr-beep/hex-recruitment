import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nameMatchKey, markHeld } from '@/lib/duplicateHold'

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
 * FAILURE IS SILENT AND SAFE. If the lookup errors we return null and the
 * profile is created exactly as it is today: visible, unheld. A duplicate
 * slipping through is cosmetic; a signup that fails because the duplicate
 * check broke is not.
 */
export async function applyDuplicateHold(
  admin: SupabaseClient,
  userId: string,
  fullName: string | null | undefined,
): Promise<{ heldAgainst: string } | null> {
  const key = nameMatchKey(fullName)
  // Single-word and initials-only names produce no key on purpose. Seven rows
  // on the board are in that state and can duplicate freely — a known blind
  // spot, and the right trade: "Adnan" matching every other Adnan hides real
  // people, and a missed duplicate only looks untidy.
  if (!key) return null

  try {
    const { data, error } = await admin
      .from('candidate_profiles')
      .select('user_id, full_name')
      .neq('user_id', userId)
    if (error || !data) return null

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
    return null
  }
}
