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

// ── DECODE BEFORE YOU DETECT ───────────────────────────────────────────────
// THE FIRST VERSION OF THIS READ SOURCE AS TEXT AND MISSED ELEVEN. A glyph in
// a file does not have to be written as a glyph:
//
//   &#128188;         HTML decimal entity — how 💼 and 💬 reach the employer
//                     dashboard's empty states, and how 🎉 reaches the FOUNDING
//                     EMPLOYER APPROVAL EMAIL, which lands in a real inbox
//   \u{1F4BC}         a JS escape — the five analytics tab icons
//   💼      the surrogate-pair form of the same thing
//   &#x1F4BC;         the hex entity form
//
// All of them render as emoji and none of them is an emoji in the bytes. The
// inventory reported SEVEN and the drive found 💼 and 💬 on a page the
// inventory had called clean — the check was blind, not the page.
//
// So every file is normalised first and the detector runs on what the BROWSER
// will end up with, not on what the editor shows.
const decodeEscapes = (src: string) =>
  src
    .replace(/\\u\{([0-9A-Fa-f]{1,6})\}/g, (m, h) => {
      const n = parseInt(h, 16)
      return n <= 0x10FFFF ? String.fromCodePoint(n) : m
    })
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]{1,6});/g, (m, h) => {
      const n = parseInt(h, 16)
      return n <= 0x10FFFF ? String.fromCodePoint(n) : m
    })
    .replace(/&#(\d{1,7});/g, (m, d) => {
      const n = parseInt(d, 10)
      return n <= 0x10FFFF ? String.fromCodePoint(n) : m
    })

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

// THE ENCODINGS. This is the control that would have saved eleven: the first
// version read source as text and every one of these was invisible to it.
const ENCODED: [string, string, boolean][] = [
  ['a decimal HTML entity is decoded', '&#128188;', true],
  ['a hex HTML entity is decoded', '&#x1F4BC;', true],
  ['a JS code-point escape is decoded', '\\u{1F4BC}', true],
  ['a surrogate pair escape is decoded', '\\uD83D\\uDCBC', true],
  ['a NON-emoji entity stays innocent', '&#8212;', false],
  ['and an ordinary number is not an entity', 'width: 128188px', false],
]

let controlsBad = 0
for (const [name, sample, want] of DETECTS) {
  if (hasGlyph(sample) !== want) { console.log(`CONTROL FAIL  ${name}`); controlsBad++ }
}
for (const [name, sample, want] of ENCODED) {
  if ((colourIn(decodeEscapes(sample)).length > 0) !== want) { console.log(`CONTROL FAIL  ${name}`); controlsBad++ }
}
for (const [name, sample, want] of SPLITS) {
  if ((colourIn(sample).length > 0) !== want) { console.log(`CONTROL FAIL  ${name}`); controlsBad++ }
}
if (controlsBad) {
  console.error(`\n${controlsBad} control(s) failed — the detector cannot be trusted, so NO COUNT IS REPORTED.`)
  process.exit(1)
}
console.log(`ok    ${DETECTS.length + SPLITS.length + ENCODED.length} controls: it finds what it should, ignores → – ©, and splits colour from text`)

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
  // Decoded per line, so line numbers survive: every encoding sits inside one
  // line, and decoding the whole file at once would be the same answer with
  // worse reporting.
  if (!hasGlyph(decodeEscapes(src))) continue
  const mask = commentMask(src, extname(f))
  src.split(/\r?\n/).forEach((line, i) => {
    if (mask[i]) return
    const found = colourIn(decodeEscapes(line))
    if (found.length) offenders.push(`${rel}:${i + 1}  ${found.join('')}  ${line.trim().slice(0, 70)}`)
  })
}

// ── THE HOLD LIST ──────────────────────────────────────────────────────────
// Paul approved a scope of SEVEN on 23 Aug 2026. The count was wrong: this
// check could not see encoded glyphs, so the real number was thirty. The
// DECISION did not change — the instrument did — but a count is the thing he
// approves, so the twenty-one still standing wait for his word rather than
// being swept on my own authority.
//
// EVERY SURFACE THAT REACHES AN INBOX IS ALREADY DONE, because that was his
// stated priority: interview-rescheduled 🎥, the founding-approval 🎉 and the
// waitlist ✅. What is held is all in-product.
//
// This is a HOLD, not an exemption. The check pins the exact set: anything new
// anywhere fails, and a held file gaining another emoji fails. Clearing one
// means deleting its line here, which is what makes the list shrink rather
// than rot. Keyed on file and glyph, not line number, so ordinary edits to
// these files do not break it.
const HELD_23_AUG_2026 = [
  'app/dashboard/analytics/AnalyticsContent.tsx  📊🌐📋💼👥',
  'app/dashboard/page.tsx  📋🎯💬✅🔖🔔📄🎯🔍⚡⚡',
  'app/employer/dashboard/page.tsx  💼💬💬',
  'app/register/employer-free/page.tsx  🎉🔴🟡',
  'components/CandidateInsights.tsx  📋🎯⚡📊📊🕔',
]

const byFile: Record<string, string[]> = {}
for (const o of offenders) {
  const [loc, glyph] = [o.split('  ')[0], o.split('  ')[1]]
  const file = loc.split(':')[0]
  ;(byFile[file] ??= []).push(glyph)
}
const standing = Object.entries(byFile).map(([f, g]) => `${f}  ${g.join('')}`).sort()

check(
  'NO NEW EMOJI, AND THE HELD SET HAS NOT GROWN',
  () => standing,
  HELD_23_AUG_2026.slice().sort()
)

check(
  'NOTHING THAT REACHES AN INBOX CARRIES ONE',
  () => offenders.filter(o => /^(emails\/|app\/api\/)/.test(o)),
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
