// THE DUPLICATE CHECK MUST NOT FAIL SILENTLY.
//
// A dedup that quietly does nothing looks EXACTLY like a dedup finding no
// duplicates. Both leave the profile visible, unheld, with no record anywhere —
// so the day the check breaks, nothing changes on any screen and nobody knows
// to look. That is the fault this proves is closed.
//
// TWO KINDS OF "COULD NOT RUN", AND THEY ARE ANSWERED DIFFERENTLY. Getting
// this distinction wrong is what a first attempt did, and it is the whole
// shape of the file:
//
//   AN EVENT — the lookup errored, or threw. It HAPPENED, at a moment, and
//   nothing can reconstruct it afterwards. It must be WRITTEN DOWN as it
//   occurs, or it is gone.
//
//   A PROPERTY — the name has fewer than two words. Still true, still readable
//   on the row, derivable at any time. Storing it would date a record today
//   about something true since July, would go on asserting it after the person
//   completed their name, and would need writes to real candidates' rows to
//   establish a past nobody observed. It is COMPUTED LIVE instead.
//
// So the assertions differ by kind: the event must leave a record, and the
// property must leave NO record while remaining derivable. "Nothing was
// written" is a pass in one case and a failure in the other, which is exactly
// why both are here.
//
// A STUB CLIENT, NOT THE DATABASE, FOR THREE REASONS:
//   1. it can force the lookup to ERROR, which is the case that matters most
//      and the one a real database will not do on request;
//   2. it observes the write itself rather than a row read back afterwards —
//      the RLS-probe lesson, where a refusal from the read-back masqueraded
//      as a refusal of the write;
//   3. no credentials, so this runs inside `npm run verify` every time,
//      rather than being a thing someone remembers to run.
//
// The functions under test are IMPORTED, never restated. A restated gate
// proves only that you restated it consistently.
//
//   npx tsx --conditions=react-server scripts/prove-dedup-not-silent.ts

import type { SupabaseClient } from '@supabase/supabase-js'
import { applyDuplicateHold } from '../lib/applyDuplicateHold'
import { parseHold, nameMatchKey, unkeyableReason } from '../lib/duplicateHold'

const ME = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

type Write = { patch: Record<string, any>; userId: string }

/**
 * Records every write the function attempts.
 *
 * `selectThrows` is deliberately distinct from `selectError`: PostgREST
 * returning `{ error }` and the client throwing are different failures down
 * different branches, and a test that only exercised one would leave the other
 * silent — which is the exact fault being fixed.
 */
function stub(opts: {
  rows?: { user_id: string; full_name: string | null }[]
  selectError?: boolean
  selectThrows?: boolean
  updateError?: boolean
} = {}) {
  const writes: Write[] = []
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            neq(_col: string, _val: string) {
              if (opts.selectThrows) throw new Error('connection reset')
              return Promise.resolve(
                opts.selectError
                  ? { data: null, error: { message: 'PostgREST said no' } }
                  : { data: opts.rows ?? [], error: null },
              )
            },
          }
        },
        update(patch: Record<string, any>) {
          return {
            eq(_col: string, val: string) {
              writes.push({ patch, userId: val })
              return Promise.resolve({ error: opts.updateError ? { message: 'write refused' } : null })
            },
          }
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, writes }
}

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(62) + (detail ?? ''))
  return ok
}

/** The record on the row, read through the real parser rather than by hand. */
const recordOn = (writes: Write[]) => {
  const w = writes.find(x => x.patch.duplicate_hold)
  return w ? parseHold(w.patch.duplicate_hold) : null
}

