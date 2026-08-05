import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseHold, markReleased, shouldRelease, HOLD_WINDOW_DAYS } from '@/lib/duplicateHold'

// THE FAIL-OPEN, RUNNING.
//
// A profile held as a possible duplicate is hidden. If nobody reviews it within
// HOLD_WINDOW_DAYS it releases ITSELF and records that nobody looked.
//
// That is the design rather than a tidy-up: a duplicate on the board is
// cosmetic and reversible, while a real person hidden indefinitely because no
// one got round to it is the fault that cost nine candidates ten days of an
// opt-out button wired to nothing. A hold that can outlive attention is that,
// rebuilt on purpose.
//
// GET for the scheduler, because Vercel crons fire GETs — the flip route
// exported POST only and a schedule added to it would have 405'd every day,
// which in a cron log looks exactly like a cron that ran. Measured that day,
// not assumed.
//
// AND IT PRINTS ONE LINE PER INVOCATION INCLUDING THE ZEROES. "released 0" and
// no line at all look identical, and one of them means the schedule is dead.
// From tomorrow, the ABSENCE of a daily line is itself information.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function run(live: boolean) {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, email, full_name, is_discoverable, duplicate_hold')
    .not('duplicate_hold', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const now = new Date()
  const due = rows.filter(r => shouldRelease(parseHold(r.duplicate_hold), now))

  const counts = {
    withHoldRecord: rows.length,
    heldNow: rows.filter(r => { const h = parseHold(r.duplicate_hold); return h.heldAt && !h.reviewedAt && !h.releasedAt }).length,
    reviewed: rows.filter(r => parseHold(r.duplicate_hold).reviewedAt).length,
    alreadyReleased: rows.filter(r => parseHold(r.duplicate_hold).releasedAt).length,
    dueNow: due.length,
  }

  if (!live) {
    return NextResponse.json({
      mode: 'dry-run', at: now.toISOString(), holdWindowDays: HOLD_WINDOW_DAYS, ...counts,
      wouldRelease: due.map(r => ({ email: r.email, heldAt: parseHold(r.duplicate_hold).heldAt })),
      released: 0,
      note: 'Dry run — nobody released, nothing written.',
    })
  }

  const released: string[] = []
  const failed: { userId: string; error: string }[] = []
  for (const row of due) {
    const next = markReleased(parseHold(row.duplicate_hold), now)
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ is_discoverable: true, duplicate_hold: next })
      .eq('user_id', row.user_id)
    if (writeError) { failed.push({ userId: row.user_id as string, error: writeError.message }); continue }
    released.push(row.user_id as string)
    console.log(`[duplicate-release] ${row.user_id} released UNREVIEWED after ${HOLD_WINDOW_DAYS} days — nobody looked`)
  }

  // THE RECEIPT, and it prints on a zero.
  console.log(
    `[duplicate-release] scheduled run at ${now.toISOString()} — released ${released.length}` +
    `${failed.length ? `, ${failed.length} FAILED` : ''}` +
    ` (held ${counts.heldNow}, reviewed ${counts.reviewed}, already released ${counts.alreadyReleased})`,
  )

  return NextResponse.json({
    mode: 'release', at: now.toISOString(), holdWindowDays: HOLD_WINDOW_DAYS, ...counts,
    released: released.length, releasedIds: released, failed,
  })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  return run(true)
}

/** Dry-run by default for a human at a keyboard; 'release' to act. */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const body = await req.json().catch(() => ({} as any))
  return run(body?.mode === 'release')
}
