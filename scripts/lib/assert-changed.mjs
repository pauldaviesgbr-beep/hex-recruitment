// ASK THE QUESTION WITH TWO DIFFERENT ANSWERS — as a mechanism, not a rule.
//
// Twice a throwaway edit script reported success on a string that was already
// there ("import added" after a String.replace whose anchor never matched;
// "cron uses the constant" found in the USAGE rather than the import it was
// meant to add), and once a check FAILED on correct code for the mirror
// reason. The shared cause every time: the old and the new state of the file
// both matched the search, so the search could not distinguish them, and
// which way it lied was luck.
//
// This helper makes that an ERROR rather than a pass. It works from a
// snapshot taken BEFORE the edit, and it REFUSES — loudly, as a distinct
// failure — any assertion whose answer was already true beforehand, because
// such a check proves nothing about the edit.
//
//   import { snapshot, assertChanged, applyEdits } from './lib/assert-changed.mjs'
//
//   const before = snapshot(file)          // BEFORE the edit, or it is theatre
//   ...edit the file however you like...
//   assertChanged(before, {
//     gone:    'the old line',             // must have matched before, none now
//     present: 'the new line',             // must NOT have matched before, some now
//     count:   ['sendEmail(', 3],          // must have had a DIFFERENT count before
//   })
//
// Or let the helper do the edit and the proof in one move — this is the
// String.replace-that-cannot-lie form, and the one to reach for first:
//
//   applyEdits([[file, 'old text', 'new text'],
//               [file, 'other old', 'other new', 'all']])
//
// Every failure throws AssertError with .kind naming which promise broke:
//   MISS              an edit's anchor was not found — nothing was written
//   UNCHANGED         the file's bytes are identical to the snapshot
//   INDISTINGUISHABLE the assertion was already true before the edit
//   GONE / PRESENT / COUNT   the edit landed but left the wrong state
//
// No printing on success. The caller decides what a pass looks like; this
// file only ever raises its voice by throwing.

import fs from 'node:fs'

export class AssertError extends Error {
  constructor(kind, message) {
    super(`${kind}: ${message}`)
    this.kind = kind
  }
}

