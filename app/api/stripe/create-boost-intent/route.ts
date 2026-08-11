import { NextRequest, NextResponse } from 'next/server'
import { PAID_SURFACES_ENABLED, BILLING_NOT_LIVE_MESSAGE } from '@/lib/paidSurfaces'
import { stripe } from '@/lib/stripe'
import { PROFILE_BOOST_TIERS, JOB_BOOST_TIERS } from '@/lib/boostTypes'

export async function POST(req: NextRequest) {
  // PAID SURFACES ARE OFF. A hidden button is not a gate — the jobs-insert hole
  // was exactly that lesson — so the refusal lives here, where the money would
  // actually be taken, and does not depend on any UI having hidden a control.
  if (!PAID_SURFACES_ENABLED) {
    return NextResponse.json({ error: BILLING_NOT_LIVE_MESSAGE }, { status: 403 })
  }

  try {
    const { boost_type, duration, item_id, user_id, email } = await req.json()

    if (!boost_type || !duration || !item_id || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const tiers = boost_type === 'profile' ? PROFILE_BOOST_TIERS : JOB_BOOST_TIERS
    const tier = tiers.find(t => t.id === duration)
    if (!tier) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
    }

    // Amount in pence
    const amount = Math.round(tier.price * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      metadata: {
        boost_type,
        duration,
        item_id,
        user_id,
        tier_label: tier.label,
        price: tier.price.toString(),
      },
      receipt_email: email || undefined,
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount,
    })
  } catch (error: any) {
    console.error('[create-boost-intent]', error.message)
    return NextResponse.json({ error: error.message || 'Failed to create payment' }, { status: 500 })
  }
}
