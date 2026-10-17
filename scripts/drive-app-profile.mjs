// node scripts/drive-app-profile.mjs <deployment-url>
//
// Drives the native Profile tab's endpoints (Build 17 review, D6/D7) on a REAL
// deployment, as the standing candidate fixture (pauldavies.gbr+candidate@ —
// Drive Test, is_test). The target is an ARGUMENT, never a default.
//
// What it writes, all on the fixture's own row, all restored VERBATIM from what
// it read first, in a finally:
//   - is_discoverable flipped and flipped back (the fixture is hidden; it is
//     visible for about a second)
//   - one scanned-CV upload: an object in cvs/{uid}/ and cv_url/cv_file_name
//     on the row. The object is removed and both columns put back.
// It does NOT call parse-cv with a real token: that runs a paid model call and
// rewrites cv_derived. It proves only that a bad Bearer is refused there.

import { loadEnv, sessionFor } from './lib/rls-probe.mjs'

const target = process.argv[2]
if (!target || !/^https:\/\//.test(target)) {
  console.log('SKIP: pass the deployment URL to drive, e.g. the preview from `npm run preview-url`')
  process.exit(2)
}
const env = loadEnv()
const FIXTURE = 'pauldavies.gbr+candidate@gmail.com'
const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET
const site = target.replace(/\/$/, '')

let fail = 0
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }

async function call(method, path, token, body, type) {
  const headers = {}
  if (bypass) headers['x-vercel-protection-bypass'] = bypass
  if (token) headers.Authorization = `Bearer ${token}`
  if (type) headers['Content-Type'] = type
  const r = await fetch(site + path, { method, headers, body })
  let json = null
  try { json = await r.json() } catch {}
  return { status: r.status, body: json }
}

const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
async function row(uid) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/candidate_profiles?user_id=eq.${uid}&select=is_discoverable,cv_url,cv_file_name`, { headers: svc })
  return (await r.json())[0]
}
async function patch(uid, values) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/candidate_profiles?user_id=eq.${uid}`, {
    method: 'PATCH', headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(values),
  })
  return r.status
}
async function removeObject(path) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/profiles`, {
    method: 'DELETE', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }),
  })
  return r.status
}
async function objectExists(path) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/info/authenticated/profiles/${path}`, { headers: svc })
  return r.status === 200
}

// A real one-page PDF, written by hand: smallest thing that is honestly a PDF.
function tinyPdf() {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>']
  let out = '%PDF-1.4\n'; const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

async function main() {
  const anon = await call('GET', '/api/app/me/profile')
  check(anon.status === 401 && anon.body?.error === 'signed_out', `profile, no token → 401 (got ${anon.status})`)
  const junkParse = await call('POST', '/api/candidate/parse-cv', 'not-a-token')
  check(junkParse.status === 401, `parse-cv, junk Bearer → 401 (got ${junkParse.status})`)

  const { token, userId } = await sessionFor(env, FIXTURE)
  const before = await row(userId)
  console.log(`row as found: discoverable=${before.is_discoverable} cv_url=${before.cv_url ? 'set' : 'null'}`)

  let uploadedPath = null
  try {
    const p = await call('GET', '/api/app/me/profile', token)
    check(p.status === 200, `profile → 200 (got ${p.status})`)
    const b = p.body || {}
    console.log(`  says: name=${b.fullName} title=${b.jobTitle} town=${b.town} complete=${b.complete?.done}/${b.complete?.total} next="${b.complete?.next}" cv=${b.cv?.fileName || 'none'} photo=${b.photoUrl ? 'yes' : 'no'}`)
    check(b.complete?.total === 14, 'the checklist is the dashboard\'s 14')
    check(b.isDiscoverable === !!before.is_discoverable, 'isDiscoverable agrees with the row')
    if (b.cv?.url) {
      const r = await fetch(b.cv.url)
      check(r.status === 200, `the CV link opens (got ${r.status})`)
    }

    // The switch: flip, read the row, flip back, read the row.
    const flipped = !before.is_discoverable
    const v1 = await call('PUT', '/api/app/me/visibility', token, JSON.stringify({ discoverable: flipped }), 'application/json')
    check(v1.status === 200 && (await row(userId)).is_discoverable === flipped, `switch to ${flipped} lands on the row (got ${v1.status})`)
    const v2 = await call('PUT', '/api/app/me/visibility', token, JSON.stringify({ discoverable: !!before.is_discoverable }), 'application/json')
    check(v2.status === 200 && (await row(userId)).is_discoverable === !!before.is_discoverable, `switch back lands (got ${v2.status})`)
    const bad = await call('PUT', '/api/app/me/visibility', token, JSON.stringify({ discoverable: 'yes' }), 'application/json')
    check(bad.status === 400, `a non-boolean is refused (got ${bad.status})`)

    // The scan upload.
    const notPdf = await call('POST', '/api/app/me/cv', token, Buffer.from('hello, not a pdf'), 'application/pdf')
    check(notPdf.status === 415, `a non-PDF body is refused whatever its header says (got ${notPdf.status})`)
    const up = await call('POST', '/api/app/me/cv', token, tinyPdf(), 'application/pdf')
    check(up.status === 200, `a PDF uploads (got ${up.status})`)
    const after = await row(userId)
    uploadedPath = after.cv_url !== before.cv_url ? after.cv_url : null
    check(!!uploadedPath && uploadedPath.startsWith(`cvs/${userId}/`) && uploadedPath.endsWith('.pdf'), `cv_url moved to the profile form's pattern (${after.cv_url})`)
    check(after.cv_file_name === up.body?.fileName && /^CV – .+\.pdf$|^CV\.pdf$/.test(after.cv_file_name || ''), `cv_file_name "${after.cv_file_name}"`)
    check(uploadedPath ? await objectExists(uploadedPath) : false, 'the object is in the profiles bucket')
    const p2 = await call('GET', '/api/app/me/profile', token)
    check(p2.body?.cv?.fileName === after.cv_file_name && !!p2.body?.cv?.added, `profile now shows the new CV, added "${p2.body?.cv?.added}"`)
  } finally {
    const s = await patch(userId, { is_discoverable: before.is_discoverable, cv_url: before.cv_url, cv_file_name: before.cv_file_name })
    if (uploadedPath) await removeObject(uploadedPath)
    const end = await row(userId)
    check(s === 204 && end.is_discoverable === before.is_discoverable && end.cv_url === before.cv_url && end.cv_file_name === before.cv_file_name,
      'teardown: the row is exactly as found')
    if (uploadedPath) check(!(await objectExists(uploadedPath)), 'teardown: the uploaded object is gone')
  }
  console.log(fail ? `${fail} FAILED` : 'all passed')
  process.exitCode = fail ? 1 : 0
}
main().catch(e => { console.error(e); process.exitCode = 1 })
