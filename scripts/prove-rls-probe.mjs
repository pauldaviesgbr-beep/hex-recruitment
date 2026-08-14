#!/usr/bin/env node
//
// PROVE THE RLS PROBE CAN TELL ITS TWO STATES APART — on a real database,
// against a throwaway table built to be open, then rebuilt to be closed.
//
// The trap this rehearses is the one that nearly shipped a false "secure":
// a table whose INSERT policy admits anon but which has no SELECT policy
// returns "violates row-level security policy" to a return=representation
// insert WHILE WRITING THE ROW. The probe must call that state a HOLE, and
// must call the genuinely-closed state closed. A probe that cannot be made
// to flag a known-open table on demand does not get trusted on an unknown one.
//
// DDL runs through the Management API (same path as migrations:check — needs
// SUPABASE_ACCESS_TOKEN in the shell; exits 2 SKIP without it, and says so
// rather than pretending it ran). The table is public._prove_rls_probe:
// created here, dropped here, and PROVED dropped — by the catalog and by
// PostgREST both — before this script will exit 0. It never touches an
// existing table, and no probe in this file goes anywhere near one.
//
//   npm run rlsprobe:prove

import { createRequire } from 'node:module'
import { loadEnv, probeWrite, ProbeError } from './lib/rls-probe.mjs'

const require = createRequire(import.meta.url)
const { query } = require('./migrations-lib.js')

const TABLE = '_prove_rls_probe'
let pass = 0
const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (detail) console.log(`        ${detail}`)
  if (ok) pass++
  else failures.push(label)
}

async function ddl(sql) {
  await query(sql)
  await query(`notify pgrst, 'reload schema'`)
}

// PostgREST reloads its schema ASYNCHRONOUSLY after the notify, so any fixed
// sleep here is a race that will be lost on a slow day — the first run of this
// proof lost it, 404ing a rehearsal request against a table that existed.
// So: never both reload and measure. Wait for the observable state itself.
async function waitUntilServed(env, wantServed) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${TABLE}?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    })
    if (wantServed === r.ok) return
    await new Promise(res => setTimeout(res, 700))
  }
  throw new Error(`PostgREST did not ${wantServed ? 'start' : 'stop'} serving ${TABLE} within 30s`)
}

