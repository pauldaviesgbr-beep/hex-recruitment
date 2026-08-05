import { NextRequest, NextResponse } from 'next/server'
import { applyDuplicateHold } from '@/lib/applyDuplicateHold'

// Creates or updates a profile using the service-role client so RLS
// doesn't block the insert before email confirmation completes.
// Supports both candidate_profiles and employer_profiles via the
// optional `table` field (defaults to candidate_profiles).

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, profile, table } = body

    if (!userId || !profile) {
      return NextResponse.json({ error: 'userId and profile required' }, { status: 400 })
    }

    const tableName = table === 'employer_profiles' ? 'employer_profiles' : 'candidate_profiles'

    // New candidates are discoverable by default — being invisible to every
    // employer was the silent default that left 22 of 25 candidates unfindable.
    // Set ONLY on first insert: this is an upsert, and forcing it on every call
    // would flip a candidate who deliberately hid themselves back to visible.
    // The candidate is told plainly at signup and can switch it off with the
    // "Hide my profile" toggle.
    let defaults: Record<string, unknown> = {}
    if (tableName === 'candidate_profiles') {
      const { data: existing } = await supabaseAdmin
        .from('candidate_profiles')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (!existing) defaults = { is_discoverable: true }
    }

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .upsert(
        { user_id: userId, ...defaults, ...profile },
        { onConflict: 'user_id' }
      )
      .select('user_id')

    if (error) {
      console.error('[profile/create] upsert failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // FIRST INSERT ONLY. `defaults` is non-empty exactly when the row did not
    // exist, which is the same signal is_discoverable already relies on — so a
    // candidate editing their own name is never held against themselves.
    if (tableName === 'candidate_profiles' && defaults.is_discoverable) {
      await applyDuplicateHold(supabaseAdmin, userId, (profile as any)?.full_name)
    }

    return NextResponse.json({ ok: true, userId: data?.[0]?.user_id })
  } catch (err: any) {
    console.error('[profile/create] error', err)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
