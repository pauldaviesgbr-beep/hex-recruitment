import Link from 'next/link'
import { redirect } from 'next/navigation'

// Confirmation for the one-click opt-out. Pure render — the write happens in
// /api/candidate/stay-hidden, which redirects here, so refreshing this page
// can't re-run anything.
//
// WITH ONE EXCEPTION, AND IT IS A REPAIR RATHER THAN A DESIGN: a request that
// arrives here CARRYING A TOKEN is forwarded to the verifier. See below.

export const metadata = { title: 'Your profile stays hidden — Thrive' }

type Status = 'ok' | 'already' | 'invalid' | 'notfound' | 'error'

const MESSAGES: Record<Status, { heading: string; body: string }> = {
  ok: {
    heading: "Done — you'll stay hidden",
    body: 'Your profile will not be shown to employers. Nothing else changes, and you can turn visibility on whenever you want with the visibility switch at the top of your dashboard.',
  },
  already: {
    heading: "You're already hidden",
    body: 'We had already recorded this, so there was nothing to change. Your profile is not shown to employers.',
  },
  invalid: {
    // SAY WHAT HAPPENED OR SAY NOTHING — NEVER INVENT A REASON.
    //
    // This used to read "That link has expired / Opt-out links stop working
    // after a few weeks." It was shown for a link with TWELVE DAYS still to
    // run, and the real cause was a signature that could not be verified. The
    // wrong explanation sent two people looking at expiry rather than at the
    // signature, and cost most of a day.
    //
    // `invalid` is returned for several distinct reasons and this page cannot
    // tell them apart. So it no longer tries. What it says instead is true in
    // every one of those cases, including the ones not yet found — and it still
    // gets the person to the thing that always works.
    heading: "That link didn't work",
    body: 'Sorry — we couldn’t action that one. You can do it yourself in a couple of taps: sign in and turn off the visibility switch at the top of your dashboard.',
  },
  notfound: {
    heading: "We couldn't find that profile",
    body: 'The link may belong to an account that has since been removed. If you think this is wrong, reply to the email we sent you and we\'ll sort it out.',
  },
  error: {
    heading: 'Something went wrong at our end',
    body: 'Your profile has not been changed. Please try the link again in a few minutes, or turn off the visibility switch at the top of your dashboard.',
  },
}

export default async function StayHiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>
}) {
  const { status, token } = await searchParams

  // ── THE FORWARD ────────────────────────────────────────────────────
  //
  // The notice sent on 26 July linked NINE PEOPLE here — to this page — with
  // their token in the query string, because the send path built a different
  // URL from the one the test paths built. This page reads `status`, so the
  // token was never looked at, and every one of those clicks fell through to
  // the 'invalid' default below. The button was wired to nothing for fourteen
  // days.
  //
  // Fixing the sender fixes the NEXT send and does nothing for the emails
  // already sitting in nine inboxes. Those links cannot be edited. So a token
  // arriving here is handed to the route that can actually use it, and their
  // existing emails start working retroactively.
  //
  // A FORWARD, NOT A SECOND IMPLEMENTATION. One place verifies tokens. This
  // page never learns what a signature is.
  //
  // No loop is possible: the verifier redirects back with `status` and never a
  // `token`, and this branch requires a token and no status.
  if (token && !status) {
    // The page says nothing about any of this — a candidate arriving from a
    // July email should just have it work, not be told our routing was wrong.
    // The record goes here, where it belongs.
    console.warn('[stay-hidden] token-bearing request hit the PAGE — forwarding to the verifier (pre-fix link)')
    redirect(`/api/candidate/stay-hidden?token=${encodeURIComponent(token)}`)
  }

  const key: Status = (['ok', 'already', 'invalid', 'notfound', 'error'] as const).includes(status as Status)
    ? (status as Status)
    : 'invalid'
  const { heading, body } = MESSAGES[key]
  const good = key === 'ok' || key === 'already'

  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ maxWidth: 520, width: '100%', background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            width: 44, height: 44, margin: '0 auto 18px', borderRadius: '50%',
            background: good ? '#ecfdf5' : '#fef3c7',
            color: good ? '#059669' : '#b45309',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
          }}
        >
          {good ? '✓' : '!'}
        </div>
        <h1 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{heading}</h1>
        <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.6, color: '#475569' }}>{body}</p>
        <Link
          href="/dashboard"
          style={{ display: 'inline-block', padding: '12px 26px', background: '#FFE500', color: '#0f172a', fontWeight: 700, fontSize: 15, borderRadius: 9, textDecoration: 'none' }}
        >
          Go to your dashboard
        </Link>
      </div>
    </main>
  )
}
