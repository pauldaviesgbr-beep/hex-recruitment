// WHAT THE /admin/duplicates PANEL WILL SAY, WITHOUT BEING ABLE TO OPEN IT.
//
// Only paul@thrivecareer.co.uk is an admin, and that is a real account this
// project does not drive. So the panel itself cannot be reached from here.
// This runs the ROUTE'S OWN RULE over the REAL rows instead — the same
// nameMatchKey the route filters on, imported rather than reimplemented — so
// the number is the route's number and not a second opinion about it.
//
// It answers the state question ("is the count right"), NOT the screen
// question ("does the panel render"). Those are different and only one of them
// is settled here. State beats screen for whether it is CORRECT; screen beats
// state for whether it is FINISHED.
//
// Read-only. Names are counted and characterised, never printed — a roster of
// real candidates does not belong in a terminal or a report.
//
//   npx tsx --conditions=react-server scripts/count-unkeyable-names.ts

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { nameMatchKey } from '../lib/duplicateHold'

const env: Record<string, string> = {}
const f = path.join(process.cwd(), '.env.local')
if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  no service key'); process.exit(2) }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Wrapped: this tsconfig targets a module format without top-level await.
async function main() {
  const { data, error } = await admin
    .from('candidate_profiles')
    .select('user_id, full_name, created_at, duplicate_hold')
  if (error) { console.error('QUERY FAILED: ' + error.message); process.exit(1) }

  const rows = data || []
  // The route's exact filter.
  const unkeyable = rows.filter(r => !nameMatchKey(r.full_name as string | null))
  const noName = unkeyable.filter(r => !(r.full_name || '').trim())
  const tooShort = unkeyable.length - noName.length
  const stored = rows.filter(r => {
    const h = r.duplicate_hold as any
    return h && typeof h === 'object' && h.notCheckedAt
  })

  console.log('')
  console.log('  THE FOLDED-AWAY BLOCK, computed the way the route computes it')
  console.log('    total candidate rows            ' + rows.length)
  console.log('    the check CAN run on            ' + (rows.length - unkeyable.length))
  console.log('    the check CANNOT run on         ' + unkeyable.length
    + '   (' + tooShort + ' one-word, ' + noName.length + ' with no name)')
  console.log('')
  console.log('  THE RED BLOCK, read from the rows')
  console.log('    lookup failures on record       ' + stored.length + '   (none expected — nothing has errored)')
  console.log('')

  const newest = unkeyable
    .map(r => r.created_at as string)
    .sort()
    .slice(-1)[0]
  console.log('  most recent unkeyable signup      ' + (newest ? newest.slice(0, 10) : 'none'))
  console.log('  → a live ongoing state, not a historical tail')
  console.log('')
  console.log('  NOT PROVEN HERE: that the panel RENDERS. Only paul@ is an admin')
  console.log('  and that account is not driven. Open /admin/duplicates and')
  console.log('  confirm the folded row reads ' + unkeyable.length + '.')
  console.log('')

}

main()
