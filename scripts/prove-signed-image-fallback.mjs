// EVERY <SignedImage> MUST PASS A fallback.
//
// SignedImage resolves its signed URL in a useEffect, so between mount and the
// URL arriving it renders whatever `fallback` says — and NOTHING AT ALL when
// none is given. Without a fallback a call site therefore shows an empty box
// in three separate states: no photo, still signing, and failed to load.
//
// FOUR OF SEVENTEEN CALL SITES PASSED ONE. The other thirteen rendered null.
// The good answer was already in the codebase, written by whoever thought
// hardest about it, and never applied outward — which is why this check exists
// rather than a note asking people to remember.
//
// IT COUNTS ELEMENTS, NOT LINES, AND THAT IS THE POINT. Every earlier count of
// this was made with `grep -n "<SignedImage"`, which counts LINES: it cannot
// see a multi-line element as one thing, and it under-reported the total three
// times running (14, then 14 again, actually 17). A regex over the whole file
// for the complete element is the only version that can be trusted.
//
// Filesystem only — no network, no database — so it runs everywhere and can
// never be a red nobody expects.

import fs from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!/node_modules|\.next|\.git/.test(p)) walk(p)
    } else if (p.endsWith('.tsx')) {
      files.push(p)
    }
  }
}
for (const r of ROOTS) if (fs.existsSync(r)) walk(r)

let total = 0
const missing = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  // The whole self-closing element, however many lines it spans.
  const re = /<SignedImage\b[\s\S]*?\/>/g
  let m
  while ((m = re.exec(src))) {
    total++
    if (!/\bfallback=/.test(m[0])) {
      const line = src.slice(0, m.index).split('\n').length
      missing.push(`${f}:${line}  ${m[0].replace(/\s+/g, ' ').slice(0, 72)}`)
    }
  }
}

console.log(`SignedImage elements: ${total}`)
console.log(`with a fallback:      ${total - missing.length}`)
console.log(`without:              ${missing.length}`)

if (!total) {
  console.log('\nFAIL: no SignedImage elements found at all — the check is pointed at nothing.')
  process.exit(1)
}
if (missing.length) {
  console.log('\nFAIL: these render NOTHING while the URL signs, and nothing if it fails:')
  for (const m of missing) console.log('  ' + m)
  console.log('\nPass the initials (or, for a signature, the signer\'s typed name)')
  console.log('as `fallback` — the shape you want already exists at the call site.')
  process.exit(1)
}
console.log('\nOK — every SignedImage has a fallback.')
