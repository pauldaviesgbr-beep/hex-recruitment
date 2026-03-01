import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

// Map boost_type + duration to env var Price IDs
const BOOST_PRICE_IDS: Record<string, string | undefined> = {
  'profile_7':  process.env.STRIPE_BOOST_PROFILE_7_PRICE_ID,
  'profile_14': process.env.STRIPE_BOOST_PROFILE_14_PRICE_ID,
  'profile_30': process.env.STRIPE_BOOST_PROFILE_30_PRICE_ID,
  'job_7':      process.env.STRIPE_BOOST_JOB_7_PRICE_ID,
  'job_14':     process.env.STRIPE_BOOST_JOB_14_PRICE_ID,
  'job_30':     process.env.STRIPE_BOOST_JOB_30_PRICE_ID,
}

export async function POST(req: NextRequest) {
  try {
    const { boost_type, duration, item_id, user_id, email } = await req.json()

    if (!boost_type || !duration || !item_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields: boost_type, duration, item_id, user_id' },
        { status: 400 }
      )
    }

    if (boost_type !== 'job' && boost_type !== 'profile') {
      return NextResponse.json(
        { error: 'Invalid boost_type. Must be "job" or "profile"' },
        { status: 400 }
      )
    }

    if (![7, 14, 30].includes(duration)) {
      return NextResponse.json(
        { error: 'Invalid duration. Must be 7, 14, or 30' },
        { status: 400 }
      )
    }

    const priceKey = `${boost_type}_${duration}`
    const priceId = BOOST_PRICE_IDS[priceKey]

    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price ID not configured for ${priceKey}` },
        { status: 500 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        boost_type,
        duration: String(duration),
        item_id,
        user_id,
      },
      success_url: `${baseUrl}/boost/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/boost/cancel`,
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('Error creating boost checkout session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create boost checkout session' },
      { status: 500 }
    )
  }
}
