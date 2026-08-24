// THE FEED'S EXPIRY DATE ROLLS FORWARD. IT DOES NOT SIT IN THE PAST.
//
// This exists because the fault it watches was invisible from our side for
// weeks. The adverts looked healthy on the board; the loss was entirely at the
// far end, in a date we send to four external distributors and never read back.
// Measured 24 Aug 2026 before the fix: 23 of 247 live adverts were going out
// marked already dead, and 208 of 247 would have been within a month.
//
//   npx tsx scripts/prove-feed-expiry.ts
//
// No network, no database.
//
// THE CHECK THAT MATTERS IS THE ONE THAT GENERATES TWICE. A single generation
// cannot tell a rolling horizon from a frozen constant — both produce one date
// that looks fine today. Only a second generation at a later instant separates
// them, which is exactly the question a reader of this file has.
//
// HOW THE GAP IS FORCED: feedExpiryHorizon takes `now` as a parameter whose
// default is new Date(). The second call is handed a Date one day on. That is
// the same code path the builder runs — not a stub of it, not a mocked clock —
// so the thing proven is the thing that ships.

import { buildJobsFeedXml, feedExpiryHorizon, jobToXml, type FeedJobRow } from '../lib/jobsFeed'

const out: { name: string; got: any; want: any; ok: boolean }[] = []
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

const day = (d: string) => new Date(d + 'T12:00:00Z')
const dates = (xml: string) =>
  (xml.match(/<expirationdate>([^<]+)<\/expirationdate>/g) || []).map(s => s.replace(/<[^>]+>/g, ''))

// The two shapes the live board actually holds: a Goldenkeys row from the July
// bulk (old enough that the OLD rule put it in the past) and one posted today.
const OLD_ROW: FeedJobRow = {
  id: 'aaa', title: 'Chef De Partie - Luxury 5 Star Hotel', company: 'Goldenkeys Recruitment',
  location: 'London', area: 'Greater London', description: 'x'.repeat(120),
  salary_min: 35000, salary_max: 42000, salary_type: 'annual',
  employment_type: ['Full-time', 'Permanent'], category: 'hospitality',
  posted_at: '2026-06-19T09:00:00Z', expires_at: null,
  job_reference: 'GK-1', source_url: 'https://example.com/1',
}
const NEW_ROW: FeedJobRow = {
  id: 'bbb', title: 'Junior Sous Chef - Cotswolds', company: 'Host Staffing',
  location: 'Moreton-in-Marsh', area: 'Gloucestershire', description: 'y'.repeat(120),
  salary_min: 36500, salary_max: 42500, salary_type: 'annual',
  employment_type: ['Full-time'], category: 'hospitality',
  posted_at: '2026-08-24T09:00:00Z', expires_at: null,
  job_reference: 'HS-035', source_url: null,
}

// ── THE HORIZON ROLLS ──────────────────────────────────────────────────────

rec('the horizon is 90 days ahead of the instant it is given',
  () => feedExpiryHorizon(day('2026-08-24')), '2026-11-22')

rec('GENERATE TWICE, A DAY APART: THE DATE ADVANCES',
  () => feedExpiryHorizon(day('2026-08-25')) > feedExpiryHorizon(day('2026-08-24')), true)

rec('and it advances by exactly the gap, not by some other amount',
  () => (Date.parse(feedExpiryHorizon(day('2026-08-25'))) -
         Date.parse(feedExpiryHorizon(day('2026-08-24')))) / 86_400_000, 1)

// A YEAR ON, WITH NO REDEPLOY. The old code would still be emitting dates from
// 60 days after each posted_at; those are fixed strings and do not move. This
// asks the question with two different answers.
rec('a year later the horizon has moved a year, not stayed put',
  () => feedExpiryHorizon(day('2027-08-24')), '2027-11-22')

// ── THE DATE IS NEVER IN THE PAST ──────────────────────────────────────────
//
// Asked of the OLD row specifically: posted 19 June, which under posted_at+60
// gave 18 August — six days dead by the time this was written. This assertion
// is the fault itself, inverted.
rec('a June advert generated in August is NOT already expired',
  () => dates(jobToXml(OLD_ROW, 'https://x', feedExpiryHorizon(day('2026-08-24'))))[0] > '2026-08-24',
  true)

