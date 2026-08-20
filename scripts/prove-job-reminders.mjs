// WHO GETS EMAILED IS THE WHOLE RISK OF THIS FEATURE, SO IT IS THE THING
// ASSERTED.
//
// Every clause of isDueForReminder is somebody's inbox. The dangerous direction
// is a false POSITIVE — emailing an employer about a scraped listing that is
// not theirs to manage, or about an advert posted yesterday — so most of these
// prove a REFUSAL rather than an approval.
//
// The pairs matter more than the singles: a stubbed `return true` would satisfy
// every "is due" assertion and fail every "is not due" one.
//
// No network, no database, no clock of its own — `now` is passed in, so a run
// in six months gives the same answers as a run today.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = join(process.cwd(), 'scripts')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'tmp-prove-reminders-run.mts')
const mod = pathToFileURL(join(process.cwd(), 'lib', 'jobReminders.ts')).href

writeFileSync(entry, `
import { isDueForReminder, groupReminders, reminderSubject, reminderBody, MAX_ADS_LISTED }
  from ${JSON.stringify(mod)}

const out: any[] = []
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

const NOW = new Date('2026-08-20T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()

const base = {
  id: 'j1', title: 'Head Chef', status: 'active',
  posted_at: daysAgo(45), source_url: null,
  last_reminder_sent_at: null, employer_id: 'e1',
}

// ── DUE ─────────────────────────────────────────────────────────────────────
rec('a live form-posted advert 45 days old is due', () => isDueForReminder(base, NOW), true)

// ── NOT DUE, and each of these is an inbox we must not reach ────────────────
rec('a SCRAPED listing is never due',
  () => isDueForReminder({ ...base, source_url: 'https://goldenkeys.example/job/1' }, NOW), false)
rec('a closed advert is not due',
  () => isDueForReminder({ ...base, status: 'filled' }, NOW), false)
rec('an advert posted yesterday is not due',
  () => isDueForReminder({ ...base, posted_at: daysAgo(1) }, NOW), false)
rec('an advert reminded a week ago is not due again',
  () => isDueForReminder({ ...base, last_reminder_sent_at: daysAgo(7) }, NOW), false)
rec('an advert reminded 40 days ago IS due again',
  () => isDueForReminder({ ...base, last_reminder_sent_at: daysAgo(40) }, NOW), true)
rec('no posted_at means never due — we cannot say how old it is',
  () => isDueForReminder({ ...base, posted_at: null }, NOW), false)
rec('an unparseable posted_at is not due either',
  () => isDueForReminder({ ...base, posted_at: 'not a date' }, NOW), false)

// THE BOUNDARY, both sides. 29 days must not fire; 31 must.
rec('29 days is not yet due', () => isDueForReminder({ ...base, posted_at: daysAgo(29) }, NOW), false)
rec('31 days is due', () => isDueForReminder({ ...base, posted_at: daysAgo(31) }, NOW), true)

// ── ONE EMAIL PER EMPLOYER ──────────────────────────────────────────────────
// The measured case: twelve due adverts, one employer. Twelve emails would be
// the feature's first impression and its last.
const twelve = Array.from({ length: 12 }, (_, i) => ({
  ...base, id: 'j' + i, title: 'Role ' + i, posted_at: daysAgo(40 + i),
}))
const grouped = groupReminders(twelve, NOW)
rec('twelve adverts for one employer produce ONE reminder', () => grouped.length, 1)
rec('and it lists at most MAX_ADS_LISTED', () => grouped[0].jobs.length, MAX_ADS_LISTED)
rec('and says so rather than hiding the rest', () => grouped[0].truncated, true)

// Two employers stay separate.
const mixed = [...twelve, { ...base, id: 'x1', employer_id: 'e2' }]
rec('two employers produce two reminders', () => groupReminders(mixed, NOW).length, 2)

// A scraped advert must not drag its employer into a reminder at all.
rec('an employer with only scraped adverts is never reminded',
  () => groupReminders([{ ...base, employer_id: 'e9', source_url: 'https://x.example/1' }], NOW).length, 0)

// ── THE COPY ASSERTS NOTHING WE CANNOT SEE ──────────────────────────────────
const one = groupReminders([base], NOW)[0]
const body = reminderBody(one, NOW, 'https://thrivecareer.co.uk')
rec('it asks rather than assuming the role is filled',
  () => /still open/i.test(body) && !/has been filled|is filled|no longer/i.test(body), true)
rec('it never mentions money', () => /£|\\$|price|pricing|per month|free for/i.test(body), false)
rec('it says doing nothing is fine', () => /nothing to do/i.test(body), true)
rec('it links to Manage job ads', () => /\\/my-jobs/.test(body), true)
rec('the subject counts the adverts', () => reminderSubject(one), 'Is this role still open?')
rec('and pluralises for several',
  () => reminderSubject(groupReminders(twelve, NOW)[0]), 'Are these 10 roles still open?')

console.log(JSON.stringify(out))
`)

let raw
try {
  raw = execFileSync('npx', ['tsx', entry], {
    encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
} catch (e) {
  console.error('prove-job-reminders: could not run')
  console.error(e.stderr || e.message)
  rmSync(entry, { force: true })
  process.exit(1)
}
rmSync(entry, { force: true })

const results = JSON.parse(raw.trim().split('\n').filter(Boolean).pop())
let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}`)
  else {
    failed++
    console.log(`  FAIL  ${r.name}\n          got:  ${JSON.stringify(r.got)}\n          want: ${JSON.stringify(r.want)}`)
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
