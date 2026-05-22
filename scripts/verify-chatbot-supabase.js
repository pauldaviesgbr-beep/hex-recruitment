// Supabase verification for the chatbot LLM e2e suite. Run AFTER the
// Playwright run completes:
//
//   npx playwright test e2e/chatbot-llm.spec.ts && node scripts/verify-chatbot-supabase.js
//
// Expected assertions (per the build spec):
//   - chat_logs total in the last 5 minutes = 8
//       (tests 1, 2, 3, 4, 5, 7 → 1 each; test 8 → 2; test 6 mocks the
//        route and never hits chat_logs)
//   - llm_count (fallback_used = false) = 8
//   - conversations (distinct conversation_id) ≥ 7
//   - RLS check: anon-key SELECT * FROM chat_logs returns 0 rows
//
// Exits non-zero on any failure so it slots into a CI gate.

const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('FAIL: missing one of NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

// 90-second window — the playwright suite runs in ~60s, so this
// scopes the count to just the most recent run. Larger windows risk
// counting rows from prior runs and tripping the strict total=8
// assertion. Run this script immediately after the playwright suite
// finishes.
const WINDOW_SECONDS = 90

async function main() {
  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()
  const failures = []

  // Counts over the recent window.
  const { data: rows, error: rowsErr } = await service
    .from('chat_logs')
    .select('id, conversation_id, fallback_used, intercept_used, created_at, model, latency_ms')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (rowsErr) {
    console.error('FAIL: service-role query errored:', rowsErr.message)
    process.exit(1)
  }

  const total = rows.length
  const llmCount = rows.filter((r) => r.fallback_used === false).length
  const conversations = new Set(rows.map((r) => r.conversation_id)).size

  console.log(`chat_logs in last ${WINDOW_SECONDS}s: total=${total} llm=${llmCount} conversations=${conversations}`)

  if (total !== 8) {
    failures.push(`expected total=8, got ${total}`)
  }
  if (llmCount !== 8) {
    failures.push(`expected llm_count=8 (none fallback), got ${llmCount}`)
  }
  if (conversations < 7) {
    failures.push(`expected conversations >= 7, got ${conversations}`)
  }

  // RLS check — anon must NOT be able to read chat_logs.
  const { data: anonRows, error: anonErr } = await anon
    .from('chat_logs')
    .select('id')
    .limit(1)

  if (anonErr) {
    // Permission-denied or RLS-blocked is the pass path.
    console.log(`RLS check: anon SELECT rejected with "${anonErr.message}" — pass`)
  } else if ((anonRows || []).length === 0) {
    console.log('RLS check: anon SELECT returned 0 rows — pass')
  } else {
    failures.push(`RLS check failed: anon SELECT returned ${anonRows.length} rows (expected 0 or permission denied)`)
  }

  if (failures.length) {
    console.error('\nFAIL:')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }

  console.log('\nAll chat_logs assertions passed.')
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err)
  process.exit(1)
})