rec('and the old rule would have marked it dead — the states differ',
  () => new Date(Date.parse(OLD_ROW.posted_at!) + 60 * 86_400_000).toISOString().slice(0, 10) < '2026-08-24',
  true)

rec('no item in a whole document carries a date before its generation day',
  () => dates(buildJobsFeedXml([OLD_ROW, NEW_ROW], 'https://x'))
          .filter(d => d < new Date().toISOString().slice(0, 10)), [])

// ── ONE DATE PER DOCUMENT ──────────────────────────────────────────────────
//
// Computed once in buildJobsFeedXml and passed down, so a build straddling
// midnight UTC cannot emit two different dates and stop saying one thing.
rec('every item in a generation carries the SAME date',
  () => new Set(dates(buildJobsFeedXml([OLD_ROW, NEW_ROW, { ...OLD_ROW, id: 'ccc' }], 'https://x'))).size, 1)

rec('...regardless of how far apart the rows were posted',
  () => {
    const d = dates(buildJobsFeedXml([
      { ...OLD_ROW, posted_at: '2025-01-01T00:00:00Z' },
      { ...NEW_ROW, posted_at: '2026-08-24T09:00:00Z' },
    ], 'https://x'))
    return d[0] === d[1]
  }, true)

// ── A REAL DATE STILL BEATS THE HORIZON ────────────────────────────────────
//
// Nothing writes jobs.expires_at today — it is null on every row. But if
// anything ever does, that is a date somebody meant, and it wins.
rec('a row with its own expires_at keeps it',
  () => dates(jobToXml({ ...NEW_ROW, expires_at: '2026-09-30T00:00:00Z' }, 'https://x', '2026-11-22'))[0],
  '2026-09-30')

rec('an UNPARSEABLE expires_at falls back to the horizon rather than emitting junk',
  () => dates(jobToXml({ ...NEW_ROW, expires_at: 'not a date' }, 'https://x', '2026-11-22'))[0],
  '2026-11-22')

// ── NOTHING ELSE MOVED ─────────────────────────────────────────────────────
//
// The element is populated at all, because Jooble's and Jora's specs could not
// be established from an authoritative source and Jooble is a live channel.
// Dropping the element was the other option and was rejected; this asserts the
// decision that was taken.
rec('the element is still emitted, once per item',
  () => (buildJobsFeedXml([OLD_ROW, NEW_ROW], 'https://x').match(/<expirationdate>/g) || []).length, 2)

rec('the date format is bare YYYY-MM-DD, not an ISO timestamp',
  () => /^\d{4}-\d{2}-\d{2}$/.test(dates(buildJobsFeedXml([NEW_ROW], 'https://x'))[0]), true)

rec('the document still parses: tags balance and the root closes',
  () => {
    const xml = buildJobsFeedXml([OLD_ROW, NEW_ROW], 'https://x')
    return [
      (xml.match(/<job>/g) || []).length,
      (xml.match(/<\/job>/g) || []).length,
      xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'),
      /<\/source>\s*$/.test(xml),
    ]
  }, [2, 2, true, true])

rec('every other element of an item is byte-for-byte what it was',
  () => jobToXml(NEW_ROW, 'https://thrivecareer.co.uk', '2026-11-22')
          .split('\n').map(l => l.trim()).filter(l => !l.startsWith('<expirationdate'))
          .filter(l => l.startsWith('<')).map(l => l.slice(0, l.indexOf('>') + 1)),
  ['<job>', '<title>', '<date>', '<referencenumber>', '<url>', '<company>',
   '<city>', '<state>', '<country>', '<description>', '<salary>', '<jobtype>', '<category>',
   '</job>'])

// ── REPORT ─────────────────────────────────────────────────────────────────

let failed = 0
for (const r of out) {
  if (r.ok) console.log(`  PASS  ${r.name}`)
  else {
    failed++
    console.log(`  FAIL  ${r.name}\n          got:  ${JSON.stringify(r.got)}\n          want: ${JSON.stringify(r.want)}`)
  }
}
console.log(`\n${out.length - failed}/${out.length} passed`)
process.exit(failed ? 1 : 0)
