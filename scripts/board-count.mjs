// WHAT IS ON THE PUBLIC BOARD, RIGHT NOW.
//
//   npm run board
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// CLAUDE.md said 251 live adverts. The board was 247 — the Goldenkeys scrape
// archived seven overnight and nobody had touched the file. It had already
// drifted once before, from 252.
//
// A COUNT WRITTEN INTO A DOCUMENT IS TRUE ON THE DAY IT WAS WRITTEN and never
// again, and the ones that read as standing facts are the dangerous kind: the
// 251 was used to argue about what a reviewer would see, weeks after it stopped
// being the number. The same file already records this happening to "only two
// addresses are proven", to "9 of 62 candidates", and to the board being 252.
//
// So the fix is not a better number in the file. It is that the file stops
// holding one and points here instead — the same argument as `preview-url` and
// `deploy-ready`: a rule broken repeatedly needs a mechanism, not another line.
//
// It reads the database, which is the only authority. Nothing here is a
// constant.

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
const env = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.log('SKIP  no Supabase credentials — cannot read the board.')
  console.log('      Do NOT fall back to a number written down somewhere.')
  process.exit(2)
}
const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

const { data: rows, error } = await admin.from('jobs')
  .select('company, is_recruiter_posting').eq('status', 'active')
if (error) { console.log('could not read the board: ' + error.message); process.exit(1) }

const by = new Map()
for (const r of rows) by.set(r.company, (by.get(r.company) || 0) + 1)
const sorted = [...by.entries()].sort((a, b) => b[1] - a[1])

console.log('')
console.log(`THE PUBLIC BOARD, READ ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`)
console.log('')
for (const [company, n] of sorted) {
  console.log('  ' + String(n).padStart(4) + '  ' + company)
}
console.log('  ----')
console.log('  ' + String(rows.length).padStart(4) + '  live adverts, from ' + sorted.length + ' companies')

// THE SHIFT FEED IS A DIFFERENT BOARD AND GETS CONFUSED WITH THIS ONE.
const { count: shifts } = await admin.from('temp_posts')
  .select('*', { count: 'exact', head: true }).eq('status', 'open')
console.log('')
console.log('  ' + String(shifts || 0).padStart(4) + '  open shift posts on /temp-work (a different feed)')

// A CLAIM THE HOME HERO MAKES, AND THE DISCRIMINATOR IT NEEDS.
// `salary_max is not null` returns every row; two rows carry a literal 0 in
// both salary columns, so the honest question is `> 0`.
const { count: withSalary } = await admin.from('jobs')
  .select('*', { count: 'exact', head: true }).eq('status', 'active').gt('salary_max', 0)
console.log('  ' + String(withSalary || 0).padStart(4) + '  of those carry a salary above zero')
console.log('')
