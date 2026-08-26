// THE DUPLICATE CHECK MUST NOT FAIL SILENTLY.
//
// A dedup that quietly does nothing looks EXACTLY like a dedup finding no
// duplicates. Both leave the profile visible, unheld, with no record anywhere —
// so the day the check breaks, nothing changes on any screen and nobody knows
// to look. That is the fault this proves is closed.
//
// THE DISCRIMINATING QUESTION, and it is the whole point of the file:
// can you tell a signup that was CHECKED AND FOUND CLEAN from one the check
// COULD NOT RUN ON, by looking at the row? Before this change the answer was
// no — neither wrote anything — which is why "is the dedup working" had no
// answer short of reading serverless logs this project cannot read back.
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
// The function under test is IMPORTED, never restated. A restated gate proves
// only that you restated it consistently.
//
//   npx tsx scripts/prove-dedup-not-silent.ts

import type { SupabaseClient } from '@supabase/supabase-js'
import { applyDuplicateHold } from '../lib/applyDuplicateHold'
import { parseHold } from '../lib/duplicateHold'

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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(60) + (detail ?? ''))
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
  // The positive control. Without it, every "no write was made" below could just
  // be a stub that observes nothing — a check that passes because it is blind.
  {
    const { client, writes } = stub({ rows: [{ user_id: OTHER, full_name: 'Rodrigue Tegue' }] })
    const held = await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
    check('a real duplicate is still held', held?.heldAgainst === OTHER, String(held?.heldAgainst))
    check('and the harness observed that write', writes.length === 1, writes.length + ' write(s)')
    check('the held row is hidden', writes[0]?.patch.is_discoverable === false)
    check('with a heldAt, not a not-checked record', !!recordOn(writes)?.heldAt && !recordOn(writes)?.notCheckedAt)
  }

  console.log('\nA SIGNUP THAT WAS CHECKED AND FOUND CLEAN')
  const cleanWrites = (() => {
    const { client, writes } = stub({ rows: [{ user_id: OTHER, full_name: 'Someone Else' }] })
    return applyDuplicateHold(client, ME, 'Rodrigue Tegue').then(r => {
      check('nobody is held', r === null)
      check('and NOTHING is written to the row', writes.length === 0, writes.length + ' write(s)')
      return writes
    })
  })()
  await cleanWrites

  console.log('\nEVERY WAY THE CHECK CAN FAIL NOW LEAVES A RECORD')
  const cases: [string, () => Promise<Write[]>, string][] = [
    ['no name at all', async () => {
      const { client, writes } = stub()
      await applyDuplicateHold(client, ME, null)
      return writes
    }, 'no-name'],
    ['an empty-string name', async () => {
      const { client, writes } = stub()
      await applyDuplicateHold(client, ME, '   ')
      return writes
    }, 'no-name'],
    ['a single-word name', async () => {
      const { client, writes } = stub()
      await applyDuplicateHold(client, ME, 'Adnan')
      return writes
    }, 'name-too-short'],
    ['the lookup returns an error', async () => {
      const { client, writes } = stub({ selectError: true })
      await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
      return writes
    }, 'lookup-failed'],
    ['the lookup throws', async () => {
      const { client, writes } = stub({ selectThrows: true })
      await applyDuplicateHold(client, ME, 'Rodrigue Tegue')
      return writes
    }, 'lookup-failed'],
  ]

  const recorded: Record<string, ReturnType<typeof parseHold> | null> = {}
  for (const [label, run, expected] of cases) {
    const writes = await run()
    const rec = recordOn(writes)
    recorded[label] = rec
    check(label, !!rec?.notCheckedAt && rec.notCheckedReason === expected,
      rec?.notCheckedReason ? `reason "${rec.notCheckedReason}"` : 'NO RECORD WRITTEN')
    check('  …and it is stamped with a time', !!rec?.notCheckedAt && !Number.isNaN(Date.parse(rec.notCheckedAt)))
    check('  …and it holds nobody', !rec?.heldAt)
  }

  console.log('\nTHE THREE REASONS ARE DISTINCT, NOT ONE FLAG')
  // They must be, because the remedies differ: a missing name is asked for, a
  // one-word name is an accepted blind spot, and an errored lookup is an
  // incident. Collapsing them to a boolean would put an alarm on the two that
  // need no action, and then the alarm gets ignored.
  {
    const seen = new Set(Object.values(recorded).map(r => r?.notCheckedReason))
    check('three different reasons across five failures', seen.size === 3,
      Array.from(seen).join(', '))
  }

  console.log('\nTHE QUESTION THAT COULD NOT BE ASKED BEFORE')
  {
    const { client: c1, writes: w1 } = stub({ rows: [{ user_id: OTHER, full_name: 'Someone Else' }] })
    await applyDuplicateHold(c1, ME, 'Rodrigue Tegue')          // checked, clean
    const { client: c2, writes: w2 } = stub()
    await applyDuplicateHold(c2, ME, null)                       // could not check

    const cleanRow = recordOn(w1)
    const uncheckedRow = recordOn(w2)
    // THIS IS THE CONTROL. Both of these produced no write at all before the
    // change, so this comparison had the same answer in both states and could
    // not have told anyone anything. It now has two different answers.
    check('a checked-clean row carries no not-checked record', cleanRow?.notCheckedAt == null)
    check('an unchecked row carries one', uncheckedRow?.notCheckedAt != null)
    check('SO THE TWO ARE DISTINGUISHABLE FROM THE ROW ALONE',
      (cleanRow?.notCheckedAt ?? null) !== (uncheckedRow?.notCheckedAt ?? null),
      'this was false before the change — both were null')
  }

  console.log('\nAND IT STILL CANNOT BREAK A SIGNUP')
  {
    // The recorder exists so an unchecked signup is visible. It must never be the
    // reason somebody cannot sign up — so its own failure is swallowed, and this
    // asserts that rather than trusting the comment that says so.
    const { client, writes } = stub({ updateError: true })
    let threw: string | null = null
    const r = await applyDuplicateHold(client, ME, null).catch((e: any) => { threw = e?.message; return undefined })
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
    : '  every failure path records itself, and none of them can break a signup')
  process.exit(bad ? 1 : 0)

}

main()
