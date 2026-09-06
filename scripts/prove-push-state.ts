/**
 * Prove the push control cannot lie about its own state.
 *
 * Run: npm run push:prove
 *
 * THE CASE THAT MATTERS IS THE FIRST ONE: OS permission granted, no
 * subscription. That is the exact state a real iPhone was in on 13 Aug 2026,
 * and the old code called it 'granted' — so the settings button read "Turn off
 * on this device" when nothing could arrive, and tapping it did nothing.
 *
 * A real subscription cannot be obtained in automation, so the browser APIs are
 * stubbed. That is a fair test HERE because the thing under test is the
 * DECISION — which fact the status is derived from — not the browser's
 * behaviour. The stub lets the two facts be set independently, which is the
 * whole point: they came apart on the phone and the code could not tell.
 */
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)

type Stub = {
  hasPushManager: boolean
  permission: NotificationPermission
  subscription: object | null
  standalone: boolean
  iOS: boolean
  /** Running inside the Capacitor shell. Independent of iOS and standalone —
   *  which is the whole point: on 6 Sept 2026 the shell was iOS TRUE and
   *  standalone FALSE, indistinguishable from a Safari tab to the old code. */
  native?: boolean
}

function applyStub(s: Stub) {
  const g = globalThis as any
  g.window = {
    matchMedia: (q: string) => ({ matches: s.standalone && q.includes('standalone') }),
    navigator: { standalone: s.standalone },
  }
  // isNativeApp() reads window.Capacitor.isNativePlatform() at CALL time, so
  // it picks this up without the module cache mattering.
  if (s.native) g.window.Capacitor = { isNativePlatform: () => true }
  if (s.hasPushManager) g.window.PushManager = function () {}
  // node 24 defines `navigator` as a getter-only global, so it has to be
  // replaced with defineProperty rather than assigned.
  const nav = {
    userAgent: s.iOS ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' : 'Mozilla/5.0 (Windows NT 10.0)',
    platform: s.iOS ? 'iPhone' : 'Win32',
    maxTouchPoints: s.iOS ? 5 : 0,
    serviceWorker: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => s.subscription } }),
    },
  }
  Object.defineProperty(g, 'navigator', { value: nav, configurable: true, writable: true })
  g.window.navigator = nav
  // pushSupported() asks `'Notification' in window`, so it must be on the stub
  // WINDOW, not only on globalThis. Putting it in one place made every case
  // read 'unsupported' — the harness was wrong, not the code, and the fix
  // belonged here rather than in the thing under test.
  g.Notification = { permission: s.permission }
  g.window.Notification = g.Notification
  g.window.serviceWorker = nav.serviceWorker
  g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  // Re-require so module-level checks re-evaluate against this stub.
  delete req.cache[req.resolve('../lib/pushClient')]
  return req('../lib/pushClient') as typeof import('../lib/pushClient')
}

const fails: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) fails.push(name)
}

const BASE: Stub = { hasPushManager: true, permission: 'granted', subscription: null, standalone: true, iOS: false }
const SUB = { endpoint: 'https://example.com/x' }

async function main() {
  console.log('='.repeat(72))
  console.log('THE REGRESSION — permission granted is NOT the same as subscribed')
  console.log('='.repeat(72))

  let m = applyStub({ ...BASE, permission: 'granted', subscription: null })
  let st = await m.getPushStatus()
  check('granted + NO subscription is NOT "subscribed"', st !== 'subscribed', `got ${st}`)
  check('granted + NO subscription reads "not-subscribed"', st === 'not-subscribed', `got ${st}`)
  console.log('        ^ the old code answered "granted" here, which is why the')
  console.log('          button said "Turn off" with nowhere to send.')

  m = applyStub({ ...BASE, permission: 'granted', subscription: SUB })
  st = await m.getPushStatus()
  check('granted + a real subscription reads "subscribed"', st === 'subscribed', `got ${st}`)

  console.log()
  console.log('='.repeat(72))
  console.log('THE THREE STATES MUST BE DISTINGUISHABLE')
  console.log('='.repeat(72))

  const seen: Record<string, string> = {}
  m = applyStub({ ...BASE, permission: 'default', subscription: null })
  seen['never asked'] = await m.getPushStatus()
  m = applyStub({ ...BASE, permission: 'granted', subscription: SUB })
  seen['subscribed'] = await m.getPushStatus()
  m = applyStub({ ...BASE, permission: 'denied', subscription: null })
  seen['OS denied'] = await m.getPushStatus()

  for (const [k, v] of Object.entries(seen)) console.log(`        ${k.padEnd(12)} -> ${v}`)
  check('all three states produce DIFFERENT answers',
    new Set(Object.values(seen)).size === 3, JSON.stringify(seen))
  check('OS denied reads "blocked", not "not-subscribed"', seen['OS denied'] === 'blocked', seen['OS denied'])

  console.log()
  console.log('='.repeat(72))
  console.log('PLATFORM GATES')
  console.log('='.repeat(72))

  m = applyStub({ ...BASE, iOS: true, standalone: false, hasPushManager: false })
  st = await m.getPushStatus()
  check('iOS Safari, not installed -> ios-needs-install', st === 'ios-needs-install', `got ${st}`)

  // ── THE SHELL, AND THE DISCRIMINATOR THAT WAS MISSING ────────────────────
  // Identical facts to the case directly above — iOS true, standalone false —
  // which is exactly why the old code could not tell them apart and told a
  // person already inside the app to install it from Safari. The pair has to
  // be asserted TOGETHER: "the shell says unsupported" passes just as happily
  // on a build that says unsupported to everybody.
  const safariFacts = { ...BASE, iOS: true, standalone: false, hasPushManager: false }
  const inSafari = await applyStub({ ...safariFacts }).getPushStatus()
  const inShell = await applyStub({ ...safariFacts, native: true }).getPushStatus()
  check('the SHELL does not ask anyone to add Thrive to their home screen',
    inShell !== 'ios-needs-install', `got ${inShell}`)
  check('…it reads unsupported, which is true while APNs is unbuilt',
    inShell === 'unsupported', `got ${inShell}`)
  check('…and the SAME facts in a real Safari tab still say ios-needs-install',
    inSafari === 'ios-needs-install', `got ${inSafari}`)
  check('so the two are genuinely distinguished, not both silenced',
    inShell !== inSafari, `${inSafari} vs ${inShell}`)

  m = applyStub({ ...BASE, iOS: true, standalone: true, subscription: SUB })
  st = await m.getPushStatus()
  check('iOS installed WITH a subscription -> subscribed', st === 'subscribed', `got ${st}`)

  m = applyStub({ ...BASE, iOS: true, standalone: true, subscription: null, permission: 'granted' })
  st = await m.getPushStatus()
  check('iOS installed, permission granted, no subscription -> not-subscribed',
    st === 'not-subscribed', `got ${st}`)
  console.log('        ^ this is EXACTLY the phone state from 13 Aug.')

  m = applyStub({ ...BASE, hasPushManager: false, iOS: false })
  st = await m.getPushStatus()
  check('no PushManager -> unsupported', st === 'unsupported', `got ${st}`)

  console.log()
  console.log('='.repeat(72))
  if (fails.length) {
    console.log(`${fails.length} FAILED: ${fails.join(', ')}`)
    process.exit(1)
  }
  console.log('ALL PASSED — the control can only report what a subscription says.')
}

main()
