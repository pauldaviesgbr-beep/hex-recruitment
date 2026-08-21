// A BARE /* … */ IN JSX CHILDREN IS TEXT, AND IT PRINTS ON THE PAGE.
//
// On 21 Aug 2026 a block comment went into components/FeedCard.tsx without its
// braces:
//
//     >
//       /* ONE FALLBACK FOR "NO PHOTO", AND IT IS THE BRANDED PANEL. …  */
//       {model.banner ? … }
//
// JSX only treats a comment as a comment inside an expression container —
// {/* … */}. Without the braces it is a TEXT NODE, so four paragraphs of
// explanation rendered across every card on the job board, over the photographs,
// on production.
//
// WHY NOTHING CAUGHT IT. tsc passed — it is valid JSX. The production build
// passed — it is valid JSX. Three browser drives passed, because every one
// asserted about classes, counts and data and none of them read what the page
// SAYS. That is the division already written down here: state beats screen for
// whether it is CORRECT, screen beats state for whether it is FINISHED. Only
// state had been measured.
//
// IT USES THE TYPESCRIPT PARSER, NOT A REGEX, and that is the second lesson.
// The first version of this check asked whether "{/*" appeared on the same line
// and reported 28 findings of which 27 were correct code — the ordinary shape
//
//     {condition && (
//       /* a perfectly real comment */
//       <Thing />
//     )}
//
// puts the comment inside an expression container, where it is a comment. A
// check that cries wolf 27 times out of 28 is one nobody runs twice. The
// compiler already knows the difference: a JsxText node IS the text that
// renders, so asking it removes the judgement entirely.

import ts from 'typescript'
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const ROOT = process.cwd()
// THE GLOB HAS TO INCLUDE TOP-LEVEL FILES, AND `**/` DOES NOT.
//
// This read git ls-files "components/**/*.tsx", which in git pathspec requires
// an intervening directory -- so components/FeedCard.tsx, and every other file
// sitting directly in components/, was never scanned. 124 files of 204.
//
// That is how a stray-comment check was written, run, and reported clean while
// the exact fault it exists for sat in an unscanned file. A plain listing
// filtered in JS instead: one source of paths, and no pathspec semantics to be
// wrong about.
const files = execSync('git ls-files', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter(f => /^(app|components)\//.test(f) && f.endsWith('.tsx'))

/** Every JsxText node whose content contains a block-comment opener. */
function strayComments(src, fileName) {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      const text = node.getFullText()
      if (text.includes('/*')) {
        const idx = text.indexOf('/*')
        const pos = node.getFullStart() + idx
        const { line } = sf.getLineAndCharacterOfPosition(pos)
        out.push({
          line: line + 1,
          text: text.slice(idx, idx + 70).replace(/\s+/g, ' ').trim(),
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

// A FILE GIT STILL LISTS BUT DISK NO LONGER HAS IS A DELETION IN PROGRESS,
// NOT A FINDING. The list comes from `git ls-files`, which keeps naming a
// deleted file until the deletion is committed — so removing a route mid-work
// made this guard CRASH with ENOENT before it checked anything. A stack trace
// reads as a broken harness rather than as a fact about the code, and this
// project has lost a session to exactly that shape before. Skip them, and say
// how many, so the skip is visible rather than silent.
const gone = files.filter(f => !existsSync(path.join(ROOT, f)))
if (gone.length) console.log(`skipped ${gone.length} file(s) deleted but not yet committed`)

const findings = []
for (const file of files.filter(f => existsSync(path.join(ROOT, f)))) {
  const src = readFileSync(path.join(ROOT, file), 'utf8')
  for (const hit of strayComments(src, file)) findings.push({ file, ...hit })
}

console.log(`parsed ${files.length} JSX files`)

// POSITIVE CONTROL on inline fixtures the sweep cannot reach, covering BOTH
// directions — the fault, and the shape that produced 27 false positives.
{
  const bad = 'export const A = () => (<div>\n  /* renders as text */\n  <b/>\n</div>)'
  const okBraced = 'export const B = () => (<div>\n  {/* a real comment */}\n  <b/>\n</div>)'
  const okInExpr = 'export const C = () => (<div>\n  {x && (\n    /* a real comment */\n    <b/>\n  )}\n</div>)'
  const n = (s, f) => strayComments(s, f).length
  if (n(bad, 'bad.tsx') !== 1 || n(okBraced, 'ok1.tsx') !== 0 || n(okInExpr, 'ok2.tsx') !== 0) {
    console.error('CONTROL FAILED — the detector cannot separate a text node from a real comment.')
    console.error(`  bare-in-children: ${n(bad, 'bad.tsx')} (want 1)`)
    console.error(`  braced:           ${n(okBraced, 'ok1.tsx')} (want 0)`)
    console.error(`  inside {expr}:    ${n(okInExpr, 'ok2.tsx')} (want 0)`)
    process.exit(1)
  }
  console.log('control ok — flags a bare /* in children, passes a braced one and one inside an expression')
}

if (!findings.length) {
  console.log('\nno stray block comments in JSX')
  process.exit(0)
}

console.log('')
for (const f of findings) {
  console.log(`  FAIL  ${f.file}:${f.line}`)
  console.log(`          ${f.text}`)
  console.log('          That is a TEXT NODE — it prints on the page. Wrap it: {/* … */}')
}
console.log(`\n${findings.length} stray comment(s)`)
process.exit(1)
