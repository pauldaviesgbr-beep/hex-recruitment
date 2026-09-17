// THE QUALIFIER IS EARNED, PER ADVERT — AND OVER-APPLYING IS THE REAL RISK.
//
// "including service charge" on an advert whose stored figure IS the base is a
// NEW false statement, and it understates the job. That is worse than saying
// nothing, because saying nothing is what we do today. So this check fails in
// that direction first and loudest.
//
// THREE THINGS IT ASSERTS:
//   1. the decision function itself, against fixtures an encoder cannot fudge
//   2. against the LIVE board: no advert whose stored figure equals its quoted
//      figure is qualified, and every advert whose stored figure is above it is
//   3. THE ZERO-GUARD. If the recompute matches NOTHING, this fails rather than
//      reporting agreement with an empty set — the same guard reportcontrol:prove
//      and rtw:prove carry, and for the same reason: a discriminator that stops
//      matching is indistinguishable from a world with nothing to find.
//
// IT RECOMPUTES FROM `benefits` RATHER THAN TRUSTING A STORED VALUE, so when
// the flag column eventually lands, drift between the column and the adverts
// goes red instead of silent.
//
// The live half needs the database and SKIPS with exit 2 without it, exactly as
// erasurelive:prove does. The fixture half always runs, so this is never a
// check that can only ever be green on a machine that cannot see anything.

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  quotedBaseFrom,
  salaryIncludesServiceCharge,
  salaryQualifier,
  withSalaryQualifier,
  SERVICE_CHARGE_QUALIFIER,
} from '../lib/salaryQualifier'

let failures = 0
function check(label: string, pass: boolean, detail: string) {
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(64)} ${detail}`)
}

// ── 1. the decision, on fixtures ────────────────────────────────────────────
// Real Goldenkeys wordings, copied from live adverts rather than invented.
const FOLDED = { salary_min: 52000, salary_max: 52000, benefits: ['£45,000 per annum plus £7,000 service charge. Live in accommodation available.'] }
const BASE_ONLY = { salary_min: 45000, salary_max: 45000, benefits: ['£45,000 per annum. Meals on duty.'] }
const NO_FIGURE = { salary_min: 48000, salary_max: 48000, benefits: ['Meals on duty. 28 days holiday.'] }
const NO_BENEFITS = { salary_min: 60000, salary_max: 80000, benefits: null }
const RENT_DECOY = { salary_min: 45000, salary_max: 45000, benefits: ['£45,000 per annum. Live-in available for £300 per month.'] }

check('a folded figure earns the qualifier', salaryIncludesServiceCharge(FOLDED) === true, String(salaryQualifier(FOLDED)))
check('a base-only figure does NOT — the over-application case', salaryIncludesServiceCharge(BASE_ONLY) === false, String(salaryQualifier(BASE_ONLY)))
check('benefits with no £ figure do NOT', salaryIncludesServiceCharge(NO_FIGURE) === false, String(salaryQualifier(NO_FIGURE)))
check('no benefits text at all does NOT — this is where Host lands', salaryIncludesServiceCharge(NO_BENEFITS) === false, String(salaryQualifier(NO_BENEFITS)))
check('a £300 rent is not mistaken for the base', quotedBaseFrom(RENT_DECOY.benefits) === 45000, String(quotedBaseFrom(RENT_DECOY.benefits)))
check('the higher number stays the number', withSalaryQualifier('£52,000 / year', FOLDED) === `£52,000 / year ${SERVICE_CHARGE_QUALIFIER}`, String(withSalaryQualifier('£52,000 / year', FOLDED)))
check('an unearned advert is returned untouched', withSalaryQualifier('£45,000 / year', BASE_ONLY) === '£45,000 / year', String(withSalaryQualifier('£45,000 / year', BASE_ONLY)))
check('a null figure stays null', withSalaryQualifier(null, FOLDED) === null, 'null')

// ── 2. the live board ───────────────────────────────────────────────────────
// Same idiom as prove-erasure-live: verify does not load .env.local for us, so
// a check that only reads process.env SKIPS on every machine and every push —
// and a permanent NOT VERIFIED is a red nobody reads.
const fileEnv: Record<string, string> = {}
const envPath = path.join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) fileEnv[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = fileEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = fileEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !KEY) {
  console.log('\n  SKIP  no Supabase credentials — the fixture half above still ran.')
  process.exit(failures ? 1 : 2)
}

async function main() {
const supabase = createClient(URL!, KEY!)
const { data, error } = await supabase
  .from('jobs')
  .select('id, title, company, salary_min, salary_max, benefits')
  .eq('status', 'active')

if (error) {
  console.log(`\n  FAIL  could not read the board: ${error.message}`)
  process.exitCode = 1
  return
}

const rows = data ?? []
const earned = rows.filter(r => salaryIncludesServiceCharge(r))
const quotedEqual = rows.filter(r => {
  const q = quotedBaseFrom(r.benefits)
  return q !== null && Number(r.salary_min) === q
})
const unreadable = rows.filter(r => quotedBaseFrom(r.benefits) === null)

console.log(`\n  live board: ${rows.length} adverts — ${earned.length} earn the qualifier, ` +
            `${quotedEqual.length} quote their own figure, ${unreadable.length} carry no figure to read`)

// THE ZERO-GUARD. A recompute that matches nothing is a broken discriminator,
// not a clean board, and it must never be reported as agreement.
check('the recompute matches SOMETHING — zero-guard', earned.length > 0, `${earned.length} earned`)
check('...and does not match EVERYTHING', earned.length < rows.length, `${rows.length - earned.length} not earned`)

// THE DIRECTION THAT MATTERS: nothing whose stored figure equals its quoted
// figure may carry the qualifier.
const wronglyQualified = quotedEqual.filter(r => salaryQualifier(r) !== null)
check('NO advert quoting its own figure is qualified — over-application',
  wronglyQualified.length === 0,
  wronglyQualified.length === 0 ? 'none' : wronglyQualified.map(r => String(r.title).slice(0, 34)).join(', '))

// ...and nothing unreadable is qualified either.
const unreadableQualified = unreadable.filter(r => salaryQualifier(r) !== null)
check('NO advert without a readable figure is qualified',
  unreadableQualified.length === 0,
  unreadableQualified.length === 0 ? 'none' : `${unreadableQualified.length} wrongly qualified`)

// HOST SPECIFICALLY, while Adrian's answer is outstanding.
const host = rows.filter(r => r.company === 'Host Staffing')
const hostQualified = host.filter(r => salaryQualifier(r) !== null)
check('NO Host advert is qualified — the question is still open',
  hostQualified.length === 0, `${host.length} Host adverts, ${hostQualified.length} qualified`)

// The other direction, stated so a silent under-application also shows.
const missed = rows.filter(r => {
  const q = quotedBaseFrom(r.benefits)
  return q !== null && Number(r.salary_min) > q && salaryQualifier(r) === null
})
check('every advert above its quoted figure IS qualified', missed.length === 0,
  missed.length === 0 ? 'none missed' : `${missed.length} missed`)

console.log(failures === 0
  ? '\nthe qualifier is earned per advert, and nothing wears it that has not earned it'
  : `\n${failures} FAILED`)
process.exitCode = failures ? 1 : 0
}

main().catch(err => { console.error(err); process.exitCode = 1 })