;(async () => {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.log('SKIP — SUPABASE_ACCESS_TOKEN is not set, so the throwaway table cannot be built.')
    console.log('This proof did NOT run. Do not report the probe as proven on this machine.')
    process.exitCode = 2
    return
  }
  const env = loadEnv()

  // ── 0. Statement-kind enforcement needs no database at all.
  for (const [label, args] of [
    ['refuses to run without a statement kind', { table: TABLE, payload: {} }],
    ['refuses an upsert with no onConflict', { kind: 'upsert', table: TABLE, payload: {} }],
    ['refuses an insert carrying onConflict (that is an upsert)', { kind: 'insert', table: TABLE, payload: {}, onConflict: 'id' }],
    ['refuses an unfiltered delete', { kind: 'delete', table: TABLE }],
  ]) {
    let got = 'ran'
    try { await probeWrite(env, args) } catch (e) { got = e instanceof ProbeError ? 'refused' : `threw ${e.message}` }
    check(label, got === 'refused', `probe: ${got}`)
  }

  // ── build the throwaway. Dropped at the end and proved gone; if a crashed
  //    earlier run left one behind, rebuilding it is the correct cleanup.
  console.log(`\n  building public.${TABLE} (throwaway) ...`)
  await ddl(`
    drop table if exists public.${TABLE};
    create table public.${TABLE} (id uuid primary key default gen_random_uuid(), note text not null);
    alter table public.${TABLE} enable row level security;
    grant select, insert, delete on public.${TABLE} to anon, authenticated;
    create policy "${TABLE}_open_insert" on public.${TABLE} for insert to anon with check (true);
  `)
  await waitUntilServed(env, true)

  // ── 1. THE KNOWN-OPEN STATE, and first the instrument that lied in August:
  //       a representation insert reports an RLS violation on this OPEN table.
  //       Rehearsed here so the trap is a measured fact, not a story.
  const note = `probe-proof-${process.pid}`
  {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ note: `${note}-representation` }),
    })
    const body = await r.json().catch(() => ({}))
    const saidRls = r.status === 401 || r.status === 403 || /row-level security/i.test(body?.message || '')
    check('rehearsal: return=representation reports an RLS refusal on the OPEN table',
      saidRls, `http ${r.status} — the message a naive probe reads as "inserts are blocked"`)
    // Measured on the first run of this proof, correcting its own author: the
    // row does NOT land here. INSERT ... RETURNING is one statement, so the
    // read-back refusal aborts the whole thing atomically. The lie is in the
    // MESSAGE, not a stored row: it says "refused" about a table whose INSERT
    // policy admits anyone — the probe's minimal insert, next, writes freely.
    const s = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${TABLE}?select=id&note=eq.${encodeURIComponent(`${note}-representation`)}`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
    )
    const landed = ((await s.json().catch(() => [])) || []).length
    check('rehearsal: the aborted statement stored nothing (counted as service role)',
      landed === 0, `${landed} row(s) from the representation request — the statement aborts whole`)
  }

  //       Now the probe itself on the same open table: it must flag the hole.
  const open = await probeWrite(env, {
    kind: 'insert', table: TABLE,
    payload: { note }, readback: { note }, auth: 'anon',
  })
  check('probe flags the known-open table: write ALLOWED', open.writeAllowed === true,
    open.verdict)
  check('probe reports the read-back separately: row invisible to the writer', open.readbackVisible === false,
    `readbackVisible: ${open.readbackVisible}`)
  check('probe names the trap for what it is', open.trap === true,
    `trap: ${open.trap}`)

  // ── 2. THE KNOWN-CLOSED STATE: drop the insert policy. Now the write itself
  //       must be refused, and the probe must say the INSERT answered.
  console.log(`\n  closing the table (drop the insert policy) ...`)
  await ddl(`drop policy "${TABLE}_open_insert" on public.${TABLE};`)

  const closed = await probeWrite(env, {
    kind: 'insert', table: TABLE,
    payload: { note: `${note}-closed` }, readback: { note: `${note}-closed` }, auth: 'anon',
  })
  check('probe passes the known-closed table: write refused', closed.writeAllowed === false,
    closed.verdict)
  check('probe attributes the refusal to RLS on the INSERT itself', closed.writeRefusedBy === 'rls',
    `writeRefusedBy: ${closed.writeRefusedBy} (code ${closed.code})`)
  check('probe does not cry trap on a genuine refusal', closed.trap === false,
    `trap: ${closed.trap}`)

  // ── 3. The constraint-vs-policy distinction, same table: reopen the insert
  //       policy and send a payload missing the NOT NULL column. RLS says yes,
  //       the constraint says no, nothing is stored — and the probe must call
  //       that 'constraint', which on an anon probe is the HOLE verdict.
  console.log(`\n  reopening, then probing with an incomplete payload ...`)
  await ddl(`create policy "${TABLE}_open_insert" on public.${TABLE} for insert to anon with check (true);`)
  const viaConstraint = await probeWrite(env, {
    kind: 'insert', table: TABLE, payload: {}, auth: 'anon',
  })
  check('incomplete payload: refusal attributed to the CONSTRAINT, not to RLS',
    viaConstraint.writeRefusedBy === 'constraint',
    viaConstraint.verdict)

  // ── 4. Tear down and PROVE it, both ways: the catalog says no such table,
  //       and PostgREST no longer routes it.
  console.log(`\n  dropping public.${TABLE} and proving it gone ...`)
  await ddl(`drop table public.${TABLE};`)
  await waitUntilServed(env, false)
  const cat = await query(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = '${TABLE}'`,
  )
  check('catalog: the throwaway table no longer exists', cat?.[0]?.n === 0, `information_schema count: ${cat?.[0]?.n}`)
  const gone = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${TABLE}?select=id`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
  check('PostgREST: the table is no longer served, even to the service role', !gone.ok, `http ${gone.status}`)

  console.log(`\n  ${pass} passed, ${failures.length} failed`)
  if (failures.length) {
    console.log('\n  The probe failed its positive control — it must not be used on a')
    console.log('  real table until this passes, and nothing it has said stands.')
    process.exitCode = 1
  }
})().catch(e => {
  console.error('\nPROOF COULD NOT RUN —', e.message.slice(0, 300))
  console.error('If the throwaway table was created before the failure, rerun this script:')
  console.error('it rebuilds and drops it; or drop public._prove_rls_probe by hand.')
  process.exitCode = 2
})
