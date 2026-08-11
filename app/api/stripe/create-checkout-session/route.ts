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
    // Auth check: verify session and use session user ID (never trust client)
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    let sessionUserId: string | null = null
    let sessionEmail: string | null = null
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      sessionUserId = user?.id || null
      sessionEmail = user?.email || null
    }

    const { userId, email } = await req.json()
    // Use session values if available, fall back to request body for backwards compat
    const safeUserId = sessionUserId || userId
    const safeEmail = sessionEmail || email

    if (!safeUserId || !safeEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email' },
        { status: 400 }
      )
    }

    if (!STRIPE_PRICE_ID) {
      return NextResponse.json(
        { error: 'STRIPE_PRICE_ID is not configured' },
        { status: 500 }
      )
    }

    // Check if user already has a Stripe customer ID
    const { data: existingSub } = await supabaseAdmin
      .from('employer_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', safeUserId)
      .single()

    let customerId = existingSub?.stripe_customer_id

    // Create a new Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: safeEmail,
        metadata: {
          supabase_user_id: safeUserId,
        },
      })
      customerId = customer.id

      // Upsert the subscription record with the customer ID
      await supabaseAdmin
        .from('employer_subscriptions')
        .upsert({
          user_id: safeUserId,
          stripe_customer_id: customerId,
          subscription_status: 'inactive',
        }, {
          onConflict: 'user_id',
        })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: TRIAL_DURATION_DAYS,
        metadata: {
          supabase_user_id: safeUserId,
          tier: 'standard',
        },
      },
      success_url: `${baseUrl}/employer/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe`,
      metadata: {
        supabase_user_id: safeUserId,
        tier: 'standard',
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
