// THE HOMEPAGE DEMO VIDEOS ARE CROPPED IN CSS, AND THAT CROP IS LOAD-BEARING.
//
//   node scripts/prove-demo-crop.mjs
//
// Filesystem only. No network, no database, milliseconds.
//
// ── WHAT THIS IS PROTECTING ──────────────────────────────────────────────
//
// The three demo recordings on the home page are 1280x672 screen captures of
// a Chrome window. The top 122px of every one of them is browser furniture:
// tab strip, address bar, extensions, avatar, and a BOOKMARKS BAR with
// "Stripe" and "API Keys · Resend" legible. They were published that way
// until 2 September 2026.
//
// The posters were re-cut to 1280x550. THE VIDEOS COULD NOT BE — the
// job-banners bucket has allowed_mime_types = ["image/*"] and refuses an mp4 —
// so the crop is done in CSS instead:
//
//     .demoVideoWrap { aspect-ratio: 1280 / 550 }
//     .demoVideo     { object-fit: cover; object-position: bottom }
//
// The overflow is exactly 672 - 550 = 122px and `bottom` takes it off the TOP,
// so the furniture is off screen to the pixel.
//
// ── WHAT THIS CHECK CAN AND CANNOT DO, SAID PLAINLY ──────────────────────
//
// It CANNOT prove the crop is correct. It never sees the videos, so it cannot
// know they are still 672 tall, and if somebody uploads a 1280x900 recording
// tomorrow this check passes while 350px of something is cut off.
//
// What it CAN do is the thing that is actually likely: stop the rule being
// removed innocently. It reads as decorative — three properties on a video
// element — and nothing about it announces that deleting it republishes
// somebody's bookmarks bar. A reviewer tidying CSS would have no reason to
// keep it. This makes that go red, and says why.
//
// A NETWORK CHECK WAS CONSIDERED AND DELIBERATELY NOT WRITTEN. Fetching the
// three mp4s to read their dimensions would prove the arithmetic, and it would
// need credentials and a round trip, which puts it in the SKIP-without-network
// class that this file's own rules say does not belong in `verify` by default.
// The cheap half is worth having on its own; see the report for the full
// argument.
//
// ── AND IT BECOMES A NO-OP, NOT A LIE, WHEN THE VIDEOS ARE REPLACED ──────
//
// A 1280x550 source already fills a 1280/550 box with nothing to crop, so the
// rule stays correct and this check stays green. When that happens the rule
// and this check can both go — but only then, and only deliberately.

import { readFileSync } from 'node:fs'

const FILE = 'app/page.module.css'
const css = readFileSync(FILE, 'utf8')

// Strip comments FIRST. This stylesheet explains the crop at length and names
// every property in prose — a check that matched the comment would pass on a
// file whose rule had been deleted and whose explanation had not.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

// THE SELECTOR MUST END WHERE IT ENDS.
// The first version used indexOf('.demoVideo'), which matched
// `.demoVideoWrap` — the wrap is declared first and its class name has the
// other one as a PREFIX. So both lookups returned the wrap's block, and the
// check reported object-fit and object-position missing while they sat in the
// file three lines below. It went red on a correct stylesheet, which is the
// direction that wastes a session; the same substring fault the pattern file
// has been collecting all week, in the check written to prevent one.
const block = (selector) => {
  const re = new RegExp(escapeRe(selector) + '\\s*\\{([^}]*)\\}')
  const m = rules.match(re)
  return m ? m[1] : null
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(52) + (detail ?? ''))
}

const wrap = block('.demoVideoWrap')
const video = block('.demoVideo')

console.log('the homepage demo crop')
console.log('')

check('.demoVideoWrap exists', !!wrap, wrap ? '' : `not found in ${FILE}`)
check('.demoVideo exists', !!video, video ? '' : `not found in ${FILE}`)

if (wrap && video) {
  const ar = /aspect-ratio:\s*1280\s*\/\s*550/.test(wrap)
  const fit = /object-fit:\s*cover/.test(video)
  const pos = /object-position:\s*bottom/.test(video)

  check('.demoVideoWrap sets aspect-ratio: 1280 / 550', ar)
  check('.demoVideo sets object-fit: cover', fit)
  check('.demoVideo sets object-position: bottom', pos)

  if (!ar || !fit || !pos) {
    console.log('')
    console.log('  WHAT THIS MEANS, not what the property is called:')
    console.log('')
    console.log('  The three demo recordings on the home page are 1280x672 screen')
    console.log('  captures whose top 122px is a Chrome window — tab strip, address')
    console.log('  bar, extensions, avatar, and a BOOKMARKS BAR with "Stripe" and')
    console.log('  "API Keys · Resend" legible. Those three properties are the only')
    console.log('  thing cropping it off. Without all three it is back on the home')
    console.log('  page, on every visit.')
    console.log('')
    console.log('  If the mp4s in storage have been replaced with 1280x550 versions')
    console.log('  then this rule IS redundant and this check should be deleted with')
    console.log('  it — but check the storage objects first, deliberately.')
  }
}

console.log('')
if (bad) {
  console.log(`${bad} FAILED`)
  process.exit(1)
}
console.log('the crop that keeps a browser window off the home page is still in place')
process.exit(0)
