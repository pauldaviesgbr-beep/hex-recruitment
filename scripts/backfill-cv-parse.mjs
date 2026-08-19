// BACKFILL THE CVs WE ALREADY HOLD. Phase 1 — nothing reads the output.
//
// THIS TOUCHES REAL PEOPLE'S ROWS, 26 OF THEM. So:
//   · it writes ONLY the three new columns, never skills, job_title,
//     preferred_areas or anything else a candidate typed in themselves;
//   · every write is keyed on the row's own uuid;
//   · rows are counted before and after, so "nothing else changed" is a
//     measurement rather than an assumption;
//   · one unreadable file cannot stop the other 25 — parseCv never throws.
//
// NOTHING HERE SENDS AN EMAIL. It writes three columns on candidate_profiles
// and touches no notification, no trigger and no route. `candidate_profiles`
// carries no triggers; checked, not assumed.
//
//   node scripts/backfill-cv-parse.mjs            # dry run: parses, writes nothing
//   node scripts/backfill-cv-parse.mjs --write    # the real thing

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const WRITE = process.argv.includes('--write')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null

// ── env, from .env.local, the way every other script here does it ──────────
const env = {}
const envFile = path.join(process.cwd(), '.env.local')
if (!existsSync(envFile)) { console.error('SKIP  no .env.local'); process.exit(2) }
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']) {
  if (!env[k]) { console.error(`SKIP  ${k} missing from .env.local`); process.exit(2) }
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

// The parser is TypeScript; load it through tsx's loader.
const { parseCv } = await import(
  pathToFileURL(path.join(process.cwd(), 'lib', 'cvParse.ts')).href
)

// ── BEFORE ─────────────────────────────────────────────────────────────────
const before = {}
{
  const { count: profiles } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true })
  const { count: withCv } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).not('cv_url', 'is', null)
  const { count: parsed } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).not('cv_parse_status', 'is', null)
  const { count: withSkills } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).not('skills', 'is', null)
  Object.assign(before, { profiles, withCv, parsed, withSkills })
}
console.log(`BEFORE  profiles=${before.profiles} withCv=${before.withCv} alreadyParsed=${before.parsed} withSkills=${before.withSkills}`)
console.log(WRITE ? 'MODE    WRITE\n' : 'MODE    DRY RUN — parses and prints, writes nothing\n')

let q = db.from('candidate_profiles')
  .select('user_id, cv_url, cv_file_name')
  .not('cv_url', 'is', null)
  .eq('is_test', false).eq('is_house', false)
  .order('user_id')
if (ONLY) q = q.eq('user_id', ONLY)
const { data: rows, error } = await q
if (error) { console.error('could not list candidates:', error.message); process.exit(1) }

const results = []
for (const [i, row] of rows.entries()) {
  const label = `${String(i + 1).padStart(2)}/${rows.length} ${row.user_id.slice(0, 8)}`
  let bytes = null
  let status = 'failed'
  let derived = null
  let note = ''

  // A MISSING OR UNREADABLE FILE IS 'failed' AND MUST NOT STOP THE LOOP. The
  // storage path is on the row; the object may not be there any more.
  const dl = await db.storage.from('profiles').download(row.cv_url)
  if (dl.error || !dl.data) {
    note = `download failed: ${dl.error?.message || 'no data'}`
  } else {
    bytes = new Uint8Array(await dl.data.arrayBuffer())
    if (bytes.byteLength === 0) {
      status = 'empty'; note = 'zero-byte file'
    } else {
      const r = await parseCv(bytes, row.cv_url, anthropic)
      status = r.status; derived = r.derived; note = r.note || ''
    }
  }

  results.push({ userId: row.user_id, status, derived, note, bytes: bytes?.byteLength ?? 0 })
  console.log(`${label}  ${status.padEnd(11)} ${derived?.recentTitle ?? '—'}${note ? `  (${note})` : ''}`)

  if (WRITE) {
    // ONLY THE THREE NEW COLUMNS. Keyed on the uuid.
    const { error: wErr } = await db.from('candidate_profiles')
      .update({
        cv_parsed_at: new Date().toISOString(),
        cv_parse_status: status,
        cv_derived: derived,
      })
      .eq('user_id', row.user_id)
      .select('user_id')
    if (wErr) console.log(`      WRITE FAILED: ${wErr.message}`)
  }
}

// ── AFTER ──────────────────────────────────────────────────────────────────
const after = {}
{
  const { count: profiles } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true })
  const { count: withCv } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).not('cv_url', 'is', null)
  const { count: parsed } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).not('cv_parse_status', 'is', null)
  const { count: withSkills } = await db.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).not('skills', 'is', null)
  Object.assign(after, { profiles, withCv, parsed, withSkills })
}

console.log(`\nAFTER   profiles=${after.profiles} withCv=${after.withCv} parsed=${after.parsed} withSkills=${after.withSkills}`)
// THE TWO THAT MUST NOT MOVE. If the profile count changed we created or
// destroyed someone; if withSkills changed we overwrote something a candidate
// typed. Either is a stop-everything.
const rowsSame = before.profiles === after.profiles
const skillsSame = before.withSkills === after.withSkills
console.log(`        profile count unchanged: ${rowsSame}   declared skills untouched: ${skillsSame}`)

const tally = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {})
console.log(`\nSTATUS  ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join('  ')}`)

console.log('\n── DERIVED OUTPUT, ALL ROWS ──────────────────────────────────')
for (const r of results) {
  const d = r.derived
  console.log(`${r.userId}  ${r.status}`)
  if (d) {
    console.log(`   recentTitle   ${d.recentTitle ?? 'null'}${d.recentIsCurrent ? '  (current)' : ''}`)
    console.log(`   seniorityRank ${d.seniorityRank ?? 'null'}`)
    console.log(`   recentEndDate ${d.recentEndDate ?? 'null'}`)
    console.log(`   titles        ${d.titles.length ? d.titles.join(' | ') : '—'}`)
    console.log(`   skills        ${d.skills.length ? d.skills.join(', ') : '—'}`)
  } else if (r.note) {
    console.log(`   note          ${r.note}`)
  }
}

if (!rowsSame || !skillsSame) process.exit(1)
