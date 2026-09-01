import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { eraseAccount } from '@/lib/eraseAccount'
import { blockers, employerBlockers, EMPLOYER_ERASURE_PLAN, type TableRule } from '@/lib/erasure'

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
  // ASKED OF BOTH PLANS, because at this point we do not yet know which one
  // this caller needs — that requires the admin client and a profile lookup.
  // Refusing on either is the conservative order: a blocked rule means a
  // decision nobody has made, and we would rather refuse a deletion we could
  // have done than half-do one we could not.
  const blocked = [...blockers(), ...employerBlockers()]
  if (blocked.length) {
    console.error('[account/delete] refusing — blocked rules:', blocked.map(b => b.table).join(', '))
    return NextResponse.json({
      error: 'We cannot complete this automatically yet. Email contact@thrivecareer.co.uk and we will ' +
             'do it by hand within 30 days.',
      blocked: blocked.map(b => b.table),
    }, { status: 503 })
  }

  const admin = createClient(url, service, { auth: { persistSession: false } })

  // WHICH KIND OF ACCOUNT IS THIS? THE SIGNAL IS A ROW, NOT A CLAIM.
  //
  // user_metadata.role is writable by the user themselves —
  // supabase.auth.updateUser({ data: { role: 'employee' } }) — so the client's
  // idea of who it is cannot decide anything here. Owning an employer_profiles
  // row is a database fact they cannot forge. Where the two disagree, this wins.
  //
  // ⚠️ AND THE COMMENT THAT USED TO SIT HERE WAS FALSE: "employer_profiles, jobs
  // and subscriptions have no foreign key either, so nothing cascades." All
  // three CASCADE from auth.users, as do about 55 other columns — measured from
  // pg_constraint on 1 Sept 2026; information_schema returns nothing for these
  // tables, which is why it was believed. It inverted the fear: the worry was
  // that an employer would lose their login while their adverts stayed on the
  // board owned by nobody. The opposite was true — the adverts, and every
  // candidate application underneath them, were DELETED by the cascade. That is
  // why the employer plan repoints jobs.employer_id at the tombstone rather
  // than merely archiving. See the audit at the top of lib/erasure.ts.
  //
  // A TEAM MEMBER IS DELIBERATELY NOT AN EMPLOYER BY THIS TEST. They hold no
  // employer_profiles row of their own, employer_members is in the candidate
  // plan, and their leaving costs the employer nothing — so they take the
  // ordinary path. Note that the three invite routes stamp role: 'employer'
  // into their metadata, which is exactly why the metadata cannot be the test.
  //
  // AND IT GOES HERE, BEFORE eraseAccount, not inside it: a refusal that
  // arrives after the first table has been written is a half-erased account
  // that also returned a tidy error.
  const { data: employerProfile } = await admin
    .from('employer_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  // ── THE EMPLOYER PATH ───────────────────────────────────────────────────
  //
  // THIS USED TO BE A 409 POINTING AT AN EMAIL ADDRESS. It was replaced on
  // 1 Sept 2026 because an app that offers account CREATION must offer account
  // DELETION in the app (App Store Guideline 5.1.1(v)) — and "Hire on Thrive"
  // is the primary call to action on our own launch screen, so employer signup
  // is not some side door. Our own Terms promised this route in three places
  // while it did not exist, which made it wrong independently of Apple.
  //
  // The whole difference is WHICH PLAN RUNS. Everything else — authenticating
  // the caller as themselves, the typed confirmation, the receipt, the refusal
  // to touch auth.users if anything failed — is identical, because it should be.
  let plan: TableRule[] | undefined
  let profileId: string | null = null

  if (employerProfile) {
    profileId = employerProfile.id as string

    // REFUSAL: OTHER TEAM MEMBERS.
    //
    // Deleting the owner from under a colleague still using the account would
    // break their access with no warning and nothing to point at. The owner is
    // told what to do instead. Ownership TRANSFER is a real feature and a
    // deliberate follow-up — the refusal is what makes it safe to ship without.
    //
    // KEYED ON THE PROFILE ID, NOT THE USER ID. employer_members is the one
    // table in the schema that is, and matching the wrong one here would find
    // nobody and let the deletion proceed — a refusal that silently never fires
    // is worse than no refusal, because it looks like a guard.
    const { data: members, error: memberErr } = await admin
      .from('employer_members')
      .select('user_id, invited_email, status')
      .eq('employer_id', profileId)

    if (memberErr) {
      console.error('[account/delete] could not read the team', memberErr.message)
      return NextResponse.json({
        error: 'We could not check whether anyone else is on your account, so nothing has been deleted. ' +
               'Please try again, or email contact@thrivecareer.co.uk.',
      }, { status: 503 })
    }

    // Anyone who is not the owner counts — including an invitation that has
    // been sent but not accepted, which still has somebody's address on it.
    const others = (members || []).filter(m => m.user_id !== user.id)
    if (others.length) {
      return NextResponse.json({
        error: `There ${others.length === 1 ? 'is 1 other person' : `are ${others.length} other people`} ` +
               `on this company account. Remove them from Settings → Team first, then come back — ` +
               `deleting now would take away their access without warning.`,
        reason: 'team_members_remain',
        count: others.length,
      }, { status: 409 })
    }

    plan = EMPLOYER_ERASURE_PLAN
  }

  const receipt = await eraseAccount(admin, user.id, {
    email: user.email || null,
    plan,
    profileId,
  })

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
