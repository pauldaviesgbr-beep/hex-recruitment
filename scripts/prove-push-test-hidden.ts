// THE PUSH TEST IS A DIAGNOSTIC, AND ONLY THE ADMIN CAN REACH IT.
//
//   npm run pushtest:prove
//
// Until 14 Oct 2026 "Run the push test" sat in Settings → Notifications for
// every user, and the web-app manifest offered a "Push test" shortcut to
// everyone who installed it. An App Store reviewer was one tap from a
// debugging screen. Filesystem and imports only, so it runs in verify.

import { readFileSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
// Comments quote the code they describe; a text check must not read them.
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

let bad = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(66) + detail)
}

async function main() {
  const page = code('app/settings/notifications/page.tsx')
  const links = page.match(/href="\/diag-push"/g) || []
  check('settings still links the test page exactly once (for the admin)', links.length === 1, String(links.length))
  // The link must sit inside a block gated on showPushTest.
  const iGate = page.indexOf('{showPushTest && (')
  const iLink = page.indexOf('href="/diag-push"')
  const iClose = page.indexOf(')}', iGate)
  check('…and only inside the showPushTest gate', iGate > 0 && iGate < iLink && iLink < iClose)
  check('the gate starts closed', /useState\(false\)/.test(page.slice(page.indexOf('showPushTest, setShowPushTest'), page.indexOf('showPushTest, setShowPushTest') + 80)))
  check('the gate opens only through isAdmin(the signed-in email)',
    /setShowPushTest\(isAdmin\(session\.user\.email\)\)/.test(page) &&
    (page.match(/setShowPushTest\(/g) || []).length === 1)

  const manifest = code('app/manifest.ts')
  check('the manifest offers no shortcut to the test page', !manifest.includes('/diag-push'))

  // The helper the gate depends on must still say no to a stranger.
  const { isAdmin } = await import('../lib/admin-client')
  check('CONTROL — isAdmin says yes to the admin', isAdmin('paul@thrivecareer.co.uk') === true)
  for (const e of ['pauldavies.gbr+applereview@gmail.com', 'someone@example.com', '', null, undefined]) {
    check(`isAdmin says no to ${JSON.stringify(e)}`, isAdmin(e as string | null) === false)
  }

  console.log(bad ? `\n${bad} FAILED` : '\nall passed')
  process.exitCode = bad ? 1 : 0
}

main().catch(e => { console.error(e); process.exitCode = 1 })
