// MARCUS'S WORK HISTORY, WRITTEN IN THE SHAPE THE APP ACTUALLY READS.
//
//   npx tsx scripts/fix-marcus-work-history.ts --apply
//
// Dry run without --apply. Touches ONE account: the Apple review
// credential, and nothing else.
//
// ── WHY THIS IS A FIXTURE FIX AND NOT A PRODUCT FIX ──────────────────────
//
// Paul filmed "Role not specified" three times on Marcus's profile while the
// CV Builder showed all three titles, and read it as the two-career-stores
// item. IT IS NOT. Both stores are FULL. `candidate_profiles.work_history`
// holds the titles under the key `title`, and app/profile/page.tsx reads
// `exp.role` — so it renders its fallback. The dates miss for the same
// reason: the fixture uses `from`/`to`, the page reads
// `start_date`/`end_date`.
//
// MEASURED BEFORE CHANGING ANYTHING: of six candidates with a work history,
// FIVE use role/start_date/end_date — the shape the app itself writes — and
// exactly ONE uses title/from/to. That one is Marcus, hand-seeded. So the
// product is correct for every real candidate and the fixture is the fault.
//
// WHICH IS WHY NO FALLBACK IS BEING ADDED. `exp.role || exp.title` would fix
// the screen and hide the fact that something wrote the wrong shape — and a
// value that is never empty cannot be distinguished from a value that is
// real. The wrong shape should stay loud; scripts/prove-work-history-shape
// is the guard, and it would have caught this on the day it was seeded.
//
// AND IT FIXES THE "PRESENT x3" AT THE SAME TIME, from one cause: the CV
// Builder derives `current: !w.end_date` and reads `w.start_date`. With the
// fixture's `from`/`to` those are undefined, so every position rendered as
// current with no dates. Canonical keys give it real dates to read.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

// THE APPLE REVIEW CREDENTIAL. Named as a constant so this script can never
// be pointed at anybody else by an argument.
const MARCUS = '4ba92141-677d-4422-91cf-9b6f4e0067ca'
const MARCUS_EMAIL = 'pauldavies.gbr+applereview@gmail.com'

// Same three jobs, same order, same employers — only the KEYS and the dates
// change. The dates come from the fixture's own from/to, which were right
// and simply unreadable: 2024-present, 2021-2024, 2019-2021.
const WORK_HISTORY = [
  {
    role: 'Senior Chef de Partie',
    company: 'The Bridgewater',
    start_date: '2024-02',
    end_date: '',
    description: 'Running a section on a two-rosette pass, training commis and holding standards through a full service.',
  },
  {
    role: 'Chef de Partie',
    company: 'Ardwick House Hotel',
    start_date: '2021-06',
    end_date: '2024-01',
    description: 'Section chef across larder and sauce in a busy hotel kitchen, covering banqueting and à la carte.',
  },
  {
    role: 'Commis Chef',
    company: 'Northern Quarter Kitchen',
    start_date: '2019-09',
    end_date: '2021-05',
    description: 'First kitchen role — prep, mise en place and service support across all sections.',
  },
]

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
}

async function main() {
  // GUARD: the uid and the address must agree before anything is written.
  const { data: who } = await admin.auth.admin.getUserById(MARCUS)
  check('the uid is the Apple review credential', who?.user?.email === MARCUS_EMAIL,
    who?.user?.email ?? 'not found')
  if (bad) { console.log('\nrefusing to write'); process.exit(1) }

  const { data: before } = await admin.from('candidate_profiles')
    .select('work_history').eq('user_id', MARCUS).single()
  console.log('')
  console.log('BEFORE — keys per entry:')
  for (const e of (before?.work_history ?? [])) console.log('   ' + Object.keys(e).join(', '))

  if (!APPLY) {
    console.log('')
    console.log('DRY RUN. Re-run with --apply to write.')
    process.exit(0)
  }

  const { error } = await admin.from('candidate_profiles')
    .update({ work_history: WORK_HISTORY }).eq('user_id', MARCUS)
  check('work_history written', !error, error?.message ?? '')

  // THE CV STORE TOO, so the two agree — which is what Paul asked for, and
  // it is what kills the "Present x3": real dates, and current only on the
  // one job that is actually current.
  const { data: cvRow } = await admin.from('candidate_cvs')
    .select('id, cv_data').eq('user_id', MARCUS)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (cvRow) {
    const cv = cvRow.cv_data as Record<string, unknown>
    cv.workExperience = WORK_HISTORY.map((w, i) => ({
      id: `pre-${i}`,
      jobTitle: w.role,
      company: w.company,
      startDate: w.start_date,
      endDate: w.end_date,
      current: !w.end_date,
      description: w.description,
    }))
    const { error: cvErr } = await admin.from('candidate_cvs')
      .update({ cv_data: cv }).eq('id', cvRow.id)
    check('cv_data written to match', !cvErr, cvErr?.message ?? '')
  } else {
    check('a CV row exists to update', false, 'none found')
  }

  // ── PROVE THE END STATE FROM THE ROWS, not from the write returning ok ──
  const { data: after } = await admin.from('candidate_profiles')
    .select('work_history').eq('user_id', MARCUS).single()
  const wh = (after?.work_history ?? []) as Array<Record<string, string>>
  console.log('')
  check('three entries', wh.length === 3, `${wh.length}`)
  check('every entry carries a role the profile page can read',
    wh.every(e => typeof e.role === 'string' && e.role.length > 0),
    wh.map(e => e.role).join(' / '))
  check('none carries the old `title` key', wh.every(e => !('title' in e)), '')
  check('every entry has a start_date', wh.every(e => !!e.start_date),
    wh.map(e => `${e.start_date}→${e.end_date || 'present'}`).join('  '))
  check('exactly ONE is current — not three',
    wh.filter(e => !e.end_date).length === 1, `${wh.filter(e => !e.end_date).length} current`)

  const { data: cvAfter } = await admin.from('candidate_cvs')
    .select('cv_data').eq('user_id', MARCUS)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  const we = ((cvAfter?.cv_data as Record<string, unknown>)?.workExperience ?? []) as Array<Record<string, unknown>>
  check('the CV store agrees on all three titles',
    we.length === 3 && we.every((e, i) => e.jobTitle === WORK_HISTORY[i].role), '')
  check('…and only one is marked current there too',
    we.filter(e => e.current).length === 1, `${we.filter(e => e.current).length}`)

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'both stores agree, in the shape the app reads')
  process.exit(bad ? 1 : 0)
}

main()
