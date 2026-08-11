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
    const { paymentIntentId, boost_type, duration, item_id, user_id } = await req.json()

    if (!paymentIntentId || !boost_type || !duration || !item_id || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the payment succeeded
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (pi.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    // Verify metadata matches to prevent replay attacks
    if (pi.metadata.user_id !== user_id || pi.metadata.item_id !== item_id) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 403 })
    }

    const daysMap: Record<string, number> = { '7_days': 7, '14_days': 14, '30_days': 30 }
    const days = daysMap[duration]
    if (!days) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    const { error: insertError } = await supabaseAdmin
      .from('boosts')
      .insert({
        user_id,
        boost_type,
        target_id: item_id,
        tier: duration,
        price_paid: pi.amount / 100,
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true,
      })

    if (insertError) {
      console.error('[activate-boost] insert failed:', insertError.message)
      return NextResponse.json({ error: 'Failed to activate boost' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      expires_at: expiresAt.toISOString(),
    })
  } catch (error: any) {
    console.error('[activate-boost]', error.message)
    return NextResponse.json({ error: error.message || 'Failed to activate boost' }, { status: 500 })
  }
}
