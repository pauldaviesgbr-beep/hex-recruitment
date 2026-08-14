// PROBE AN RLS POLICY AND SAY WHICH STATEMENT ANSWERED.
//
// Two failures this library exists to make impossible to repeat:
//
//   - AN ANON INSERT TEST RETURNED "violates row-level security policy" AND
//     NEARLY GOT REPORTED AS SECURE — the refusal came from reading the row
//     back, not from the insert. INSERT ... RETURNING needs the new row to
//     pass the SELECT policies too, so an open INSERT policy with no SELECT
//     policy produces the IDENTICAL refusal to a locked-down insert (the
//     statement aborts whole — measured by this library's own proof). Two
//     states, one message — and in the open state a return=minimal caller,
//     which is what any attacker would be, writes freely.
//
//   - A PASSING .insert() WAS TAKEN AS PROOF ABOUT AN ENDPOINT THAT RUNS
//     .upsert({onConflict}) — different statements, different policies
//     consulted (upsert can hit UPDATE policies on conflict), different
//     failures.
//
// So this probe (a) performs the write with Prefer: return=minimal, which
// asks ONLY about the write, then reads back in a separate request, which
// asks ONLY about SELECT — the two answers can never contaminate each other;
// and (b) refuses to run at all unless the caller NAMES the statement kind,
// and sends exactly the statement the kind says.
//
//   import { loadEnv, sessionFor, probeWrite } from './lib/rls-probe.mjs'
//
//   const env = loadEnv()
//   const v = await probeWrite(env, {
//     kind: 'insert',                  // REQUIRED: insert | upsert | update | delete
//     table: 'notifications',
//     payload: { user_id: x, body: 'hi' },
//     readback: { body: 'hi' },        // optional: filters for the separate SELECT
//     auth: session ?? 'anon',         // 'anon' or a session from sessionFor()
//   })
//   console.log(v.verdict)             // always names the statement that answered
//
// The verdict object:
//   statement        what was actually sent (kind + table)
//   writeAllowed     the write itself, from return=minimal — the only honest answer
//   writeRefusedBy   'rls' | 'constraint' | null. 'constraint' means RLS ALLOWED
//                    the row and only a column constraint stopped it — for an
//                    anon probe that is a HOLE, not a pass.
//   readbackVisible  true | false | 'not-asked' — the separate SELECT
//   trap             writeAllowed && !readbackVisible: the state that produced
//                    the false "secure" report. The write LANDED.
//   verdict          one sentence naming which statement was refused or allowed
//
// NOTHING HERE PREVENTS A WRITE FROM LANDING. A probe that finds a write
// allowed HAS WRITTEN A ROW (unless a constraint stopped it — the incomplete-
// payload trick: probe with a payload missing a NOT NULL column, and
// writeRefusedBy tells you whether RLS or the constraint answered, with
// nothing stored either way). Probing production tables: use that trick, or
// clean up what you land, and count dependents before and after.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export class ProbeError extends Error {}

/** Reads .env.local. Values stay in the returned object — never log them. */
export function loadEnv() {
  const out = {}
  const file = path.join(REPO, '.env.local')
  if (!fs.existsSync(file)) throw new ProbeError('.env.local not found — the probe has no keys to work with')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    if (!out[k]) throw new ProbeError(`${k} missing from .env.local`)
  }
  return out
}

/**
 * Mint a real signed-in session without a browser and without sending email:
 * admin generate_link yields a hashed_token, /auth/v1/verify exchanges it.
 * Needs SUPABASE_SERVICE_ROLE_KEY in env. Use ONLY on test accounts.
 */
export async function sessionFor(env, email) {
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  if (!service) throw new ProbeError('SUPABASE_SERVICE_ROLE_KEY missing — cannot mint a session')
  const g = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  if (!g.ok) throw new ProbeError(`generate_link ${g.status} for ${email}`)
  const gj = await g.json()
  const hash = gj.hashed_token || gj.properties?.hashed_token
  const v = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hash }),
  })
  if (!v.ok) throw new ProbeError(`verify ${v.status}: ${(await v.text()).slice(0, 120)}`)
  const vj = await v.json()
  return { token: vj.access_token, userId: vj.user?.id, role: vj.user?.user_metadata?.role, email }
}

const KINDS = new Set(['insert', 'upsert', 'update', 'delete'])
const CONSTRAINT_CODES = /^(23502|23514|23503|22P02|22007|22P05)$/

