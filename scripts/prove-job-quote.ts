// WHAT DOES THE NO-PHOTOGRAPH CARD SAY?
//
// lib/jobQuote picks one sentence out of an advert and puts it at 22px on a
// card. Getting it wrong is not a layout bug — it is a sentence the employer
// did not write, or half a sentence with an ellipsis, published under their
// name. So the rule is asserted here rather than reasoned about in a comment.
//
// The fixtures are the shapes this board actually holds: the form's headed
// HTML, the scrape's unstructured prose, and the empty row.
//
//   npx tsx scripts/prove-job-quote.ts
//
// No network, no database, no images.

import { selectQuote, firstSentence, companyInitials, QUOTE_MAX } from '../lib/jobQuote'
import { composeDescription } from '../lib/composeDescription'
import { formatJobLocation } from '../lib/jobCard'

const out: { name: string; got: any; want: any; ok: boolean }[] = []
// Thunked, so an assertion that THROWS becomes one named failure with the rest
// still reporting. A prove script that dies on the first break prints a stack
// trace, which reads as a broken harness rather than as the fault it found.
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

// ── THE ORDER ──────────────────────────────────────────────────────────────

const bothSections = composeDescription('guided', {
  dayToDay: 'Running a section on a busy pass.',
  experienceNeeded: 'Two years in a fresh-food kitchen.',
  whatWeOffer: 'Four days across a rota, no late finishes.',
}, '')

rec('"what we offer" wins over "what you\'ll be doing"',
  () => selectQuote({ fullDescription: bothSections }),
  'Four days across a rota, no late finishes')

// THE PAIR a stub cannot satisfy: remove the winner and a DIFFERENT sentence
// must appear. A rule hard-coded to either section satisfies only one of these.
rec('with no offer section it falls to the day-to-day',
  () => selectQuote({ fullDescription: composeDescription('guided', {
    dayToDay: 'Running a section on a busy pass.',
  }, '') }),
  'Running a section on a busy pass')

// ── SECTION BOUNDARIES ─────────────────────────────────────────────────────
// A greedy match would let "what we offer" swallow everything after it, and the
// first sentence would then be right by luck rather than by parsing.

rec('a section stops at the next heading',
  () => selectQuote({ fullDescription:
    '<h3>What we offer</h3><p>Pension and a bonus.</p><h3>Experience or skills needed</h3><p>Ignore me.</p>' }),
  'Pension and a bonus')

rec('a section that is only a heading is skipped, not returned empty',
  () => selectQuote({ fullDescription:
    '<h3>What we offer</h3><h3>What you’ll be doing</h3><p>Breakfast service.</p>' }),
  'Breakfast service')

// ── NEVER TRUNCATED ────────────────────────────────────────────────────────
// An ellipsis reads as scraped text, and the whole value of the line is that
// the employer said it. If nothing fits whole, the card drops to the tags.

const tooLong = 'We can offer the successful candidate a genuinely outstanding package of benefits including a pension and much more besides.'
rec('an over-long sentence is REFUSED, not cut',
  () => selectQuote({ fullDescription: `<h3>What we offer</h3><p>${tooLong}</p>` }),
  null)

rec('nothing the rule returns ever ends in an ellipsis', () => {
  const bodies = [tooLong, 'Short one.', bothSections, 'A '.repeat(200)]
  return bodies
    .map(b => selectQuote({ fullDescription: b }))
    .filter(q => q !== null && /[.…]{2,}|…/.test(q as string))
}, [])

rec('a sentence exactly at the limit is kept', () => {
  const s = 'x'.repeat(QUOTE_MAX - 1) + '.'
  const q = selectQuote({ fullDescription: `<h3>What we offer</h3><p>${s}</p>` })
  return q !== null && q.length === QUOTE_MAX - 1
}, true)

