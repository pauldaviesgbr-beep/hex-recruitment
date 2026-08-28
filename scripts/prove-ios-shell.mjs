// THE iOS SHELL AGREES WITH THE THINGS IT HAS TO AGREE WITH.
//
//   npm run iosshell:prove
//
// WHAT THIS CAN AND CANNOT SAY. There is no Mac, so nothing here has been
// built, launched or run. This asserts CORRECT FILES and nothing more — it
// cannot tell you the app works, only that the three places the bundle
// identifier is written say the same thing and that the plist declares what
// we decided it would declare. Phase 2 inherits everything else.
//
// THE LOAD-BEARING CHECK IS THE AGREEMENT, NOT ANY ONE VALUE. The identifier
// lives in three files that nothing links together:
//
//   lib/appleSignIn.ts        APPLE_IDENTIFIERS.bundleId — what Apple has
//                             registered, and what the Sign in with Apple
//                             client secret is minted against
//   capacitor.config.ts       appId — what Capacitor writes into the project
//   ios/.../project.pbxproj   PRODUCT_BUNDLE_IDENTIFIER — what actually ships
//
// Nothing type-checks one against another; they are three strings in three
// languages. A mismatch is discovered at upload, days later, and the same
// family as `--nav-height: 66px` against a 69.19px header: each file is
// correct to read and only the comparison shows the fault.
//
// AND IT ASSERTS WHAT MUST BE ABSENT. The privacy labels published on
// 27 Aug 2026 declare NO Location, NO Contacts and NO Tracking. A usage
// string for any of those in Info.plist would contradict a published
// declaration, so their absence is checked rather than assumed.
//
// Filesystem and text only. No network, no database, no Xcode — which is why
// this one belongs in `npm run verify`, unlike navheight:prove and
// deletegate:prove, both of which need a deployment.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
  return ok
}

const PBXPROJ = 'ios/App/App.xcodeproj/project.pbxproj'
const PLIST = 'ios/App/App/Info.plist'

console.log('\n1. THE PROJECT EXISTS AND IS COMMITTED, NOT BUILD OUTPUT')
for (const f of ['capacitor.config.ts', PBXPROJ, PLIST,
                 'ios/App/App/AppDelegate.swift', 'capacitor-shell/www/index.html']) {
  check(f, existsSync(path.join(ROOT, f)))
}

console.log('\n2. THE BUNDLE IDENTIFIER AGREES IN ALL THREE PLACES')
const appleSrc = read('lib/appleSignIn.ts')
const registered = (appleSrc.match(/bundleId:\s*'([^']+)'/) || [])[1]
const configured = (read('capacitor.config.ts').match(/appId:\s*'([^']+)'/) || [])[1]
const shipped = [...read(PBXPROJ).matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)]
  .map(m => m[1].trim())

check('Apple has one registered', Boolean(registered), registered)
check('capacitor.config matches Apple', configured === registered, `${configured} vs ${registered}`)
check('every Xcode build config matches too',
  shipped.length > 0 && shipped.every(v => v === registered),
  `${shipped.length} config(s): ${[...new Set(shipped)].join(', ')}`)

console.log('\n3. THE SHELL LOADS THE LIVE SITE, OVER HTTPS')
const cfg = read('capacitor.config.ts')
check('server.url is the apex, not a preview or localhost',
  /url:\s*'https:\/\/thrivecareer\.co\.uk'/.test(cfg))
check('cleartext is refused', /cleartext:\s*false/.test(cfg))
check('webDir is NOT Next’s public/ — that would publish the offline page',
  /webDir:\s*'capacitor-shell\/www'/.test(cfg))

console.log('\n4. THE PLIST DECLARES WHAT WE DECIDED, AND NOTHING MORE')
const plist = read(PLIST)
const hasKey = (k) => new RegExp(`<key>${k}</key>`).test(plist)
check('export compliance answered in the binary', hasKey('ITSAppUsesNonExemptEncryption'))
check('…and the answer is false', /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist))
check('photo library usage string present', hasKey('NSPhotoLibraryUsageDescription'))
check('camera usage string present', hasKey('NSCameraUsageDescription'))

// The published labels say no to all of these. Their presence would be a
// contradiction of a declaration already live on the store page.
for (const banned of ['NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription',
                      'NSContactsUsageDescription', 'NSMicrophoneUsageDescription',
                      'NSUserTrackingUsageDescription', 'NSHealthShareUsageDescription']) {
  check(`no ${banned} — the labels say no`, !hasKey(banned))
}

console.log('\n5. NOTHING IN THE SHELL CONTRADICTS THE PUBLISHED LABELS')
const pkg = JSON.parse(read('package.json'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const TRACKING = /(firebase|analytics|sentry|bugsnag|crashlytics|appsflyer|adjust|amplitude|mixpanel|segment|idfa|facebook|admob|onesignal)/i
const offenders = Object.keys(deps).filter(d => TRACKING.test(d))
check('no analytics, crash-reporting or advertising dependency', offenders.length === 0, offenders.join(', '))
check('Capacitor is pinned exactly, not floated',
  ['@capacitor/core', '@capacitor/ios', '@capacitor/cli'].every(d => deps[d] && /^\d/.test(deps[d])),
  ['@capacitor/core', '@capacitor/ios', '@capacitor/cli'].map(d => `${d}@${deps[d]}`).join(' '))

console.log('\n6. THE WEB APP IS UNTOUCHED BY ANY OF THIS')
check('next.config has no static export bolted on', !/output:\s*['"]export['"]/.test(read('next.config.js')))
check('the offline page is not a route in public/', !existsSync(path.join(ROOT, 'public/index.html')))

console.log('')
console.log(bad
  ? `  ${bad} FAILED`
  : '  the shell is internally consistent — files only; nothing here has been built')
process.exit(bad ? 1 : 0)