function headersFor(env, auth) {
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (auth === 'anon' || auth === undefined) return { apikey: anon, Authorization: `Bearer ${anon}` }
  if (auth && typeof auth.token === 'string') return { apikey: anon, Authorization: `Bearer ${auth.token}` }
  throw new ProbeError("auth must be 'anon' or a session from sessionFor()")
}

function filterQuery(match) {
  return Object.entries(match)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`)
    .join('&')
}

/**
 * Send exactly the named statement, then ask about the read-back separately.
 * Refuses mismatched shapes rather than quietly testing a different statement.
 */
export async function probeWrite(env, { kind, table, payload, match, onConflict, readback, auth } = {}) {
  // THE STATEMENT KIND IS NOT OPTIONAL AND NOT INFERRED. A passing probe of
  // one kind proves nothing about another, so the caller says which one this
  // is, and the shape has to agree with them.
  if (!KINDS.has(kind)) throw new ProbeError(`kind must be one of insert|upsert|update|delete — got ${JSON.stringify(kind)}`)
  if (!table) throw new ProbeError('table is required')
  if (kind === 'upsert' && !onConflict) throw new ProbeError("kind 'upsert' requires onConflict — without it you would be probing a plain insert")
  if (kind === 'insert' && onConflict) throw new ProbeError("kind 'insert' with onConflict is an upsert — say 'upsert'")
  if ((kind === 'update' || kind === 'delete') && (!match || Object.keys(match).length === 0)) {
    throw new ProbeError(`kind '${kind}' requires a non-empty match filter — an unfiltered ${kind} is never a probe`)
  }
  if ((kind === 'insert' || kind === 'upsert') && !payload) throw new ProbeError(`kind '${kind}' requires a payload`)

  const base = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}`
  const common = { ...headersFor(env, auth), 'Content-Type': 'application/json' }

  let url = base
  const init = { headers: { ...common, Prefer: 'return=minimal' } }
  if (kind === 'insert') {
    init.method = 'POST'
    init.body = JSON.stringify(payload)
  } else if (kind === 'upsert') {
    init.method = 'POST'
    init.headers.Prefer = 'return=minimal,resolution=merge-duplicates'
    url = `${base}?on_conflict=${encodeURIComponent(onConflict)}`
    init.body = JSON.stringify(payload)
  } else if (kind === 'update') {
    init.method = 'PATCH'
    url = `${base}?${filterQuery(match)}`
    init.body = JSON.stringify(payload ?? {})
  } else {
    init.method = 'DELETE'
    url = `${base}?${filterQuery(match)}`
  }

  const w = await fetch(url, init)
  const wText = await w.text()
  let wBody = {}
  try { wBody = JSON.parse(wText) } catch {}
  const code = wBody?.code || null
  const writeAllowed = w.ok
  const writeRefusedBy = writeAllowed ? null
    : code === '42501' ? 'rls'
    : code && CONSTRAINT_CODES.test(code) ? 'constraint'
    : 'http'

  // The read-back is a SEPARATE question asked in a SEPARATE request, so a
  // SELECT policy can never masquerade as a write refusal or vice versa.
  const rbFilter = readback || match
  let readbackVisible = 'not-asked'
  if (writeAllowed && rbFilter && Object.keys(rbFilter).length > 0) {
    const r = await fetch(`${base}?select=*&${filterQuery(rbFilter)}`, { headers: headersFor(env, auth) })
    const rows = r.ok ? await r.json().catch(() => []) : []
    readbackVisible = r.ok && Array.isArray(rows) && rows.length > 0
  }

  const trap = writeAllowed === true && readbackVisible === false
  const statement = `${kind} on ${table}`
  const verdict =
    trap ? `THE ${kind.toUpperCase()} WAS ALLOWED AND THE ROW LANDED (http ${w.status}); only the read-back SELECT is refused. ` +
           `A return=representation probe here reports an RLS refusal even though the write policy admits this caller — do not call this secure.`
    : writeAllowed ? `the ${kind} was allowed (http ${w.status})${readbackVisible === true ? ' and the row is visible to the same caller' : ''}`
    : writeRefusedBy === 'rls' ? `the ${kind} ITSELF was refused by RLS (42501) — nothing written`
    : writeRefusedBy === 'constraint' ? `RLS ALLOWED the ${kind} and only a constraint stopped it (${code}) — for an anon probe that is a HOLE; nothing stored`
    : `the ${kind} failed with http ${w.status} ${code ?? ''} — not an RLS answer; do not read this as secure`

  return {
    statement, writeAllowed, writeRefusedBy, readbackVisible, trap,
    httpStatus: w.status, code, message: wBody?.message || null, verdict,
  }
}
