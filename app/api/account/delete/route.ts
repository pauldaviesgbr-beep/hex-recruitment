import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { eraseAccount } from '@/lib/eraseAccount'
import { blockers } from '@/lib/erasure'

// THE DOOR. This one actually deletes.
//
// Apple App Store Review Guideline 5.1.1(v) requires a user to INITIATE AND
// COMPLETE account deletion from inside the app. "Contact support" is a
// documented rejection reason, and so — in substance — is a request form that
// ends at a human doing it by hand. This is the endpoint that makes the
// account genuinely go.
//
// EVERY DECISION LIVES IN lib/erasure.ts, NOT HERE. This route authenticates,
// confirms intent, and calls the plan. Nothing about what happens to which
// table is decided in this file, so the answer to "what did we delete" is a
// readable list rather than a trace through an HTTP handler.
//
// ORDER: storage → tables → auth.users. Enforced in eraseAccount and load
// bearing: an auth row deleted before its files leaves them unattributable.

export const dynamic = 'force-dynamic'

/** Typed by the person, so it cannot be an accidental tap or a stray fetch. */
const CONFIRM_PHRASE = 'DELETE'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: userErr } = await asUser.auth.getUser()
  if (userErr || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // THE CONFIRMATION IS A TYPED WORD, NOT A SECOND BUTTON.
  // Irreversible, so it must not be reachable by an accidental tap — but the
  // screen states plainly what happens and does not argue. No guilt copy, no
  // retention offer, no hidden control. Apple asks for a confirmation step;
  // it does not ask us to talk anyone out of it, and a flow that does is a
  // dark pattern.
  let body: any = {}
  try { body = await req.json() } catch { /* empty body */ }
  if (body?.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Type ${CONFIRM_PHRASE} to confirm.` }, { status: 400 })
  }

  // A DECLARED BLOCKER STOPS THE WHOLE THING.
  // If any table in the plan cannot be carried out as decided, erasing the
  // rest would leave the person partly deleted while telling them it was
  // done — which is the exact class of fault this feature exists to end.
  // Better to refuse loudly and route them to a human.
  const blocked = blockers()
  if (blocked.length) {
    console.error('[account/delete] refusing — blocked rules:', blocked.map(b => b.table).join(', '))
    return NextResponse.json({
      error: 'We cannot complete this automatically yet. Email contact@thrivecareer.co.uk and we will ' +
             'do it by hand within 30 days.',
      blocked: blocked.map(b => b.table),
    }, { status: 503 })
  }

  const admin = createClient(url, service, { auth: { persistSession: false } })

  // AN EMPLOYER MAY NOT SELF-DELETE, AND THE CHECK GOES HERE — BEFORE
  // eraseAccount, not inside it, because a refusal after the first table is a
  // half-erased account.
  //
  // THE ERASURE PLAN IS CANDIDATE-SHAPED. Every rule in it reasons about a
  // candidate, and employer_profiles, jobs and subscriptions are not in it at
  // all. None of those tables has a foreign key either, so nothing cascades.
  // An employer running this would lose their login while their company
  // profile and every advert stayed on the public board, owned by a user id
  // that no longer exists. 9 employers, 319 adverts, 251 of them live.
  //
  // THE SIGNAL IS A ROW, NOT A CLAIM. user_metadata.role is writable by the
  // user — supabase.auth.updateUser({ data: { role: 'employee' } }) — so the
  // client's idea of who it is cannot gate this. Owning an employer_profiles
  // row is a database fact they cannot forge. Where the two disagree, this
  // wins.
  //
  // A TEAM MEMBER IS NOT CAUGHT BY THIS, deliberately: they hold no
  // employer_profiles row of their own, employer_members IS in the erasure
  // plan, and their leaving costs the employer nothing.
  //
  // THIS IS A GATE, NOT AN ANSWER. What should happen to an employer's
  // adverts, and to the candidate applications underneath them, is a product
  // decision nobody has made. See CLAUDE.md.
  const { data: employerProfile } = await admin
    .from('employer_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (employerProfile) {
    console.warn('[account/delete] refusing — caller owns an employer profile', user.id)
    return NextResponse.json({
      error: 'Employer accounts cannot be closed automatically, because job adverts and the ' +
             'applications candidates have sent to them have to be dealt with first. Email ' +
             'contact@thrivecareer.co.uk and we will close it for you.',
      reason: 'employer_account',
    }, { status: 409 })
  }

  const receipt = await eraseAccount(admin, user.id, { email: user.email || null })

  // THE RECEIPT IS THE ANSWER TO "DID WE ACTUALLY ERASE THEM" SIX MONTHS ON.
  // Logged rather than returned in full: the person does not need a table
  // dump, and by the time this resolves their account is gone anyway.
  console.log('[account/delete]', JSON.stringify({
    userId: receipt.userId,
    storage: receipt.storage.deleted,
    tables: receipt.tables.filter(t => t.affected > 0).map(t => `${t.table}:${t.action}:${t.affected}`),
    authDeleted: receipt.authDeleted,
    errors: receipt.errors,
  }))

  if (!receipt.authDeleted) {
    // eraseAccount deliberately skips auth.users when anything earlier failed,
    // so this is the recoverable state: the person still exists, the run can
    // be repeated, and nothing has been orphaned.
    return NextResponse.json({
      error: 'Something went wrong and your account has NOT been deleted. Nothing is lost. Please email ' +
             'contact@thrivecareer.co.uk and we will finish it by hand.',
      detail: receipt.errors,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: true })
}
