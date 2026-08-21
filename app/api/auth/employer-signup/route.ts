import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidEmail } from '@/lib/validateEmail'
import { classifyEmail } from '@/lib/emailDomains'

// Server-side wrapper around supabase.auth.signUp() for the employer
// signup flow. Lives behind a Next.js route so we can:
//   - hard-reject disposable-email domains BEFORE any auth.users row is
//     created (a denylist applied in the form would be trivially
//     bypassed by anyone calling supabase.auth.signUp() directly).
//   - stamp the domain classification (business|freemail) into
//     user_metadata server-side, so the post-confirmation handler can
//     branch on it without trusting client-supplied data.
//
// Supabase still sends the confirmation email — we call signUp() with
// the anon key from here, which uses the same email-confirmation path
// the browser would have used directly. emailRedirectTo points at
// /auth/confirm?role=employer, same as before.

/**
 * WHAT TO SAY WHEN THE EMAIL IS ALREADY IN USE.
 *
 * This used to say "This email is already in use. Try logging in instead."
 * — which is sound advice if the existing account is an employer, and a DEAD
 * END if it is a job seeker: the employer login gates on
 * user_metadata.role === 'employer', so following the instruction lands them
 * nowhere.
 *
 * That dead end has already cost us. Ricci Courtney had signed up as a
 * candidate with his work address, tried to create an employer account with
 * it, was told to log in instead, and — when that went nowhere — created two
 * more employer accounts on personal addresses. Both were rejected by hand,
 * and the whole thing took a manual conversion to untangle. The next person
 * it hits is a chef who signed up to browse jobs and later wants to advertise,
 * which is an ordinary thing to happen.
 *
 * The lookup is candidate_profiles rather than auth.users: it carries the
 * email, and listing auth users to answer one question is a page-scan.
 *
 * A NOTE ON WHAT THIS REVEALS. The 409 already confirmed that an address is
 * registered, so enumeration is not new here; naming the SIDE is. On a job
 * board "this person is a job seeker" is the fact candidates most want kept
 * quiet — it is why the discoverability machinery exists at all. Flagged
 * rather than decided in passing: the trade was made deliberately for the
 * person who is stuck, and it can be softened to "this email already has a
 * Thrive account" without losing most of the benefit.
 */

async function clashMessage(email: string, mentionGoogle = false): Promise<string> {
  const generic = mentionGoogle
    ? 'This email is already registered. Try logging in instead, or use "Continue with Google" if you signed up with Google.'
    : 'This email is already in use. Try logging in instead.'
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceKey || !url) return generic
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data } = await admin
      .from('candidate_profiles')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle()
    if (data) {
      return 'That email is already registered as a job seeker account. Use a different email for your employer account.'
    }
  } catch {
    // A failed lookup must never block a signup response. The generic
    // message is still true, just less useful.
  }
  return generic
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = (body.email || '').trim()
    const password = body.password || ''
    const companyName = (body.companyName || '').trim()
    const contactName = (body.contactName || '').trim()
    // Signup source attribution (first-party ref/utm + self-reported dropdown).
    // Stamped into user_metadata so lib/authCallback persists it at provisioning.
    const attr = body.attribution && typeof body.attribution === 'object' ? body.attribution : {}

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })
    }
    if (!contactName) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
    }

    const classification = classifyEmail(email)

    if (classification === 'disposable') {
      return NextResponse.json(
        {
          error:
            'Disposable email addresses aren’t accepted. Please sign up with a work or personal email.',
          code: 'disposable_email',
        },
        { status: 422 },
      )
    }

    // Server-side anon-key client. Calling signUp here triggers
    // Supabase's confirmation email exactly as the browser SDK would.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Auth not configured.' }, { status: 500 })
    }
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: contactName,
          company_name: companyName,
          role: 'employer',
          email_domain_class: classification, // 'business' | 'freemail' — set server-side, tamper-proof
          signup_ref: attr.signup_ref || null,
          utm_source: attr.utm_source || null,
          utm_medium: attr.utm_medium || null,
          utm_campaign: attr.utm_campaign || null,
          heard_from: attr.heard_from || null,
          // The referrer host, forwarded like the rest. Without this line the
          // employer email path would be the one signup route that drops it —
          // and it is the route most likely to carry it, because employers
          // arrive from a LinkedIn post rather than a tagged link.
          referrer_host: attr.referrer_host || null,
        },
        emailRedirectTo: `${siteUrl}/auth/confirm?role=employer`,
      },
    })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already') || msg.includes('registered')) {
        return NextResponse.json(
          { error: await clashMessage(email), code: 'already_registered' },
          { status: 409 },
        )
      }
      if (msg.includes('password')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Supabase anti-enumeration: returns a user with empty identities[]
    // when the email is already registered. Treat the same as 409.
    if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
      return NextResponse.json(
        { error: await clashMessage(email, true), code: 'already_registered' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      ok: true,
      userId: data.user?.id || null,
      classification,
    })
  } catch (err: any) {
    console.error('[employer-signup] error', err?.message, err?.stack?.slice(0, 300))
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 })
  }
}
