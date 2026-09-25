// THE APP SETS NOTHING OPTIONAL, AND THE WEBSITE IS UNCHANGED.
//
//   npm run appcookies:prove
//
// Apple rejected under 5.1.2 twice for cookies "tracking users for
// marketing". The answer in the app is that nothing optional is stored at
// all, and anything optional already there is removed. This proves both, and
// proves the website's consent behaviour did not move — by importing the REAL
// gate and the REAL clear from lib/cookies and running them against a cookie
// jar that behaves like document.cookie.
//
// THE CASE THAT NEEDS ITS OWN SEEDING: "cleared if already there". A clear
// that never runs and a clear that runs on an empty jar look identical, so
// the jar is FILLED first and asserted full before the clear runs.
//
// The bridge is a STUB of window.Capacitor. That is the property the real
// shell injects, so it tests the rule — but it is not the app, and the
// device check is still the confirmation.
//
// No network, no database, no device — so it runs in `npm run verify`.

let bad = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(66) + detail)
}

/** A jar with document.cookie's semantics: reading gives "a=1; b=2";
 *  writing "name=value; ...attrs" sets one cookie; max-age=0 deletes it. */
function makeJar() {
  const jar = new Map<string, string>()
  return {
    jar,
    doc: {
      get cookie() { return Array.from(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      set cookie(s: string) {
        const [pair, ...attrs] = s.split(';').map(p => p.trim())
        const eq = pair.indexOf('=')
        const name = pair.slice(0, eq)
        const value = pair.slice(eq + 1)
        if (attrs.some(a => /^max-age=0$/i.test(a))) jar.delete(name)
        else jar.set(name, value)
      },
    },
  }
}

function makeStorage() {
  const m = new Map<string, string>()
  return {
    m,
    api: {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) },
    },
  }
}

const OPTIONAL = ['thrive_country', 'thrive_tz', 'thrive_attr'] as const
const CONSENT = 'hex_cookie_consent'
const ACCEPTED = encodeURIComponent(JSON.stringify({ essential: true, functional: true }))

function install({ bridge }: { bridge: boolean }) {
  const { jar, doc } = makeJar()
  const store = makeStorage()
  const g = globalThis as any
  g.document = Object.assign(doc, { referrer: '' })
  g.window = {
    localStorage: store.api,
    location: { search: '?ref=li' },
    ...(bridge ? { Capacitor: { isNativePlatform: () => true } } : {}),
  }
  return { jar, store }
}

function seed(jar: Map<string, string>, store: ReturnType<typeof makeStorage>) {
  jar.set(CONSENT, ACCEPTED)
  jar.set('thrive_country', 'GB')
  jar.set('thrive_tz', 'Europe%2FLondon')
  jar.set('thrive_attr', '%7B%22ref%22%3A%22li%22%7D')
  jar.set('sb-ref-auth-token', 'base64-session')
  jar.set('hex_session_started', '1')
  store.m.set('thrive_attr', '{"ref":"li"}')
}

async function main() {
  const cookies = await import('../lib/cookies')
  const { captureFirstTouch } = await import('../lib/firstTouch')

  // ── 1. IN THE APP, THE GATE SAYS NO EVEN WITH AN ACCEPT IN THE JAR ──────
  console.log('\n1. IN THE APP (stubbed window.Capacitor): THE GATE IS CLOSED')
  {
    const { jar } = install({ bridge: true })
    jar.set(CONSENT, ACCEPTED)
    check('an Accept is in the jar (precondition)', cookies.getCookieConsent()?.functional === true)
    check('nonEssentialAllowed() is false inside the app', cookies.nonEssentialAllowed() === false)
    try { captureFirstTouch() } catch (e) { check('first-touch capture ran without throwing', false, String(e)) }
    check('first-touch capture writes nothing in the app',
      OPTIONAL.every(n => !jar.has(n)), `jar: ${Array.from(jar.keys()).join(', ')}`)
  }

  // ── 2. IN THE APP, WHAT IS ALREADY THERE IS REMOVED ─────────────────────
  console.log('\n2. IN THE APP: SEEDED, THEN CLEARED — and the essentials survive')
  {
    const { jar, store } = install({ bridge: true })
    seed(jar, store)
    check('BEFORE: all three optional cookies present', OPTIONAL.every(n => jar.has(n)))
    check('BEFORE: the consent cookie present', jar.has(CONSENT))
    check('BEFORE: thrive_attr in local storage', store.m.has('thrive_attr'))
    const ran = cookies.enforceAppCookiePolicy()
    check('enforceAppCookiePolicy() reports that it ran', ran === true)
    check('AFTER: all three optional cookies gone', OPTIONAL.every(n => !jar.has(n)),
      `left: ${OPTIONAL.filter(n => jar.has(n)).join(', ') || 'none'}`)
    check('AFTER: the consent cookie gone (so the edge stops stamping)', !jar.has(CONSENT))
    check('AFTER: the thrive_attr local-storage mirror gone', !store.m.has('thrive_attr'))
    check('AFTER: the sign-in cookie untouched', jar.get('sb-ref-auth-token') === 'base64-session')
    check('AFTER: the session marker untouched', jar.get('hex_session_started') === '1')
  }

  // ── 3. ON THE WEBSITE, NOTHING MOVED ────────────────────────────────────
  console.log('\n3. ON THE WEBSITE (no bridge): BEHAVIOUR AS BEFORE')
  {
    const { jar, store } = install({ bridge: false })
    check('undecided is a no', cookies.nonEssentialAllowed() === false)
    seed(jar, store)
    const ran = cookies.enforceAppCookiePolicy()
    check('the app clear does NOT run on the website', ran === false)
    check('an accepted visitor keeps all three optional cookies', OPTIONAL.every(n => jar.has(n)))
    check('an accepted visitor keeps their consent record', jar.has(CONSENT))
    check('Accept opens the gate on the website', cookies.nonEssentialAllowed() === true)
    cookies.rejectNonEssentialCookies()
    check('Decline still deletes all three (the 22 Sept path)', OPTIONAL.every(n => !jar.has(n)))
    check('Decline records a refusal', cookies.getCookieConsent()?.functional === false)
    check('Decline closes the gate', cookies.nonEssentialAllowed() === false)
  }

  // ── 4. THE EDGE'S GATE IS UNCHANGED AND NEEDS NO APP DETECTION ──────────
  console.log('\n4. THE EDGE: "no consent cookie, no optional cookie"')
  {
    const hdr = cookies.nonEssentialAllowedFromHeader
    check('no cookie header: no', hdr(null) === false)
    check('a jar without a consent cookie (the app, after the clear): no',
      hdr('sb-ref-auth-token=x; hex_session_started=1') === false)
    check('an accepted website visitor: yes', hdr(`${CONSENT}=${ACCEPTED}`) === true)
  }

  // ── 5. WHAT THE APP STILL SETS, DERIVED FROM THE LIST THE CODE USES ─────
  console.log('\n5. THE OPTIONAL LIST THE CLEAR ACTS ON IS THE ONE THE GATE GUARDS')
  check('NON_ESSENTIAL_COOKIES is exactly the three',
    JSON.stringify([...cookies.NON_ESSENTIAL_COOKIES].sort()) === JSON.stringify([...OPTIONAL].sort()),
    [...cookies.NON_ESSENTIAL_COOKIES].join(', '))

  console.log(bad ? `\n${bad} FAILED` : '\nall passed')
  process.exit(bad ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
