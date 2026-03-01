const { createClient } = require('@supabase/supabase-js')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run() {
  // First check what columns actually exist
  const { data: cols, error: colErr } = await admin.from('employer_profiles').select('*').limit(0)
  // The error won't show columns, but a successful insert attempt will

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 100 })
  const employer = users.users.find(u => u.email === 'pauldavies.gbr@gmail.com')

  if (!employer) {
    console.log('ERROR: employer user not found')
    return
  }

  console.log('Employer ID: ' + employer.id)
  const meta = employer.user_metadata || {}
  console.log('Company: ' + (meta.company_name || 'N/A'))
  console.log('Name: ' + (meta.full_name || 'N/A'))

  // Check existing
  const { data: existing } = await admin.from('employer_profiles')
    .select('id')
    .eq('user_id', employer.id)

  if (existing && existing.length > 0) {
    console.log('Profile already exists')
    return
  }

  // Try inserting with minimal columns first
  const profileData = {
    user_id: employer.id,
    company_name: meta.company_name || 'Five Guys LTD',
    contact_name: meta.full_name || 'Paul Davies',
    email: employer.email,
  }

  console.log('Inserting: ' + JSON.stringify(profileData))
  const { data: inserted, error: insertErr } = await admin
    .from('employer_profiles')
    .insert(profileData)
    .select()

  if (insertErr) {
    console.log('ERROR: ' + insertErr.message)
  } else {
    console.log('SUCCESS: Profile created')
    console.log(JSON.stringify(inserted[0], null, 2))
  }

  // Verify
  const { count } = await admin.from('employer_profiles').select('*', { count: 'exact', head: true })
  console.log('Total employer_profiles rows: ' + count)
}

run().catch(err => console.error('FATAL:', err.message))
