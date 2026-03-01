const { createClient } = require('@supabase/supabase-js')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function run() {
  console.log('=== FINAL DATABASE VERIFICATION ===')
  console.log('')

  // 1. Employer profile
  const { data: ep } = await admin.from('employer_profiles')
    .select('company_name, contact_name, email')
    .eq('email', 'pauldavies.gbr@gmail.com')
  console.log('1. Employer Profile:')
  if (ep && ep.length > 0) {
    console.log('   OK - ' + ep[0].company_name + ' (' + ep[0].contact_name + ')')
  } else {
    console.log('   FAIL - no profile found')
  }

  // 2. platform_settings
  const { error: psErr } = await admin.from('platform_settings').select('key').limit(1)
  console.log('2. platform_settings: ' + (psErr ? 'MISSING (needs SQL)' : 'EXISTS'))

  // 3. saved_candidates
  const { error: scErr } = await admin.from('saved_candidates').select('id').limit(1)
  console.log('3. saved_candidates: ' + (scErr ? 'MISSING (needs SQL)' : 'EXISTS'))

  // 4. All tables summary
  console.log('')
  console.log('=== FULL TABLE SUMMARY ===')
  const tables = [
    'candidate_profiles', 'employer_profiles', 'employer_subscriptions',
    'jobs', 'job_applications', 'interviews', 'job_offers',
    'conversations', 'messages', 'company_reviews', 'notifications',
    'job_views', 'job_click_events', 'job_impressions', 'job_alerts',
    'saved_jobs', 'candidate_cvs', 'employees', 'review_helpful_votes'
  ]

  for (const t of tables) {
    const { count: adminCount } = await admin.from(t).select('*', { count: 'exact', head: true })
    const icon = adminCount > 0 ? 'OK' : 'EMPTY'
    console.log('   [' + icon + '] ' + t + ': ' + adminCount + ' rows')
  }

  // 5. Storage
  const { data: buckets } = await admin.storage.listBuckets()
  console.log('')
  console.log('=== STORAGE ===')
  if (buckets) {
    buckets.forEach(b => console.log('   Bucket: ' + b.name + ' (public: ' + b.public + ')'))
  }

  // 6. Migration files status
  console.log('')
  console.log('=== PENDING SQL MIGRATIONS ===')
  console.log('These need to be run in Supabase SQL Editor:')
  if (psErr) console.log('   - supabase/migrations/create_platform_settings_table.sql')
  if (scErr) console.log('   - supabase/migrations/create_saved_candidates_table.sql')
  console.log('   - supabase/migrations/fix_rls_policies.sql (RLS tightening + trigger fix)')
}

run().catch(err => console.error('FATAL:', err.message))
