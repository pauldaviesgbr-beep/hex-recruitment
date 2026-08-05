import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseNotice,
  markFlipped,
  flipBlocker,
  canFlip,
  type CandidateNoticeRow,
  type FlipBlocker,
} from '@/lib/discoverabilityNotice'

// STEP TWO of notify-then-flip: actually make the profiles visible.
//
// Every condition lives in lib/discoverabilityNotice.flipBlocker, and it is
// fail-closed — a row is flipped only when it is provably: hidden, still worth
// showing, notified, not opted out, not already flipped, and past its own
// stored deadline. Anything unexpected blocks. Wrongly flipping somebody is a
// privacy breach; wrongly skipping them leaves them exactly as they are.
//
// Deliberately separate from the notice route so the 14 days cannot be
// collapsed by one careless call, and dry-run by default for the same reason.
//
// POST { mode: 'dry-run' | 'flip', confirm: 'FLIP' } — for a human at a keyboard.
// GET                                               — for the scheduler. See below.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SELECT = 'user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const live = body?.mode === 'flip'
  if (live && body?.confirm !== 'FLIP') {
    return NextResponse.json(
      { error: "mode 'flip' also requires confirm:'FLIP' — refusing to change visibility without it" },
      { status: 400 },
    )
  }

  return performFlip(live, 'manual')
}

/**
 * THE SCHEDULED ENTRY POINT.
 *
 * Vercel crons fire a GET. This route used to export POST only, so adding it to
 * vercel.json would have produced a 405 every day — and A 405 IN A CRON LOG
 * LOOKS EXACTLY LIKE A CRON THAT RAN. Green tick, regular schedule, nothing
 * happening, found out on the day eight people did not become visible. Measured
 * before it was believed: GET returned 405, and the GET on the notice route
 * beside it returned 200.
 *
 * WHY THERE IS NO confirm:'FLIP' HERE, and why that is not a weakening. That
 * guard exists so a human's mistyped POST cannot mass-flip. A line in
 * vercel.json is not a typo — it is committed, reviewed and dated. The real
 * safety property is the per-row gate in flipBlocker, which is fail-closed and
 * RE-EVALUATED AT WRITE TIME: opted-out, nothing-to-show and
 * already-discoverable are all checked again at the moment of the update, not
 * at notice time.
 *
 * DAILY RATHER THAN ON ONE DATE, which sounds more dangerous and is the
 * opposite. Every candidate carries their own stored deadlineAt and is blocked
 * as 'window-open' until it passes, so a daily run flips each person on their
 * own deadline and nobody else's. A single-date cron is a one-shot with no
 * retry: if that one invocation fails, nothing happens, nobody is told, and the
 * people who were promised that date watch it pass in silence — which is the
 * fault this whole exercise exists to repair.
 *
 * Still behind CRON_SECRET. Vercel sends it as a bearer token automatically
 * when the variable is set, and a flip anyone could fire by visiting a URL
 * would be a different thing entirely.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  return performFlip(true, 'scheduled')
}

async function performFlip(live: boolean, trigger: 'manual' | 'scheduled') {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase.from('candidate_profiles').select(SELECT)
  if (error) {
    // No column means no proof anybody was ever notified, and this route must
    // never flip on an assumption. Fail rather than degrade.
    const missing = error.code === '42703' || /discoverability_notice/.test(error.message || '')
    return NextResponse.json(
      { error: missing ? 'candidate_profiles.discoverability_notice does not exist — nobody can have been notified, so there is nothing to flip.' : error.message },
      { status: missing ? 409 : 500 },
    )
  }

  const rows = (data || []) as unknown as CandidateNoticeRow[]
  const now = new Date()

  const ready = rows.filter(r => canFlip(r, now))
  const blocked: Record<FlipBlocker, number> = {
    'not-notified': 0, 'opted-out': 0, 'window-open': 0,
    'already-flipped': 0, 'already-discoverable': 0, 'nothing-to-show': 0,
  }
  for (const r of rows) {
    const b = flipBlocker(r, now)
    if (b) blocked[b] += 1
  }

  const summary = {
    mode: live ? 'flip' : 'dry-run',
    trigger,
    at: now.toISOString(),
    candidatesTotal: rows.length,
    readyToFlip: ready.length,
    blocked,
  }

  if (!live) {
    return NextResponse.json({
      ...summary,
      wouldFlip: ready.map(r => ({
        email: r.email,
        name: r.full_name,
        deadlineWas: parseNotice(r.discoverability_notice).deadlineAt,
      })),
      flipped: 0,
      note: 'Dry run — nobody\'s visibility was changed.',
    })
  }

  // The audit trail Paul asked for: who was flipped and when, one line each.
  const flipped: { userId: string; email: string | null; at: string }[] = []
  const failures: { userId: string; error: string }[] = []

  for (const row of ready) {
    const notice = markFlipped(parseNotice(row.discoverability_notice), now)
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ is_discoverable: true, discoverability_notice: notice })
      .eq('user_id', row.user_id)
      // Re-assert the precondition at write time so a candidate who flips their
      // own toggle mid-run isn't overwritten by a stale read.
      .eq('is_discoverable', false)

    if (writeError) {
      failures.push({ userId: row.user_id, error: writeError.message })
      continue
    }
    flipped.push({ userId: row.user_id, email: row.email, at: notice.flippedAt! })
    console.log(`[discoverability-flip] flipped ${row.user_id} (${row.email}) at ${notice.flippedAt}`)
  }

  // THE RECEIPT, AND IT PRINTS EVEN WHEN NOTHING HAPPENED.
  //
  // A daily cron nobody reads is fine until the day you need to know whether it
  // ran. "flipped 0" and no line at all look identical in a log, and one of them
  // means the schedule is dead — the same failure as the 405 that this handler
  // exists to avoid. So there is exactly one line per invocation, it names the
  // trigger, and it carries the blocked breakdown so a zero can be read as
  // "nobody was due" rather than "nothing works".
  console.log(
    `[discoverability-flip] ${trigger} run at ${summary.at} — flipped ${flipped.length}` +
    `${failures.length ? `, ${failures.length} FAILED` : ''}` +
    ` (of ${rows.length} candidates; blocked: ` +
    Object.entries(blocked).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') +
    ')',
  )

  return NextResponse.json({ ...summary, flipped: flipped.length, flippedRows: flipped, failures })
}
