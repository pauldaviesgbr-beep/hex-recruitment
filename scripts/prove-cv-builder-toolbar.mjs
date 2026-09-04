// THE CV BUILDER TOOLBAR WRAPS, AND ITS BANNER DOES NOT CLAIM A DEAD STICKY.
//
//   node scripts/prove-cv-builder-toolbar.mjs
//
// Filesystem only. No network, no database, milliseconds. In verify.
//
// Two faults Paul filmed on 4 Sept 2026, one screenshot:
//
//   · .bannerActions had no flex-wrap, so four buttons on a 393px phone
//     shrank to min-content and CLIPPED at the screen edge ("Download Word"
//     with its corner cut). Controls wrap; content scrolls.
//   · .banner declared position: sticky at mobile — DEAD (body's mobile
//     overflow-x: hidden; the 31 Aug mechanism, third member), and in
//     WKWebView half-pinned over the section header, clipping the AI
//     Assist button.
//
// If sticky is ever brought back here it must come with the option-B
// prerequisites (body overflow-x: clip, inset-aware top) and a rewrite of
// this check — not by surprise.

import { readFileSync } from 'node:fs'

const FILE = 'app/cv-builder/page.module.css'
const css = readFileSync(FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + (detail ?? ''))
}

console.log('the cv-builder toolbar')
console.log('')

const actions = (css.match(/\.bannerActions\s*\{([^}]*)\}/) || [])[1]
// ZERO-GUARD: no block means the search broke or the class was renamed.
check('.bannerActions exists', !!actions, actions ? '' : 'not found')
check('…and the control row WRAPS', !!actions && /flex-wrap:\s*wrap/.test(actions), '')

// No .banner block may declare sticky — at any width. Count across ALL its
// blocks, the modal-close lesson: the rule that runs on a phone is the one
// in the media query.
const bannerBlocks = [...css.matchAll(/\.banner\s*\{([^}]*)\}/g)].map(m => m[1])
const stickies = bannerBlocks.filter(b => /position:\s*sticky/.test(b))
check('.banner declares sticky in NONE of its blocks', stickies.length === 0,
  `${bannerBlocks.length} block(s), ${stickies.length} sticky`)

console.log('')
if (bad) {
  console.log(`${bad} FAILED`)
  process.exit(1)
}
console.log('the toolbar wraps, and the banner makes no dead sticky claim')
process.exit(0)
