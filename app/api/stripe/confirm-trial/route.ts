import { NextRequest, NextResponse } from 'next/server'
import { PAID_SURFACES_ENABLED, BILLING_NOT_LIVE_MESSAGE } from '@/lib/paidSurfaces'
import { stripe, STRIPE_PRICE_ID } from '@/lib/stripe'
import { TRIAL_DURATION_DAYS } from '@/lib/trialUtils'

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  // PAID SURFACES ARE OFF. A hidden button is not a gate — the jobs-insert hole
  // was exactly that lesson — so the refusal lives here, where the money would
  // actually be taken, and does not depend on any UI having hidden a control.
  if (!PAID_SURFACES_ENABLED) {
    return NextResponse.json({ error: BILLING_NOT_LIVE_MESSAGE }, { status: 403 })
  }

  try {
    const { userId, customerId, paymentMethodId } = await req.json()

    if (!userId || !customerId || !paymentMethodId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!STRIPE_PRICE_ID) {
      return NextResponse.json({ error: 'STRIPE_PRICE_ID not configured' }, { status: 500 })
    }

    // Attach payment method to customer and set as default
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })

    // Create subscription with trial
    const trialEnd = Math.floor(Date.now() / 1000) + TRIAL_DURATION_DAYS * 24 * 60 * 60

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: STRIPE_PRICE_ID }],
      trial_end: trialEnd,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        supabase_user_id: userId,
        tier: 'standard',
      },
    })

    // Write subscription data to Supabase
    const trialEndsAt = new Date(trialEnd * 1000).toISOString()

    await supabaseAdmin
      .from('employer_subscriptions')
      .upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          subscription_status: 'trialing',
          subscription_tier: 'standard',
          trial_ends_at: trialEndsAt,
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({
      subscriptionId: subscription.id,
      status: subscription.status,
      trialEndsAt,
    })
  } catch (error: any) {
    console.error('[confirm-trial]', error.message)
    return NextResponse.json({ error: error.message || 'Failed to create trial subscription' }, { status: 500 })
  }
}
