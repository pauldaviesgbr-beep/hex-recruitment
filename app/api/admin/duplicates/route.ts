import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseHold, markReviewed, holdState, findDuplicateGroups, nameMatchKey,
} from '@/lib/duplicateHold'
import { isAdmin } from '@/lib/admin-client'

// The possible-duplicate list, and the two buttons.
//
// TWO KINDS OF ROW, and the difference is whether we ever hid anybody:
//
//   HELD     a new signup, hidden, with an expiry that releases it in 7 days
//   FLAGGED  an existing profile that was already visible — STILL VISIBLE, no
//            expiry, waiting on a human. Kyriaki and Rodrigue are these.
//
// NOTHING IS EVER HIDDEN RETROACTIVELY. Auto-hiding someone who has been on the
// board for a week is a regression dressed as a fix, and it lands on real
// people rather than on new signups. Detect and surface; never hide.
//
// NOTHING IS EVER DELETED. "Same person" leaves the row hidden and stamped; the
// row stays for the audit trail and for any employer who has already messaged
// it.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
  if (!token) return null
  const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data } = await anon.auth.getUser(token)
  const email = data?.user?.email || ''
  // The SAME gate the admin layout uses, imported rather than restated — a
  // second list of admin addresses is a second thing to forget to update.
  return isAdmin(email) ? email : null
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return new Response('Unauthorized', { status: 401 })
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, full_name, email, job_title, is_discoverable, created_at, duplicate_hold')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as any[]
  const groups = findDuplicateGroups(rows.map(r => ({ user_id: r.user_id, full_name: r.full_name })))
  const byId = new Map(rows.map(r => [r.user_id, r]))

  const items = groups.map(g => ({
    key: g.key,
    rows: g.rows.map(gr => {
      const r = byId.get(gr.user_id)!
      const hold = parseHold(r.duplicate_hold)
      return {
        userId: r.user_id,
        name: r.full_name,
        email: r.email,
        jobTitle: r.job_title,
        joined: r.created_at,
        isDiscoverable: r.is_discoverable,
        hold,
        // A row inside a duplicate group with no hold record of its own is
        // FLAGGED — surfaced, still visible, waiting on a decision.
        state: holdState(hold, true),
      }
    }),
  }))

  const heldCount = rows.filter(r => holdState(parseHold(r.duplicate_hold)) === 'held').length
  const awaiting = items.filter(g => g.rows.some(r => r.state === 'held' || r.state === 'flagged')).length

  // THE SIGNUPS THE CHECK COULD NOT RUN ON. These form no group by
  // construction — a row with no match key cannot share one with anybody — so
  // before this they appeared on this page nowhere, and were indistinguishable
  // from the far larger number of signups that WERE checked and found clean.
  //
  // NEWEST FIRST, because the question this answers is "has the dedup stopped
  // working", and the answer to that is at the top of the list, not the bottom.
  const notChecked = rows
    .map(r => ({ r, hold: parseHold(r.duplicate_hold) }))
    .filter(x => x.hold.notCheckedAt)
    .sort((a, b) => Date.parse(b.hold.notCheckedAt!) - Date.parse(a.hold.notCheckedAt!))
    .map(x => ({
      userId: x.r.user_id,
      name: x.r.full_name,
      email: x.r.email,
      joined: x.r.created_at,
      at: x.hold.notCheckedAt,
      reason: x.hold.notCheckedReason,
    }))

  return NextResponse.json({
    groups: items, heldCount, groupsAwaitingReview: awaiting,
    notChecked, notCheckedCount: notChecked.length,
    // Split out rather than counted together: a one-word name is an accepted
    // blind spot and an errored lookup is an incident. One number covering
    // both would go up for a reason nobody needs to act on, and then stay up.
    lookupFailures: notChecked.filter(n => n.reason === 'lookup-failed').length,
  })
}

