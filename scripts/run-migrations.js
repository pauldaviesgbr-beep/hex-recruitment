const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  // 1. Check which tables need creation
  console.log('=== TABLE STATUS CHECK ===')

  const { error: psErr } = await admin.from('platform_settings').select('key').limit(1)
  const psNeeded = psErr && psErr.message.includes('Could not find')
  console.log('platform_settings: ' + (psNeeded ? 'MISSING - needs SQL' : 'EXISTS'))

  const { error: scErr } = await admin.from('saved_candidates').select('id').limit(1)
  const scNeeded = scErr && scErr.message.includes('Could not find')
  console.log('saved_candidates: ' + (scNeeded ? 'MISSING - needs SQL' : 'EXISTS'))

  // 2. Insert employer_profiles row for pauldavies.gbr@gmail.com
  console.log('')
  console.log('=== EMPLOYER PROFILE FIX ===')

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 100 })
  const employer = users.users.find(u => u.email === 'pauldavies.gbr@gmail.com')

  if (employer) {
    console.log('Found employer: ' + employer.id)
    const meta = employer.user_metadata || {}
    console.log('Metadata: company=' + (meta.company_name || 'NONE') + ', name=' + (meta.full_name || 'NONE'))

    const { data: existing } = await admin.from('employer_profiles').select('id').eq('user_id', employer.id)

    if (existing && existing.length > 0) {
      console.log('Profile already exists - skipping')
    } else {
      const { data: inserted, error: insertErr } = await admin.from('employer_profiles').insert({
        user_id: employer.id,
        company_name: meta.company_name || 'Hex Recruitment',
        contact_name: meta.full_name || 'Paul Davies',
        email: employer.email,
        subscription_plan: meta.subscription_plan || 'professional',
        subscription_status: 'active',
      }).select()

      if (insertErr) {
        console.log('INSERT ERROR: ' + insertErr.message)
      } else {
        console.log('SUCCESS: Created employer profile')
        console.log('  Company: ' + inserted[0].company_name)
        console.log('  Contact: ' + inserted[0].contact_name)
        console.log('  Email: ' + inserted[0].email)
      }
    }
  } else {
    console.log('ERROR: employer user not found')
  }

  // 3. Print SQL that needs to be run
  if (psNeeded || scNeeded) {
    console.log('')
    console.log('=============================================')
    console.log('SQL MIGRATIONS NEEDED')
    console.log('Run these in the Supabase SQL Editor:')
    console.log('=============================================')

    if (psNeeded) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', 'create_platform_settings_table.sql'), 'utf8')
      console.log('')
      console.log('--- create_platform_settings_table.sql ---')
      console.log(sql)
    }

    if (scNeeded) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', 'create_saved_candidates_table.sql'), 'utf8')
      console.log('')
      console.log('--- create_saved_candidates_table.sql ---')
      console.log(sql)
    }

    const rlsSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', 'fix_rls_policies.sql'), 'utf8')
    console.log('')
    console.log('--- fix_rls_policies.sql ---')
    console.log(rlsSql)
  }

  // 4. Verify final state
  console.log('')
  console.log('=== FINAL VERIFICATION ===')
  const { count: epCount } = await admin.from('employer_profiles').select('*', { count: 'exact', head: true })
  console.log('employer_profiles: ' + epCount + ' rows')
}

run().catch(err => console.error('FATAL:', err.message))
