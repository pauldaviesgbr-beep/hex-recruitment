/**
 * THE ADVERT BODY, COMPOSED FROM THE GUIDED BOXES.
 *
 * Lifted out of the post-a-job submit handler so it has exactly two callers:
 * the publish payload, and the step-3 branded-card preview.
 *
 * It had to move. The preview shows the employer what their card looks like
 * WITHOUT a photograph, and the sentence on that card is lifted from this
 * string — so a preview that composed the advert its own way could promise a
 * sentence the published card does not carry. Same argument as the stay-hidden
 * link: test the artefact people actually get, through the path they actually
 * take. Two copies of a composition eventually disagree, and this is a place
 * where the disagreement would be invisible until an employer complained that
 * their card changed after they pressed publish.
 *
 * Composed as HTML because the free-text editor stores HTML in the same column
 * and the detail page renders it as such. The `<h3>` headings are not
 * decoration — lib/jobQuote reads them to find "What we offer".
 */

export interface GuidedFields {
  dayToDay?: string
  experienceNeeded?: string
  whatWeOffer?: string
}

/** The apostrophe is U+2019, and lib/jobQuote's matcher accepts both forms. */
const DAY_TO_DAY_HEADING = 'What you’ll be doing'
const EXPERIENCE_HEADING = 'Experience or skills needed'
const OFFER_HEADING = 'What we offer'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Blank lines split paragraphs; single newlines become breaks. Escaped first,
 * so an employer typing "R&D" or "<10 covers" gets those characters back rather
 * than a broken entity or a swallowed tag.
 */
const toParagraphs = (s: string) =>
  s.trim().split(/\n{2,}/)
    .map(block => '<p>' + escapeHtml(block.trim()).replace(/\n/g, '<br />') + '</p>')
    .join('')

export function composeDescription(
  view: string,
  guided: GuidedFields,
  freeText: string,
): string {
  // The free-text editor already holds HTML and has escaped its own content.
  if (view !== 'guided') return freeText || ''

  return [
    guided.dayToDay && `<h3>${DAY_TO_DAY_HEADING}</h3>${toParagraphs(guided.dayToDay)}`,
    guided.experienceNeeded && `<h3>${EXPERIENCE_HEADING}</h3>${toParagraphs(guided.experienceNeeded)}`,
    guided.whatWeOffer && `<h3>${OFFER_HEADING}</h3>${toParagraphs(guided.whatWeOffer)}`,
  ].filter(Boolean).join('')
}
