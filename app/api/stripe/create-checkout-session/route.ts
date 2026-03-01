import { NextRequest, NextResponse } from 'next/server'
import { stripe, STRIPE_PRICES } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { tier, userId, email } = await req.json()

    if (!tier || !userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: tier, userId, email' },
        { status: 400 }
      )
    }

    if (tier !== 'standard' && tier !== 'professional') {
      return NextResponse.json(
        { error: 'Invalid tier. Must be "standard" or "professional"' },
        { status: 400 }
      )
    }

    const priceId = STRIPE_PRICES[tier as keyof typeof STRIPE_PRICES]
    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe price ID not configured for this tier' },
        { status: 500 }
      )
    }

    // Check if user already has a Stripe customer ID
    const { data: existingSub } = await supabaseAdmin
      .from('employer_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    let customerId = existingSub?.stripe_customer_id

    // Create a new Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          supabase_user_id: userId,
        },
      })
      customerId = customer.id

      // Upsert the subscription record with the customer ID
      await supabaseAdmin
        .from('employer_subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          subscription_status: 'inactive',
        }, {
          onConflict: 'user_id',
        })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          supabase_user_id: userId,
          tier,
        },
      },
      success_url: `${baseUrl}/employer/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe`,
      metadata: {
        supabase_user_id: userId,
        tier,
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