function matches(text, pattern) {
  if (pattern instanceof RegExp) {
    // A fresh regex each time: a /g/ regex carries lastIndex state between
    // calls, which is exactly the kind of instrument-lies-quietly fault this
    // file exists to kill.
    return (text.match(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g')) || []).length
  }
  if (typeof pattern === 'string' && pattern.length > 0) return text.split(pattern).length - 1
  throw new AssertError('BAD_PATTERN', 'pattern must be a non-empty string or a RegExp')
}

/** Take BEFORE the edit. assertChanged refuses to work without one. */
export function snapshot(file) {
  return { file, text: fs.readFileSync(file, 'utf8'), takenAt: Date.now() }
}

/**
 * Read the file NOW and prove the edit both landed and left the right state.
 * Refuses any check that could not have distinguished before from after.
 */
export function assertChanged(before, { gone, present, count } = {}) {
  if (!before || typeof before.text !== 'string' || !before.file) {
    throw new AssertError('NO_SNAPSHOT', 'assertChanged needs the snapshot taken before the edit — call snapshot(file) first')
  }
  if (gone === undefined && present === undefined && count === undefined) {
    throw new AssertError('NO_CHECK', 'nothing to assert — pass gone, present and/or count')
  }
  const after = fs.readFileSync(before.file, 'utf8')

  // The floor under everything else: if the bytes did not change, no edit
  // happened, whatever any substring says. This is the missed-anchor case.
  if (after === before.text) {
    throw new AssertError('UNCHANGED', `${before.file} is byte-identical to the snapshot — the edit never landed`)
  }

  if (gone !== undefined) {
    const beforeN = matches(before.text, gone)
    if (beforeN === 0) {
      throw new AssertError('INDISTINGUISHABLE',
        `gone ${show(gone)} already had 0 matches before the edit — its absence now proves nothing`)
    }
    const afterN = matches(after, gone)
    if (afterN > 0) {
      throw new AssertError('GONE', `${show(gone)} still matches ${afterN}x in ${before.file}`)
    }
  }

  if (present !== undefined) {
    const beforeN = matches(before.text, present)
    if (beforeN > 0) {
      throw new AssertError('INDISTINGUISHABLE',
        `present ${show(present)} already matched ${beforeN}x before the edit — finding it now proves nothing`)
    }
    const afterN = matches(after, present)
    if (afterN === 0) {
      throw new AssertError('PRESENT', `${show(present)} does not match anywhere in ${before.file}`)
    }
  }

  if (count !== undefined) {
    const [pattern, expected] = count
    if (!Number.isInteger(expected)) throw new AssertError('BAD_PATTERN', 'count must be [pattern, integer]')
    const beforeN = matches(before.text, pattern)
    if (beforeN === expected) {
      throw new AssertError('INDISTINGUISHABLE',
        `count of ${show(pattern)} was already ${expected} before the edit — the count cannot show it changed`)
    }
    const afterN = matches(after, pattern)
    if (afterN !== expected) {
      throw new AssertError('COUNT', `${show(pattern)} matches ${afterN}x, expected ${expected}, in ${before.file}`)
    }
  }

  return { file: before.file, before: before.text, after }
}

/**
 * The edit and its proof as one move. Each entry is
 *   [file, from, to]        replace the FIRST occurrence
 *   [file, from, to, 'all'] replace every occurrence
 * String.replace returns its input unchanged when the anchor is missing, so
 * this never uses it bare: a missing anchor throws MISS naming the entry, and
 * nothing is written for that entry. After writing, each file is re-read and
 * the landed state asserted from DISK, not from the string that was built.
 */
export function applyEdits(edits) {
  const results = []
  for (const [file, from, to, mode] of edits) {
    if (typeof from !== 'string' || from.length === 0) throw new AssertError('BAD_PATTERN', `empty 'from' for ${file}`)
    if (from === to) throw new AssertError('BAD_PATTERN', `from and to are identical for ${file}: ${show(from)}`)
    const before = snapshot(file)
    const n = matches(before.text, from)
    if (n === 0) {
      throw new AssertError('MISS', `anchor not found in ${file}: ${show(from)} — nothing written`)
    }
    const replaced = mode === 'all' ? n : 1
    const edited = mode === 'all'
      ? before.text.split(from).join(to)
      : before.text.slice(0, before.text.indexOf(from)) + to + before.text.slice(before.text.indexOf(from) + from.length)
    fs.writeFileSync(file, edited)

    // Re-read from disk — assert what the FILE holds, not the string we built.
    const now = fs.readFileSync(file, 'utf8')
    if (now === before.text) {
      throw new AssertError('UNCHANGED', `${file} is byte-identical after the edit — nothing landed`)
    }
    // When from and to share a substring in either direction (the guarded-
    // ternary family), occurrence counts of one can survive the edit unchanged
    // and would refuse or lie — there the byte comparison above is the only
    // check that cannot, plus `to` existing at all. Otherwise the counts of
    // BOTH sides must have moved by exactly the edit.
    const overlap = to.includes(from) || from.includes(to)
    if (!overlap) {
      const fromNow = matches(now, from)
      if (fromNow !== n - replaced) {
        throw new AssertError('COUNT', `${show(from)} matches ${fromNow}x after the edit, expected ${n - replaced}, in ${file}`)
      }
    }
    if (matches(now, to) < replaced) {
      throw new AssertError('PRESENT', `${show(to)} does not appear ${replaced}x in ${file} after the edit`)
    }
    results.push({ file, replaced })
  }
  return results
}

function show(p) {
  const s = p instanceof RegExp ? String(p) : JSON.stringify(p)
  return s.length > 72 ? s.slice(0, 69) + '…' : s
}