// ── BOILERPLATE, AND WHY IT IS STRIPPED BEFORE MEASURING ───────────────────
// THE PAIR THAT MAKES THIS WORTH HAVING: one sentence, over the limit with its
// opener and under it without. Measuring first would throw away a usable line
// on the strength of words we were about to remove.

const withOpener = 'We are currently recruiting for a live-in Chef de Partie for a two rosette countryside kitchen.'
rec('the opener pushes it over the limit', () => withOpener.length > QUOTE_MAX, true)
rec('and stripping the opener brings it under', () => {
  const s = firstSentence(withOpener)
  return s !== null && s.length <= QUOTE_MAX
}, true)
rec('so the sentence survives, without the opener',
  () => selectQuote({ fullDescription: `<h3>What we offer</h3><p>${withOpener}</p>` }),
  'A live-in Chef de Partie for a two rosette countryside kitchen')

// ── PUNCTUATION ────────────────────────────────────────────────────────────
// A decimal or an abbreviation must not end a sentence two words in. This is
// the fault that would put "£16" on a card.

rec('a rate does not end the sentence',
  () => firstSentence('£16.95 an hour, four days a week. And more after.'),
  '£16.95 an hour, four days a week')

rec('a full stop is dropped but a question mark is kept',
  () => [firstSentence('Fancy a change?'), firstSentence('Fancy a change.')],
  ['Fancy a change?', 'Fancy a change'])

// ── ENTITIES ───────────────────────────────────────────────────────────────
// This string is printed as TEXT on a card, so an undecoded entity appears
// literally. `&amp;` must decode last or it re-creates another entity.

rec('entities are decoded, and &amp; last',
  () => selectQuote({ fullDescription: '<h3>What we offer</h3><p>Fish &amp; chips, you&rsquo;ll love it.</p>' }),
  'Fish & chips, you’ll love it')

rec('blocks do not run together when tags are stripped',
  () => selectQuote({ fullDescription: '<h3>What we offer</h3><p>Pension</p><p>and parking.</p>' }),
  'Pension and parking')

// ── UNSECTIONED PROSE, AND ITS GUARD ───────────────────────────────────────
// The free-text editor writes one block with no headings, so without this every
// advert typed that way would skip straight to tags. It is guarded on there
// being NO sections, and THAT is the half worth asserting: it must never
// override a real one.

rec('an unsectioned advert still yields its opening line',
  () => selectQuote({ fullDescription: '<p>Four day week in a fresh food kitchen.</p><p>Apply within.</p>' }),
  'Four day week in a fresh food kitchen')

rec('but prose before a heading never beats the heading',
  () => selectQuote({ fullDescription:
    '<p>Ignore this opening line entirely.</p><h3>What we offer</h3><p>Pension and parking.</p>' }),
  'Pension and parking')

// ── THE MESS ───────────────────────────────────────────────────────────────
// Every branded card must render with a missing quotation, so every one of
// these has to return null rather than throw or return a fragment.

rec('empty, null and whitespace all return null',
  () => [
    selectQuote({ fullDescription: '' }),
    selectQuote({ fullDescription: null }),
    selectQuote({ fullDescription: '   ' }),
    selectQuote({}),
    selectQuote({ fullDescription: '<h3>What we offer</h3>' }),
  ],
  [null, null, null, null, null])

rec('the short description is used when there is no body',
  () => selectQuote({ fullDescription: '', description: 'Sous chef wanted in Bath.' }),
  'Sous chef wanted in Bath')

// ── THE MONOGRAM — the one element that cannot fail ────────────────────────

rec('"Collins King & Associates" gives CK', () => companyInitials('Collins King & Associates'), 'CK')
rec('a one-word company gives one letter', () => companyInitials('Sauce'), 'S')
// THIS ASSERTION WAS WRONG BEFORE THE CODE WAS. It wanted "TE" from "The Ember
// Group" — but "The" and "Group" are BOTH filler, so the only real word is
// Ember and "E" is the right answer. Same family as the solid-rectangle logo
// fixture: the rule was doing its job and the expectation had not thought the
// case through. Kept as a pair so a rule that stopped skipping filler fails on
// one side or the other.
rec('a name whose only real word is one word gives one letter',
  () => companyInitials('The Ember Group'), 'E')