/**
 * POST { userId, verdict: 'different' | 'same' | 'undo' }
 *
 * "DIFFERENT PEOPLE" RESOLVES THE WHOLE PAIR IN ONE CLICK. It is a statement
 * about two people, not about one row, and building it per-row meant Paul had
 * to click it twice — 1.6 seconds apart in the timestamps, which is how we
 * found out. "Same person — hide this one" stays per-row, because it names
 * which row to hide.
 *
 * UNDO EXISTS BECAUSE A DECISION NOBODY CAN UNMAKE IS WORSE THAN ONE THEY CAN.
 * A verdict permanently exempts a pair from ever being flagged again, and the
 * first mis-click happened within four minutes of the feature existing — on a
 * real candidate, recorded as "different people" when he is one man with two
 * accounts. A confirmation dialogue would have been clicked through; a way back
 * would not have been needed at all. Same argument as the seven-day fail-open.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return new Response('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const userId = typeof body?.userId === 'string' ? body.userId : null
  const verdict = ['different', 'same', 'undo'].includes(body?.verdict) ? body.verdict as 'different' | 'same' | 'undo' : null
  if (!userId || !verdict) {
    return NextResponse.json({ error: "need userId and verdict:'different'|'same'|'undo'" }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: row, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, full_name, is_discoverable, duplicate_hold')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'no such candidate' }, { status: 404 })

  // The rows this decision is ABOUT: everybody sharing the match key.
  const key = nameMatchKey(row.full_name as string)
  const { data: all } = await supabase
    .from('candidate_profiles').select('user_id, full_name, duplicate_hold')
  const pair = (all || []).filter(r => nameMatchKey(r.full_name as string) === key)

  // UNDO returns a row to unresolved. It never changes visibility: a candidate
  // hidden by "same person" stays hidden until somebody decides otherwise,
  // because un-deciding is not the same as deciding the opposite.
  if (verdict === 'undo') {
    // AN UNDO REVERSES WHATEVER THE DECISION TOUCHED — it is not per-row or
    // per-pair, it has the SAME SCOPE as the thing being undone. Making
    // "different people" resolve a pair in one write while its undo unresolved
    // one row reopened, from the other direction, exactly the mixed state the
    // pair-write had just closed.
    //
    //   undoing "different people"  -> both rows, because the verdict was
    //                                  written to both
    //   undoing "same person"       -> that row, because the verdict named it
    const undoing = parseHold(row.duplicate_hold).verdict
    const targets = undoing === 'different' ? pair : [row]

    for (const r of targets) {
      const hold = parseHold(r.duplicate_hold)
      const restored = hold.heldAt && !hold.releasedAt
        // It was HELD when it was decided, so undo puts it back to held — with
        // its ORIGINAL heldAt, so the seven days run from the real start rather
        // than being silently extended by a mis-click.
        ? { ...hold, reviewedAt: null, verdict: null }
        : null
      const { error: e } = await supabase
        .from('candidate_profiles').update({ duplicate_hold: restored }).eq('user_id', r.user_id)
      if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    }

    console.log(`[duplicates] ${admin} UNDID "${undoing}" across ${targets.length} row(s) on key "${key}"`)
    return NextResponse.json({ ok: true, verdict, undoing, rowsUndone: targets.length })
  }

  if (verdict === 'different') {
    // ONE CLICK, WHOLE PAIR. Every row sharing the key is released and stamped,
    // which also makes the contradictory state impossible rather than merely
    // handled — nobody can be left carrying "same" while their pair says
    // "different", because the pair is written together.
    const at = new Date()
    for (const r of pair) {
      const next = markReviewed(parseHold(r.duplicate_hold), 'different', at)
      const { error: e } = await supabase
        .from('candidate_profiles')
        .update({ duplicate_hold: next, is_discoverable: true })
        .eq('user_id', r.user_id)
      if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    }
    console.log(`[duplicates] ${admin} resolved the PAIR as "different" — ${pair.length} rows on key "${key}"`)
    return NextResponse.json({ ok: true, verdict, rowsResolved: pair.length })
  }

  // "Same person — hide this one" is genuinely per-row: it names which to hide.
  const next = markReviewed(parseHold(row.duplicate_hold), 'same')
  const { error: writeError } = await supabase
    .from('candidate_profiles')
    .update({ duplicate_hold: next, is_discoverable: false })
    .eq('user_id', userId)
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  console.log(`[duplicates] ${admin} marked ${userId} as "same" — hidden (key "${key}")`)
  return NextResponse.json({ ok: true, userId, verdict, isDiscoverable: false })
}
