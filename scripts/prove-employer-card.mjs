// THE EMPLOYER'S VIEW OF THEIR OWN ADVERT, AND WHY THIS IS A SCRIPT RATHER
// THAN A DRIVE.
//
// cardModelFromPostedJob had `companyBanner: null` hard-coded, so every card on
// /my-jobs resolved to the branded fallback while the board rendered the
// employer's real photograph for the same advert. Reported 20 Aug 2026: "the
// image on the job card in manage job ads doesn't show but it shows in browse
// jobs".
//
// NO BROWSER DRIVE COULD HAVE CAUGHT IT ON OUR DATA. Thrive Test Employer's
// four adverts all have company_banner_url null, so the fallback they render is
// the CORRECT output for those rows — the fixtures sit in exactly the state the
// bug is invisible in. Same family as the gate that never fires and the
// horizontal scroller that only exists when an employer has active jobs.
//
// So the question is asked of the function, and it is asked in the only form
// that can tell the two states apart: a banner present must come back, and a
// banner absent must come back null. The old code answered NULL TO BOTH, so
// either assertion alone would have been a coin toss and the pair is the check.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const dir = join(tmpdir(), 'thrive-prove-employer-card')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'run.mts')

const cardMod = pathToFileURL(join(process.cwd(), 'lib', 'jobCard.ts')).href
const lineMod = pathToFileURL(join(process.cwd(), 'lib', 'answerLine.ts')).href
const trimMod = pathToFileURL(join(process.cwd(), 'lib', 'trimDeep.ts')).href
const artMod = pathToFileURL(join(process.cwd(), 'lib', 'jobArtwork.ts')).href

