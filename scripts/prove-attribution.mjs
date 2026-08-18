#!/usr/bin/env node
/**
 * PROVE THE ATTRIBUTION LOGIC CAN TELL ITS STATES APART.
 *
 * The referrer fallback exists because ?ref has landed on ZERO of 62
 * candidates: Paul deletes the link from a LinkedIn post once the card has
 * rendered, so people click an image and arrive with no tag at all. The whole
 * change is worthless if the capture cannot distinguish:
 *
 *     a tag              from   a referrer inference
 *     an external site   from   our own pages
 *     a first touch      from   a later one
 *
 * So every case below is a PAIR whose two halves must differ. A check that
 * would pass on both states of the thing it is checking proves nothing — the
 * rule that produced the "cron uses the constant" false pass.
 *
 * Runs against the real lib via tsx, not a copy of the logic: a
 * reimplementation here would agree with itself and with nothing else.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const dir = join(tmpdir(), 'thrive-prove-attr')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'run.mts')

// A minimal DOM. captureFromSearch is client-only and guards on `document`,
// so the helper is genuinely exercised rather than short-circuited.
writeFileSync(entry, `
import {
  captureFromSearch, getStoredAttribution, normalizeSource, sourceBasis,
  attributionColumns, externalReferrerHost, channelFromReferrer,
} from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'lib', 'attribution.ts')).href)}

let cookieJar = ''
const store = new Map<string, string>()
;(globalThis as any).document = {
  get cookie() { return cookieJar },
  set cookie(v: string) {
    const [pair] = v.split(';')
    const i = pair.indexOf('=')
    const name = pair.slice(0, i)
    cookieJar = cookieJar.split('; ').filter(c => c && !c.startsWith(name + '=')).concat(pair).join('; ')
  },
  referrer: '',
}
;(globalThis as any).window = {
  location: { hostname: 'thrivecareer.co.uk' },
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
  },
}
const reset = () => { cookieJar = ''; store.clear() }

const out: any[] = []
// The value is passed as a THUNK so a throw becomes a named failure instead
// of killing the run. Watched failing on purpose with the referrer fallback
// removed: the first referrer case threw, the process died, and the remaining
// twelve checks never reported — which reads as a broken harness rather than
// as the one product fault it actually was.
const record = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = \`threw: \${e.message}\` }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

// ── PAIR 1: a tag and a referrer must not produce the same basis ──────────
reset()
captureFromSearch('?ref=li-founding', '')
record('tag -> basis', () => sourceBasis(getStoredAttribution()!), 'tag')
record('tag -> channel', () => normalizeSource(getStoredAttribution()!), 'LinkedIn')

reset()
captureFromSearch('', 'https://www.linkedin.com/feed/')
record('referrer -> basis', () => sourceBasis(getStoredAttribution()!), 'referrer')
record('referrer -> channel', () => normalizeSource(getStoredAttribution()!), 'LinkedIn')
record('referrer -> host stored', () => getStoredAttribution()!.referrer_host, 'linkedin.com')

// Same channel, different basis. This is the pair the change exists for: if
// these two ever collapse to one answer the basis column is decorative.
record('same channel, different basis', () => [
  normalizeSource({ signup_ref: 'li' }) === normalizeSource({ referrer_host: 'linkedin.com' }),
  sourceBasis({ signup_ref: 'li' }) === sourceBasis({ referrer_host: 'linkedin.com' }),
], [true, false])

// ── PAIR 2: our own host is not a referral ────────────────────────────────
record('external referrer kept',
  () => externalReferrerHost('https://lnkd.in/abc', 'thrivecareer.co.uk'), 'lnkd.in')
record('self referrer dropped',
  () => externalReferrerHost('https://www.thrivecareer.co.uk/jobs', 'thrivecareer.co.uk'), null)
record('own subdomain dropped',
  () => externalReferrerHost('https://preview.thrivecareer.co.uk/x', 'thrivecareer.co.uk'), null)
record('garbage referrer dropped',
  () => externalReferrerHost('not-a-url', 'thrivecareer.co.uk'), null)

// An internal-only visit must store NOTHING, or every candidate acquires a
// referrer_host of our own domain on their second page view.
reset()
captureFromSearch('', 'https://thrivecareer.co.uk/jobs')
record('internal-only visit stores nothing', () => getStoredAttribution(), null)

// ── PAIR 3: first touch wins, but a tag upgrades a referrer-only record ───
reset()
captureFromSearch('?ref=fb-chefsuk', '')
captureFromSearch('?ref=li-later', '')
record('tag is not overwritten by a later tag',
  () => getStoredAttribution()!.signup_ref, 'fb-chefsuk')

reset()
captureFromSearch('', 'https://www.linkedin.com/feed/')
captureFromSearch('?ref=li-founding', '')
record('referrer-only record accepts a later tag', () => [
  getStoredAttribution()!.signup_ref, getStoredAttribution()!.referrer_host,
  sourceBasis(getStoredAttribution()!),
], ['li-founding', 'linkedin.com', 'tag'])

// ── PAIR 4: an unrecognised host reports itself, never 'Other' ────────────
record('unknown host is not folded away',
  () => normalizeSource({ referrer_host: 'caterlyst.example' }), 'caterlyst.example')
record('unknown host maps to no channel',
  () => channelFromReferrer('caterlyst.example'), null)

// ── The written columns ───────────────────────────────────────────────────
record('columns from a referrer', () => attributionColumns({ referrer_host: 'lnkd.in' }), {
  signup_ref: null, utm_source: null, utm_medium: null, utm_campaign: null,
  heard_from: null, referrer_host: 'lnkd.in',
  signup_source: 'LinkedIn', signup_source_basis: 'referrer',
})
record('columns from nothing', () => attributionColumns(null), {
  signup_ref: null, utm_source: null, utm_medium: null, utm_campaign: null,
  heard_from: null, referrer_host: null,
  signup_source: 'unknown', signup_source_basis: 'unknown',
})

console.log(JSON.stringify(out))
`)

let raw
try {
  // shell:true because on Windows `npx` is npx.cmd and execFileSync will not
  // find it otherwise — ENOENT, which reads as "tsx is missing" rather than
  // "the spawn was wrong". cwd stays at the project root so tsx resolves.
  raw = execFileSync('npx', ['tsx', entry], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true, cwd: process.cwd(),
  })
} catch (e) {
  console.error('FAIL  could not run the checks')
  console.error(e.stdout || '', e.stderr || '')
  rmSync(dir, { recursive: true, force: true })
  process.exit(1)
}
rmSync(dir, { recursive: true, force: true })

// The script prints one JSON line last; anything before it is noise from tsx.
const line = raw.trim().split('\n').filter(l => l.startsWith('[')).pop()
if (!line) { console.error('FAIL  no result line from the checks'); process.exit(1) }

const results = JSON.parse(line)
let failed = 0
for (const r of results) {
  if (r.ok) { console.log(`  ok    ${r.name}`) }
  else {
    failed++
    console.log(`  FAIL  ${r.name}`)
    console.log(`          want ${JSON.stringify(r.want)}`)
    console.log(`          got  ${JSON.stringify(r.got)}`)
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
// The exit status is the answer. Nothing above it is a label anyone wrote.
process.exit(failed ? 1 : 0)