rec('a name with two real words gives two',
  () => companyInitials('The Ember Kitchen Group'), 'EK')
rec('an all-filler name still yields something',
  () => companyInitials('Goldenkeys Recruitment').length >= 1, true)
rec('empty and null never produce an empty mark',
  () => [companyInitials(''), companyInitials(null), companyInitials('   ')],
  ['?', '?', '?'])

// ── THE COMPOSER THE PREVIEW SHARES ────────────────────────────────────────
// The step-3 preview and the publish payload must produce the same string, or
// the preview promises a sentence the board does not render.

rec('free-text mode passes the editor HTML through',
  () => composeDescription('free', { whatWeOffer: 'ignored' }, '<p>Written by hand.</p>'),
  '<p>Written by hand.</p>')

rec('the composer emits the headings jobQuote looks for', () => {
  const html = composeDescription('guided', { whatWeOffer: 'Pension.' }, '')
  return html.includes('<h3>What we offer</h3>') && selectQuote({ fullDescription: html }) === 'Pension'
}, true)

rec('typed HTML is escaped, not rendered',
  () => composeDescription('guided', { whatWeOffer: 'Under <10 covers & calm.' }, '').includes('&lt;10 covers &amp; calm'),
  true)

// ── THE PLACE LINE ─────────────────────────────────────────────────────────
// Nine call sites built this string by hand and all nine printed the town
// twice when `area` already began with it — eleven live adverts, ten of them
// reading "London, London". Now one function, asserted here.

rec('a town and its county keep the comma',
  () => formatJobLocation({ location: 'Bath', area: 'Somerset' }), 'Bath, Somerset')

// THE PAIR THAT MATTERS: an exact repeat and a prefix repeat are both repeats,
// and an equality test only catches the first. Ricci's advert is the second.
rec('an exact repeat collapses to one',
  () => formatJobLocation({ location: 'London', area: 'London' }), 'London')
rec('a prefix repeat keeps the MORE specific half',
  () => formatJobLocation({ location: 'London', area: 'London E9 5EN' }), 'London E9 5EN')

rec('the repeat test ignores case',
  () => formatJobLocation({ location: 'London', area: 'london E9 5EN' }), 'london E9 5EN')

// A county that merely CONTAINS the town is not a repeat — "Bath" inside
// "Bathgate" must not swallow the comma. Prefix, not substring, and anchored.
rec('a longer word starting with the town is still a repeat', // Bath -> Bathwick
  () => formatJobLocation({ location: 'Bath', area: 'Bathwick' }), 'Bathwick')
rec('a town appearing mid-area keeps the comma',
  () => formatJobLocation({ location: 'Bath', area: 'North East Bath' }), 'Bath, North East Bath')

rec('missing halves never leave a dangling comma',
  () => [
    formatJobLocation({ location: 'Bath', area: '' }),
    formatJobLocation({ location: '', area: 'Somerset' }),
    formatJobLocation({ location: 'Bath', area: null }),
    formatJobLocation({}),
    formatJobLocation({ location: ' Bath ', area: '  ' }),
  ],
  ['Bath', 'Somerset', 'Bath', '', 'Bath'])

// ── REPORT ─────────────────────────────────────────────────────────────────

let failed = 0
for (const r of out) {
  if (r.ok) console.log(`  PASS  ${r.name}`)
  else {
    failed++
    console.log(`  FAIL  ${r.name}\n          got:  ${JSON.stringify(r.got)}\n          want: ${JSON.stringify(r.want)}`)
  }
}
console.log(`\n${out.length - failed}/${out.length} passed`)
process.exit(failed ? 1 : 0)
