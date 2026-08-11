import { NextRequest, NextResponse } from 'next/server'
import { PAID_SURFACES_ENABLED, BILLING_NOT_LIVE_MESSAGE } from '@/lib/paidSurfaces'
import { stripe } from '@/lib/stripe'

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  // PAID SURFACES ARE OFF. A hidden button is not a gate — the jobs-insert hole
  // was exactly that lesson — so the refusal lives here, where the money would
  // actually be taken, and does not depend on any UI having hidden a control.
  if (!PAID_SURFACES_ENABLED) {
    return NextResponse.json({ error: BILLING_NOT_LIVE_MESSAGE }, { status: 403 })
  }

  try {
    const { userId, email } = await req.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing userId or email' }, { status: 400 })
    }

    // Check if user already has a Stripe customer
    const { data: existingSub } = await supabaseAdmin
      .from('employer_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle()

    let customerId = existingSub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id

      // Upsert the subscription record with the customer ID
      await supabaseAdmin
        .from('employer_subscriptions')
        .upsert(
          { user_id: userId, stripe_customer_id: customerId, subscription_status: 'inactive' },
          { onConflict: 'user_id' }
        )
    }

    // Create SetupIntent so the client can collect card details
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { supabase_user_id: userId },
    })

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId,
    })
  } catch (error: any) {
    console.error('[setup-trial]', error.message)
    return NextResponse.json({ error: error.message || 'Failed to create setup intent' }, { status: 500 })
  }
}
