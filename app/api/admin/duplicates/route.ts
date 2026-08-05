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

  return NextResponse.json({ groups: items, heldCount, groupsAwaitingReview: awaiting })
}

/** POST { userId, verdict: 'different' | 'same' } */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return new Response('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const userId = typeof body?.userId === 'string' ? body.userId : null
  const verdict = body?.verdict === 'different' || body?.verdict === 'same' ? body.verdict : null
  if (!userId || !verdict) {
    return NextResponse.json({ error: "need userId and verdict:'different'|'same'" }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: row, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, full_name, is_discoverable, duplicate_hold')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'no such candidate' }, { status: 404 })

  const next = markReviewed(parseHold(row.duplicate_hold), verdict)

  // "Different people" releases AND stamps reviewedAt, so this pair is never
  // held again — the row can no longer expire, because a decision outranks a
  // timer. "Same person" leaves it hidden, and only because a human said so.
  const update: Record<string, unknown> = { duplicate_hold: next }
  if (verdict === 'different') update.is_discoverable = true
  if (verdict === 'same') update.is_discoverable = false

  const { error: writeError } = await supabase
    .from('candidate_profiles').update(update).eq('user_id', userId)
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })

  console.log(`[duplicates] ${admin} marked ${userId} as "${verdict}" (key "${nameMatchKey(row.full_name as string)}")`)
  return NextResponse.json({ ok: true, userId, verdict, isDiscoverable: update.is_discoverable })
}