writeFileSync(entry, `
import { cardModelFromPostedJob } from ${JSON.stringify(cardMod)}
import { justPostedAnswerLine } from ${JSON.stringify(lineMod)}
import { trimDeep } from ${JSON.stringify(trimMod)}
import { buildArtworkPrompt } from ${JSON.stringify(artMod)}

const out: any[] = []
// Thunked so a throw becomes one named failure with the rest still reported,
// rather than a stack trace that reads as a broken script.
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

const base = {
  id: 'j1', title: 'Head Chef', company: 'Test Co', location: 'Bath',
  salaryMin: 30000, salaryMax: 40000, salaryPeriod: 'year' as const,
  postedDate: '2020-01-01',
}

const BANNER = 'https://example.test/banner.jpg'

// ── THE PAIR. Both were null before the fix; only one is now. ──
rec('banner present survives to the card',
  () => cardModelFromPostedJob({ ...base, companyBanner: BANNER }).banner, BANNER)
rec('banner absent still falls back to null',
  () => cardModelFromPostedJob({ ...base, companyBanner: undefined }).banner, null)
rec('empty string is not a banner',
  () => cardModelFromPostedJob({ ...base, companyBanner: '   ' }).banner, null)

// The two must DISAGREE. If a future change reintroduces a constant, both
// assertions above could still be satisfiable by luck on one of them; this one
// cannot pass unless the function actually reads its input.
rec('the two states are distinguishable',
  () => cardModelFromPostedJob({ ...base, companyBanner: BANNER }).banner
     !== cardModelFromPostedJob({ ...base, companyBanner: undefined }).banner, true)

// ── The post-publish sentence. ──
rec('names the advert', () => justPostedAnswerLine('Head of Sales').sentence,
  'Head of Sales is live on the job board.')
rec('untitled advert still confirms', () => justPostedAnswerLine('').sentence,
  'Your advert is live on the job board.')
rec('offers posting another', () => justPostedAnswerLine('X').action?.href, '/post-job')
rec('eyebrow marks it as an event', () => justPostedAnswerLine('X').eyebrow, 'Just now')
// It must not be the same sentence for a named and an unnamed advert, or the
// title is being dropped somewhere and nobody would see it.
rec('titled and untitled differ',
  () => justPostedAnswerLine('Head of Sales').sentence !== justPostedAnswerLine('').sentence, true)

// ── TRIMMING ON THE WAY TO THE DATABASE ──────────────────────────────────
// The fault this prevents is invisible at every stage except the last: a
// trailing space in the form, in the payload and in the row all look like
// nothing, and then the board renders "London , London".
rec('the exact case from production', () => trimDeep({ title: 'Head of Sales ', location: 'London ' }),
  { title: 'Head of Sales', location: 'London' })
rec('nested objects too', () => trimDeep({ fullLocation: { city: ' Bath ', postcode: '' } }),
  { fullLocation: { city: 'Bath', postcode: '' } })
rec('arrays of strings', () => trimDeep({ tags: [' Urgent ', 'Full-time'] }),
  { tags: ['Urgent', 'Full-time'] })

// IT MUST LEAVE NON-STRINGS ALONE. A trimmer that quietly turned 0 into "" or
// dropped a null would be a far worse bug than the one it fixes.
rec('numbers, booleans and null survive',
  () => trimDeep({ salaryMin: 0, urgent: false, area: null, x: undefined }),
  { salaryMin: 0, urgent: false, area: null, x: undefined })

// INTERNAL SPACE IS NOT COLLAPSED — that is a typo for the employer to fix,
// not something we silently rewrite.
rec('internal whitespace is preserved', () => trimDeep(' Front  of House '), 'Front  of House')

// The pair that makes the check able to fail: trimmed input must come back
// UNCHANGED, so a no-op implementation cannot satisfy both this and the first.
rec('already-clean input is untouched', () => trimDeep({ title: 'Head Chef' }), { title: 'Head Chef' })
rec('trimming actually changed something',
  () => JSON.stringify(trimDeep({ t: 'a ' })) !== JSON.stringify({ t: 'a ' }), true)

// -- GENERATED ARTWORK: THE PROMPT MAY NOT MAKE A CLAIM ------------------
// An image on an advert is read as evidence of the workplace, so the prompt
// is built from the ROLE only. Board titles are Role -- Marketing Phrase and
// the half after the dash is sales copy about the venue: the exact material
// that must never reach the picture.
const claimy = 'Head Chef - Michelin Star Fine Dining, Luxury 5 Star Hotel'
const built = buildArtworkPrompt(claimy.replace(' - ', ' – '))
rec('venue sales copy never reaches the prompt',
  () => /michelin|luxury|5 star|fine dining|hotel/i.test(built.prompt), false)
rec('but the role still picks the right subject',
  () => /kitchen pass/.test(built.subject), true)

// LONGEST MATCH FIRST, the rule the CV vocabulary needed too: a pastry chef
// is not a line chef, and a badly ordered table lets 'chef' swallow it.
rec('pastry is not swallowed by chef',
  () => buildArtworkPrompt('Head Pastry Chef').subject !== buildArtworkPrompt('Head Chef').subject, true)
rec('a bar role gets a bar', () => /bar counter/.test(buildArtworkPrompt('Bar Manager').subject), true)
rec('an unknown role still gets something',
  () => buildArtworkPrompt('Chief Vibes Officer').subject.length > 10, true)

// THE HOUSE STYLE IS ALWAYS ATTACHED, or the images stop being a family.
const missingStyle = ['Head Chef', 'Bar Manager', 'Receptionist', 'Chief Vibes Officer']
  .filter(t => {
    const p = buildArtworkPrompt(t).prompt
    return !/Flat vector illustration/.test(p) || !/No text, no lettering/.test(p)
  })
rec('house style attached to every prompt', () => missingStyle, [])

// NO FACES — an invented person on an employer's advert is worse than none.
rec('faces are excluded', () => /No faces/.test(buildArtworkPrompt('Head Chef').prompt), true)

console.log(JSON.stringify(out))
`)

let raw
try {
  raw = execFileSync('npx', ['tsx', entry], {
    encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
  })
} catch (e) {
  console.error('prove-employer-card: could not run the module')
  console.error(e.stderr || e.message)
  process.exit(1)
}

const results = JSON.parse(raw.trim().split('\n').filter(Boolean).pop())
let failed = 0
for (const r of results) {
  if (r.ok) {
    console.log(`  PASS  ${r.name}`)
  } else {
    failed++
    console.log(`  FAIL  ${r.name}\n          got:  ${JSON.stringify(r.got)}\n          want: ${JSON.stringify(r.want)}`)
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
