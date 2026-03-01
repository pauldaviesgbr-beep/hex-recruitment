import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Use service role for webhook writes (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // ── Subscription checkout ──────────────────────────
        if (session.mode === 'subscription') {
          const userId = session.metadata?.supabase_user_id
          const tier = session.metadata?.tier

          if (userId && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription as string
            )

            await supabaseAdmin
              .from('employer_subscriptions')
              .upsert({
                user_id: userId,
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: subscription.id,
                subscription_status: subscription.status,
                subscription_tier: tier || 'standard',
                trial_ends_at: subscription.trial_end
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : null,
                cancel_at: subscription.cancel_at
                  ? new Date(subscription.cancel_at * 1000).toISOString()
                  : null,
                cancel_at_period_end: subscription.cancel_at_period_end,
              }, {
                onConflict: 'user_id',
              })
          }
        }

        // ── One-time boost payment ─────────────────────────
        if (session.mode === 'payment') {
          const boostType = session.metadata?.boost_type
          const duration = session.metadata?.duration
          const itemId = session.metadata?.item_id
          const userId = session.metadata?.user_id

          if (boostType && duration && itemId && userId) {
            const days = parseInt(duration, 10)
            const now = new Date()
            const expiresAt = new Date(now.getTime() + days * 86400000)

            // Map duration to tier ID
            const tierMap: Record<number, string> = {
              7: '7_days',
              14: '14_days',
              30: '30_days',
            }

            await supabaseAdmin
              .from('boosts')
              .insert({
                user_id: userId,
                boost_type: boostType,
                target_id: itemId,
                tier: tierMap[days] || '7_days',
                price_paid: session.amount_total ? session.amount_total / 100 : 0,
                starts_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                is_active: true,
              })
          }
        }

        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id

        const updateData = {
          subscription_status: subscription.status,
          cancel_at: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_ends_at: subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toISOString()
            : null,
        }

        if (userId) {
          await supabaseAdmin
            .from('employer_subscriptions')
            .update(updateData)
            .eq('user_id', userId)
        } else {
          await supabaseAdmin
            .from('employer_subscriptions')
            .update(updateData)
            .eq('stripe_subscription_id', subscription.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id

        const updateData = {
          subscription_status: 'canceled',
          cancel_at_period_end: false,
        }

        if (userId) {
          await supabaseAdmin
            .from('employer_subscriptions')
            .update(updateData)
            .eq('user_id', userId)
        } else {
          await supabaseAdmin
            .from('employer_subscriptions')
            .update(updateData)
            .eq('stripe_subscription_id', subscription.id)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        // In Stripe v20+, subscription is under parent.subscription_details
        const subDetails = invoice.parent?.subscription_details
        const subscriptionRef = subDetails?.subscription
        const subscriptionId = typeof subscriptionRef === 'string'
          ? subscriptionRef
          : subscriptionRef?.id || null

        if (subscriptionId) {
          await supabaseAdmin
            .from('employer_subscriptions')
            .update({
              subscription_status: 'past_due',
            })
            .eq('stripe_subscription_id', subscriptionId)
        }
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