// Wrapped rather than top-level await: this tsconfig targets a module format
// that does not allow it, and npm run verify type-checks the scripts too.
async function main() {
  console.log('\nTHE HARNESS CAN SEE A WRITE AT ALL')
  // The positive control. Without it, every "no write was made" below could
  // just be a stub that observes nothing — a check that passes because it is
  // blind. This repo has had an emoji grep return nothing while a pencil sat
  // in the file it had just read.
  {
    const { client, writes } = stub({ rows: [{ user_id: OTHER, full_name: 'Rodrigue Tegue' }] })
    const held = await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
    check('a real duplicate is still held', held?.heldAgainst === OTHER, String(held?.heldAgainst))
    check('and the harness observed that write', writes.length === 1, writes.length + ' write(s)')
    check('the held row is hidden', writes[0]?.patch.is_discoverable === false)
    check('with a heldAt, not a not-checked record', !!recordOn(writes)?.heldAt && !recordOn(writes)?.notCheckedAt)
  }

  console.log('\nA SIGNUP THAT WAS CHECKED AND FOUND CLEAN')
  {
    const { client, writes } = stub({ rows: [{ user_id: OTHER, full_name: 'Someone Else' }] })
    const r = await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
    check('nobody is held', r === null)
    check('and NOTHING is written to the row', writes.length === 0, writes.length + ' write(s)')
  }

  console.log('\nTHE EVENT — AN ERRORED LOOKUP MUST LEAVE A RECORD')
  // It happened at a moment and cannot be reconstructed. If it is not written
  // down as it occurs it is gone, and "the dedup stopped working three weeks
  // ago" becomes unanswerable.
  const events: [string, () => Promise<Write[]>][] = [
    ['the lookup returns an error', async () => {
      const { client, writes } = stub({ selectError: true })
      await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
      return writes
    }],
    ['the lookup throws', async () => {
      const { client, writes } = stub({ selectThrows: true })
      await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
      return writes
    }],
  ]
  for (const [label, run] of events) {
    const rec = recordOn(await run())
    check(label, !!rec?.notCheckedAt && rec.notCheckedReason === 'lookup-failed',
      rec?.notCheckedReason ? `reason "${rec.notCheckedReason}"` : 'NO RECORD WRITTEN')
    check('  …stamped with a time', !!rec?.notCheckedAt && !Number.isNaN(Date.parse(rec.notCheckedAt)))
    check('  …and holding nobody', !rec?.heldAt)
  }

  console.log('\nTHE PROPERTY — A NAME WE CANNOT KEY ON MUST LEAVE NO RECORD')
  // The opposite assertion, and deliberately so. A stored record here would be
  // dated today about a state that has been true for weeks, would survive the
  // person fixing their name, and would mean writing to real candidates' rows
  // to establish a past nobody observed.
  const properties: [string, string | null][] = [
    ['no name at all', null],
    ['an empty-string name', '   '],
    ['a single-word name', 'Adnan'],
    ['initials only', 'AK'],
  ]
  for (const [label, name] of properties) {
    const { client, writes } = stub()
    const r = await applyDuplicateHold(client, ME, name)
    check(label + ' — nothing written', writes.length === 0, writes.length + ' write(s)')
    check('  …the signup is let through', r === null)
    // …and the silence is only apparent, because the panel can still see it.
    check('  …but it is DERIVABLE from the name alone', nameMatchKey(name) === null,
      'nameMatchKey → ' + String(nameMatchKey(name)))
  }

  console.log('\nTHE DERIVED COUNT CORRECTS ITSELF; A STORED ONE COULD NOT')
  // The reason for computing rather than storing, asserted rather than
  // asserted in a comment. Somebody completing their name leaves the list on
  // their next page load, with nothing to clean up and nobody to remember.
  {
    check('"Adnan" cannot be matched on', nameMatchKey('Adnan') === null)
    check('"Adnan Karki" can', nameMatchKey('Adnan Karki') !== null, String(nameMatchKey('Adnan Karki')))
    check('SO COMPLETING A NAME REMOVES THE ROW FROM THE LIST',
      nameMatchKey('Adnan') === null && nameMatchKey('Adnan Karki') !== null,
      'no stored record to go stale')
  }

  console.log('\nTHE PANEL CAN SAY WHY, AND THE THIRD REASON IS OURS NOT THEIRS')
  // A first pass had the route derive this itself with one ternary: a name
  // present meant "too short", absent meant "no name". That is WRONG for a
  // real live row, and it put the test in a second place, which is how the
  // three stem lists happened.
  {
    check('a keyable name has no reason', unkeyableReason('Rodrigue Tegue') === null)
    check('an absent name', unkeyableReason(null) === 'no-name', String(unkeyableReason(null)))
    check('a blank name', unkeyableReason('   ') === 'no-name', String(unkeyableReason('   ')))
    check('one word', unkeyableReason('Adnan') === 'one-word', String(unkeyableReason('Adnan')))
    check('two words, one a bare initial', unkeyableReason('Adnan K') === 'one-word',
      String(unkeyableReason('Adnan K')))
    // The live row this exists for: several words, a complete name, and our
    // [^a-z] filter strips every character of it.
    check('a multi-word NON-LATIN name is its own case',
      unkeyableReason('Мария Иванова') === 'non-latin', String(unkeyableReason('Мария Иванова')))
    check('…and is NOT reported as one-word',
      unkeyableReason('Мария Иванова') !== 'one-word',
      'that label would blame the candidate for our matcher')
    check('the three reasons are genuinely distinct',
      new Set([unkeyableReason(null), unkeyableReason('Adnan'), unkeyableReason('Мария Иванова')]).size === 3)
  }

  console.log('\nWHY /api/admin/duplicates MUST REFUSE A NULL KEY')
  // The decide handler selects "the pair" as every row whose key EQUALS this
  // row's key. null === null is true, so without a guard a decision on an
  // unkeyable row would treat every OTHER unkeyable row as its pair — twelve
  // today — and a "different people" verdict writes is_discoverable = true
  // across the whole pair. Twelve unrelated real candidates made visible in
  // one click, two of them deliberately hidden.
  //
  // Unreachable from the page, because an unkeyable row renders no buttons.
  // Reachable from the ROUTE, which takes a userId. This asserts the hazard is
  // real rather than the guard's source text being present — so it stays
  // meaningful if the guard is ever rewritten.
  {
    const a = nameMatchKey('Adnan')
    const b = nameMatchKey('Мария Иванова')
    check('two unrelated unkeyable names both key to null', a === null && b === null)
    check('SO AN UNGUARDED PAIR TEST WOULD MATCH THEM TO EACH OTHER', a === b,
      'which is why the route refuses before selecting a pair')
    check('…while two keyable strangers do not match',
      nameMatchKey('Rodrigue Tegue') !== nameMatchKey('Adnan Karki'))
  }

  console.log('\nTHE QUESTION THAT COULD NOT BE ASKED BEFORE')
  {
    const { client: c1, writes: w1 } = stub({ rows: [{ user_id: OTHER, full_name: 'Someone Else' }] })
    await applyDuplicateHold(c1, ME, 'Rodrigue Tegue')          // checked, clean
    const { client: c2, writes: w2 } = stub({ selectError: true })
    await applyDuplicateHold(c2, ME, 'Rodrigue Tegue')          // could not check

    const cleanRow = recordOn(w1)
    const erroredRow = recordOn(w2)
    // THIS IS THE CONTROL. Both produced no write at all before the change, so
    // this comparison had the same answer in both states and could not have
    // told anyone anything. It now has two.
    check('a checked-clean row carries no record', cleanRow?.notCheckedAt == null)
    check('a row whose lookup errored carries one', erroredRow?.notCheckedAt != null)
    check('SO THE TWO ARE DISTINGUISHABLE FROM THE ROW ALONE',
      (cleanRow?.notCheckedAt ?? null) !== (erroredRow?.notCheckedAt ?? null),
      'this was false before the change — both were null')

    // AND THE HONEST OTHER HALF: a one-word name is NOT distinguishable from a
    // clean check by looking at the row, because neither writes. It is
    // distinguished by the name, which is the entire argument for computing it.
    const { client: c3, writes: w3 } = stub()
    await applyDuplicateHold(c3, ME, 'Adnan')
    check('a one-word name is NOT distinguishable from the row', w3.length === 0 && w1.length === 0)
    check('…it is distinguished by the NAME instead',
      nameMatchKey('Adnan') === null && nameMatchKey('Rodrigue Tegue') !== null)
  }

  console.log('\nAND IT STILL CANNOT BREAK A SIGNUP')
  {
    // The recorder exists so an unchecked signup is visible. It must never be
    // the reason somebody cannot sign up — so its own failure is swallowed,
    // and this asserts that rather than trusting the comment that says so.
    const { client, writes } = stub({ selectError: true, updateError: true })
    let threw: string | null = null
    const r = await applyDuplicateHold(client, ME, 'Rodrigue Tegue').catch((e: any) => { threw = e?.message; return undefined })
    check('a failed record does not throw', threw === null, threw ?? 'clean')
    check('and the signup is let through', r === null)
    check('the attempt was still made', writes.length === 1, writes.length + ' write(s)')

    const t = stub({ selectThrows: true, updateError: true })
    let threw2: string | null = null
    await applyDuplicateHold(t.client, ME, 'Rodrigue Tegue').catch((e: any) => { threw2 = e?.message })
    check('nor when the lookup threw first', threw2 === null, threw2 ?? 'clean')
  }

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED — the duplicate check can still fail silently`
    : '  the event is recorded, the property is derivable, and neither can break a signup')
  process.exit(bad ? 1 : 0)
}

main()
