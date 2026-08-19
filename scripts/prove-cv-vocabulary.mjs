// THE VOCABULARY IS THE ASSET, SO IT GETS THE ASSERTIONS.
//
// Every case is a pair that must come out DIFFERENT. A lookup that returned the
// same answer for "sous chef" and "senior sous chef" would look like it worked
// on any single example — the longest-match rule is only visible when the two
// are compared.
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const dir = join(tmpdir(), 'thrive-prove-vocab'); mkdirSync(dir, { recursive: true })
const entry = join(dir, 'run.mts')
writeFileSync(entry, `
import { resolveSeniority, foldTitle, SENIORITY, SKILL_TERMS }
  from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'lib', 'cvVocabulary.ts')).href)}
const out: any[] = []
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

// LONGEST MATCH WINS — the pair that proves it.
rec('sous chef', () => resolveSeniority('Sous Chef')?.title, 'Sous Chef')
rec('senior sous is NOT sous', () => resolveSeniority('Senior Sous Chef')?.title, 'Senior Sous Chef')
rec('junior sous is NOT sous', () => resolveSeniority('Junior Sous Chef')?.title, 'Junior Sous Chef')
rec('their ranks differ', () => [
  resolveSeniority('Junior Sous Chef')?.rank,
  resolveSeniority('Sous Chef')?.rank,
  resolveSeniority('Senior Sous Chef')?.rank,
], [5, 6, 7])

// ACCENTS FOLD BOTH WAYS. The bug this file caught: the accented alias was
// unreachable because only the input was stripped.
rec('maitre d (plain)', () => resolveSeniority('Maitre D')?.title, 'Head Waiter')
rec('maître d (accented)', () => resolveSeniority('Maître d')?.title, 'Head Waiter')
rec('patissier (plain)', () => resolveSeniority('Patissier')?.title, 'Pastry Chef')
rec('pâtissier (accented)', () => resolveSeniority('Pâtissier')?.title, 'Pastry Chef')

// Real spellings off real CVs, including the misspelling.
rec('CDP abbreviation', () => resolveSeniority('CDP')?.title, 'Chef de Partie')
rec('board spelling', () => resolveSeniority('Chef De Partie')?.title, 'Chef de Partie')
rec('misspelling', () => resolveSeniority('Cheff de Partie')?.title, 'Chef de Partie')
rec('embedded in a longer title',
  () => resolveSeniority('Chef de Partie - Larder Section')?.title, 'Chef de Partie')

// A HEAD CHEF OUTRANKS A COMMIS. If this ever came out equal the whole
// trajectory design is decorative.
rec('head chef outranks commis', () =>
  (resolveSeniority('Head Chef')!.rank > resolveSeniority('Commis Chef')!.rank), true)

// UNKNOWN IS NULL, NOT A GUESS.
rec('unknown title -> null', () => resolveSeniority('Chief Vibes Officer'), null)
rec('empty -> null', () => resolveSeniority('   '), null)
rec('undefined -> null', () => resolveSeniority(undefined), null)

// Structural: no duplicate canonical titles, every alias folds to itself.
rec('no duplicate titles', () => {
  const t = SENIORITY.map(r => r.title)
  return t.length - new Set(t).size
}, 0)
rec('every alias survives folding', () =>
  SENIORITY.flatMap(r => r.aliases).filter(a => foldTitle(a).length === 0), [])
rec('every alias resolves to its own role', () =>
  SENIORITY.flatMap(r => r.aliases.map(a => [a, resolveSeniority(a)?.title === r.title]))
    .filter(([, ok]) => !ok).map(([a]) => a), [])
rec('skill terms are unique', () => SKILL_TERMS.length - new Set(SKILL_TERMS).size, 0)
rec('skill terms are lowercase', () => SKILL_TERMS.filter(s => s !== s.toLowerCase()), [])

console.log(JSON.stringify(out))
`)

let raw
try {
  raw = execFileSync('npx', ['tsx', entry], { encoding: 'utf8', shell: true, cwd: process.cwd(), stdio: ['ignore','pipe','pipe'] })
} catch (e) { console.error('FAIL could not run'); console.error(e.stdout||'', e.stderr||''); rmSync(dir,{recursive:true,force:true}); process.exit(1) }
rmSync(dir, { recursive: true, force: true })
const line = raw.trim().split('\n').filter(l => l.startsWith('[')).pop()
if (!line) { console.error('FAIL no result line'); process.exit(1) }
let failed = 0
for (const r of JSON.parse(line)) {
  if (r.ok) console.log(`  ok    ${r.name}`)
  else { failed++; console.log(`  FAIL  ${r.name}\n          want ${JSON.stringify(r.want)}\n          got  ${JSON.stringify(r.got)}`) }
}
console.log(`\n${JSON.parse(line).length - failed}/${JSON.parse(line).length} passed`)
process.exit(failed ? 1 : 0)
