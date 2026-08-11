'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import { BILLING_NOT_LIVE_MESSAGE } from '@/lib/paidSurfaces'

/**
 * What a billing route shows while PAID_SURFACES_ENABLED is false.
 *
 * AN HONEST PAGE RATHER THAN A 404, deliberately. These routes are linked from
 * old emails, from browser history and from the Stripe portal's return_url — a
 * 404 tells an employer their account is broken, which is both alarming and
 * untrue. This tells them the truth: there is nothing to pay, and nothing has
 * gone wrong.
 *
 * It also says what they actually have, because "billing isn't live" on its own
 * invites the question "so am I about to lose access?". They are not.
 */
export default function BillingNotLive() {
  return (
    <main>
      <Header />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1.25rem' }}>
        <h1 style={{ margin: '0 0 1rem', fontSize: '1.5rem', fontWeight: 700, color: '#0F172A' }}>
          Billing isn&rsquo;t live yet
        </h1>
        <p style={{ margin: '0 0 1.5rem', color: '#334155', lineHeight: 1.6 }}>
          {BILLING_NOT_LIVE_MESSAGE}
        </p>
        {/* Wraps rather than scrolls — a control row that runs off the edge
            hides a whole control, and one of these is the way out. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          <Link
            href="/employer/dashboard"
            style={{
              padding: '0.65rem 1.15rem', borderRadius: 8, background: '#0F172A',
              color: '#fff', fontWeight: 600, textDecoration: 'none',
            }}
          >
            Back to your dashboard
          </Link>
          <Link
            href="/post-job"
            style={{
              padding: '0.65rem 1.15rem', borderRadius: 8, border: '1px solid #CBD5E1',
              background: '#fff', color: '#0F172A', fontWeight: 600, textDecoration: 'none',
            }}
          >
            Post a job
          </Link>
        </div>
      </div>
    </main>
  )
}
