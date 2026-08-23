// NO EMOJI ON ANY SURFACE A STRANGER SEES.
//
//   npm run noemoji:prove
//
// components/icons.tsx has said this since 14 Aug 2026 — "every
// emoji-as-iconography in the product routes through here now" — and it was a
// rule with nothing behind it. Seven got in anyway: three clocks, two
// hourglasses, a party popper and a video camera in an email. A rule that has
// already been broken needs a mechanism, not another sentence.
//
// THE SPLIT IS THE LOAD-BEARING PART. Extended_Pictographic is the right net
// for FINDING a glyph and the wrong one for DECIDING about it: it counts © and
// ↔ and ⬇ as emoji. Unicode draws the line itself — Emoji_Presentation means
// "renders in colour by default, everywhere", and a text-default glyph renders
// as a monochrome character unless VS16 (U+FE0F) forces colour.
//
//   COLOUR   🎉 ✅ ⭐ 🎥   an emoji on every device        → banned here
//   TEXT     © ↔ ⬇ ⚠ ↗    a glyph the weight of a letter  → Paul's call, kept
//
// The monochrome ones are TYPOGRAPHY, NOT ICONS — Paul's decision of 14 Aug
// 2026, recorded at the top of components/icons.tsx along with his reasoning.
// This check deliberately does not touch them.
//
// THE CONTROLS RUN FIRST AND COME FROM INLINE LITERALS. This project has been
// burned twice by an emoji detector: one returned nothing while a pencil sat in
// the file it had just read, and one's control pointed at a file the sweep then
// legitimately emptied, so the control began failing ON SUCCESS. A fixture
// inside the population under change is not a control. If the detector cannot
// find something known to be there, this exits without reporting a count at
// all — a count nobody can trust is worse than no count.
//
// Filesystem and pure text. No network, no database.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = join(__dirname, '..')

const PICTO = /\p{Extended_Pictographic}/u
const KEYCAP = /[0-9#*]️?⃣/
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u
const hasGlyph = (s: string) => PICTO.test(s) || KEYCAP.test(s) || FLAG.test(s)

const isColour = (ch: string, next: string | undefined) =>
  /\p{Emoji_Presentation}/u.test(ch) || next === '️'

const colourIn = (line: string) => {
  // Array.from, not a spread: the repo's tsc target predates downlevelIteration
  // and a spread over a string does not compile. Same code-point splitting,
  // which is what matters — surrogate pairs must stay whole.
  const chars = Array.from(line)
  const out: string[] = []
  chars.forEach((ch, i) => {
    if (!PICTO.test(ch)) return
    if (isColour(ch, chars[i + 1])) out.push(ch)
  })
  // keycaps and flags are always colour
  out.push(...(line.match(/[0-9#*]️?⃣/g) || []))
  out.push(...(line.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) || []))
  return out
}

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else console.log(`ok    ${name}`)
}

// ── CONTROLS, FROM LITERALS THE SWEEP CANNOT REACH ─────────────────────────

const DETECTS: [string, string, boolean][] = [
  ['finds a plain emoji', '\u{1F389}', true],
  ['finds the pencil that was missed once', '✏️', true],
  ['finds a keycap', '1️⃣', true],
  ['finds a flag', '\u{1F1EC}\u{1F1E7}', true],
  ['does NOT fire on an arrow', '→', false],
  ['does NOT fire on an en dash', '–', false],
  ['does NOT fire on plain text', 'Log in', false],
]
const SPLITS: [string, string, boolean][] = [
  ['\u{1F389} counts as colour', '\u{1F389}', true],
  ['✅ counts as colour, despite looking like text', '✅', true],
  ['© is TEXT and must not be swept', '©', false],
  ['⬇ bare is TEXT', '⬇', false],
  ['⚠ bare is TEXT — Paul kept these deliberately', '⚠', false],
  ['⚠️ with VS16 IS colour', '⚠️', true],
]

let controlsBad = 0
for (const [name, sample, want] of DETECTS) {
  if (hasGlyph(sample) !== want) { console.log(`CONTROL FAIL  ${name}`); controlsBad++ }
}
for (const [name, sample, want] of SPLITS) {
  if ((colourIn(sample).length > 0) !== want) { console.log(`CONTROL FAIL  ${name}`); controlsBad++ }
}
if (controlsBad) {
  console.error(`\n${controlsBad} control(s) failed — the detector cannot be trusted, so NO COUNT IS REPORTED.`)
  process.exit(1)
}
console.log(`ok    ${DETECTS.length + SPLITS.length} controls: it finds what it should, ignores → – ©, and splits colour from text`)

// ── A LINE'S OWN START DOES NOT TELL YOU IT IS A COMMENT ───────────────────
// The inventory's first pass called three ⚡ product UI. All three were
// CONTINUATION lines inside block comments describing an icon slot, and nothing
// in this codebase renders a bolt at all. Block state is tracked across lines.
// It errs toward calling things comments, which UNDER-reports — and an
// under-report checked by hand beats an over-report that invents work.

const commentMask = (src: string, ext: string) => {
  const lines = src.split(/\r?\n/)
  const out = new Array(lines.length).fill(false)
  let inBlock = false
  lines.forEach((line, i) => {
    const t = line.trim()
    if (inBlock) {
      out[i] = true
      if (line.includes('*/')) inBlock = false
      return
    }
    if (ext !== '.css' && (t.startsWith('//') || t.startsWith('*'))) { out[i] = true; return }
    const open = line.lastIndexOf('/*')
    if (open !== -1 && line.indexOf('*/', open) === -1) {
      inBlock = true
      out[i] = !hasGlyph(line.slice(0, open))
      return
    }
    out[i] = /^\{?\/\*.*\*\/\}?$/.test(t)
  })
  return out
}

// ── THE SURFACES A STRANGER SEES ───────────────────────────────────────────
// Not scripts (console output only I read), not docs, not admin. Those are
// separate decisions and lumping them in gives a number nobody can act on.

const WATCHED = ['app', 'components', 'lib', 'emails']
const EXCLUDED = ['app/admin']
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

const files: string[] = []
for (const dir of WATCHED) {
  const base = join(ROOT, dir)
  ;(function walk(d: string) {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (EXT.has(extname(e))) files.push(p)
    }
  })(base)
}

const offenders: string[] = []
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  if (EXCLUDED.some(x => rel.startsWith(x))) continue
  const src = readFileSync(f, 'utf8')
  if (!hasGlyph(src)) continue
  const mask = commentMask(src, extname(f))
  src.split(/\r?\n/).forEach((line, i) => {
    if (mask[i]) return
    const found = colourIn(line)
    if (found.length) offenders.push(`${rel}:${i + 1}  ${found.join('')}  ${line.trim().slice(0, 70)}`)
  })
}

check(
  'NO COLOUR EMOJI ON ANY SURFACE A CANDIDATE, AN EMPLOYER OR AN INBOX SEES',
  () => offenders,
  []
)

// The check is only worth anything if it was looking somewhere. A walk that
// finds no files passes trivially — the clean-pass failure this repo has hit
// five times.
check(
  'and it actually read the product — not an empty file list',
  () => files.length > 200,
  true
)

console.log(`\n${ran - failed}/${ran} passed   (${files.length} files under app, components, lib and emails)`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}
