import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId, trialEndsAt, companyName, contactName, email } = await req.json()

    if (!userId || !trialEndsAt) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, trialEndsAt' },
        { status: 400 }
      )
    }

    // Upsert employer_subscriptions row with trialing status
    const { error: subError } = await supabaseAdmin
      .from('employer_subscriptions')
      .upsert({
        user_id: userId,
        subscription_status: 'trialing',
        subscription_tier: 'standard',
        trial_ends_at: trialEndsAt,
      }, {
        onConflict: 'user_id',
      })

    if (subError) {
      console.error('Error upserting employer_subscriptions:', subError)
      return NextResponse.json({ error: subError.message }, { status: 500 })
    }

    // Upsert employer_profiles row
    if (companyName || contactName || email) {
      await supabaseAdmin
        .from('employer_profiles')
        .upsert({
          user_id: userId,
          company_name: companyName || '',
          contact_name: contactName || '',
          email: email || '',
        }, {
          onConflict: 'user_id',
        })
      // Ignore profile upsert errors — subscription row is the critical one
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error activating trial:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to activate trial' },
      { status: 500 }
    )
  }
}
