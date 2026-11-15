// npm run fonts:prove
//
// THE BUILD FETCHES NO FONTS FROM GOOGLE (15 Nov 2026). next/font/google
// downloads its files during every build; twice in one hour the download came
// back malformed and the build died in next/font, on a commit that rebuilt
// cleanly minutes later. The fonts now live in app/fonts and load through
// next/font/local.
//
// Asserts: nothing imports next/font/google; every file the layout's
// localFont calls name EXISTS, IS A WOFF2 (its first four bytes), and IS
// TRACKED IN GIT — a file on this machine but not in the repository builds
// here and fails on Vercel, which is how the iOS icon was lost in August;
// and each family's OFL licence sits beside it. Filesystem and git only.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0, ran = 0
const check = (name, got, want) => {
  ran++
  let v
  try { v = got() } catch (e) { console.log(`FAIL  ${name}\n        threw: ${e.message}`); failed++; return }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) { console.log(`FAIL  ${name}\n        want ${b}\n        got  ${a}`); failed++ } else console.log(`ok    ${name}`)
}

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?|mjs|css)$/.test(name)) out.push(p)
  }
  return out
}
const sources = ['app', 'components', 'lib'].flatMap(d => walk(join(ROOT, d)))
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

check('ZERO-GUARD: the scan reads the codebase', () => sources.length > 200, true)
check('nothing imports next/font/google', () => sources.filter(f => /from ['"]next\/font\/google['"]/.test(stripComments(readFileSync(f, 'utf8')))).map(f => relative(ROOT, f)), [])

const layout = readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8')
const srcs = Array.from(new Set(Array.from(stripComments(layout).matchAll(/src:\s*'(\.\/fonts\/[^']+)'/g)).map(m => m[1])))
check('the layout loads the three families through next/font/local', () => [/from 'next\/font\/local'/.test(layout), srcs.length], [true, 3])

const tracked = new Set(execFileSync('git', ['ls-files', 'app/fonts'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean))
for (const s of srcs) {
  const rel = join('app', s.replace(/^\.\//, '')).replace(/\\/g, '/')
  check(`${rel}: exists, is WOFF2, and is tracked in git`, () => {
    const abs = join(ROOT, rel)
    const magic = existsSync(abs) ? readFileSync(abs).subarray(0, 4).toString('latin1') : null
    return { exists: existsSync(abs), woff2: magic === 'wOF2', tracked: tracked.has(rel) }
  }, { exists: true, woff2: true, tracked: true })
}

check('each family carries its OFL licence, tracked', () =>
  ['OFL-inter.txt', 'OFL-fraunces.txt', 'OFL-dancingscript.txt'].map(f => tracked.has(`app/fonts/${f}`) && /SIL Open Font License/.test(readFileSync(join(ROOT, 'app/fonts', f), 'utf8'))),
  [true, true, true])

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) { console.error(`${failed} FAILED`); process.exit(1) }
