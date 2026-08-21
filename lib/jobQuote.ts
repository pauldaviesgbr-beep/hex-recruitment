/**
 * ONE SENTENCE FROM THE ADVERT, TO CARRY THE CARD THAT HAS NO PHOTOGRAPH.
 *
 * The no-photo panel used to hold a logo, and four attempts at that failed for
 * the same reason: a logo cannot do a photograph's job. A photo tells a chef
 * about the room. A logo says who is advertising, which the company name on the
 * card already says. So the space goes to the only other thing a candidate wants
 * at a glance — what the work actually is, in the employer's own words.
 *
 * LIFTED, NEVER WRITTEN. No AI, no paraphrase, no summarising. The whole value
 * of the line is that the employer said it; the moment we compose one, the card
 * is asserting something about a workplace we have never seen, which is the same
 * objection that keeps `lib/jobArtwork.ts` unwired.
 *
 * AND NEVER TRUNCATED MID-SENTENCE. An ellipsis reads as scraped text. If
 * nothing fits whole we fall to the tags, which are the employer's own
 * selections and need no cutting.
 */

/**
 * Above this the line will not fit two lines on the panel.
 *
 * 100, NOT DESIGN'S 90. Their 90 was set against a 410px hero frame at 22px,
 * which we render nowhere; and the type now scales with the length of the line
 * (see the size bands in BrandedJobFallback), so a longer quotation is set
 * smaller and still lands in two lines.
 *
 * The 10 characters matter more than they look. Collins King's advert is well
 * written and its best line — "You'll be leading the culinary output for a
 * boutique events brand operating across East London" — is 93. At 90 that
 * advert got a ghosted monogram; at 100 it gets the employer's own words.
 */
export const QUOTE_MAX = 100

/**
 * Openers the scrape uses constantly. Stripped BEFORE measuring, because
 * "We are currently recruiting for a Head Chef in Bath" spends 27 of its 90
 * characters saying nothing a candidate wants — and then fails the length test
 * on the strength of the part we would have thrown away.
 *
 * Anchored at the start and case-insensitive. Deliberately a small list of
 * phrases seen on this board rather than a general cleverness: a wrong strip
 * changes the employer's words, which is the one thing this must not do.
 */
const BOILERPLATE = [
  /^we are currently (recruiting|looking|seeking)( for)?\s*/i,
  /^we are (recruiting|looking|seeking)( for)?\s*/i,
  /^our client is (currently\s+)?(recruiting|looking|seeking)( for)?\s*/i,
  /^an exciting (new )?opportunity has arisen( for)?\s*/i,
  /^a (fantastic|great|superb|brilliant) opportunity has arisen( for)?\s*/i,
  /^we have an? (exciting|fantastic|great) opportunity( for)?\s*/i,
  /^this is your chance to\s*/i,
]

/**
 * HTML to plain text.
 *
 * Tags become a SPACE, not nothing — the same fault the post-a-job summary hit,
 * where stripping `</h3><p>` outright ran two blocks together and the card read
 * "What you'll be doingCovering chef de partie shifts".
 *
 * Entities are decoded because this string is printed as text: `&rsquo;` left
 * raw appears literally on the card. `&amp;` is decoded LAST so it cannot
 * re-create another entity out of `&amp;lt;`.
 */
function toPlainText(html: string): string {
  return html
    // A BLOCK ENDS A SENTENCE, EVEN WITH NO FULL STOP. Employers write bullet
    // paragraphs — "<p>A competitive salary of £90,000 per annum</p><p>A
    // full-time position</p>" — and replacing every tag with a space ran the
    // two together into "A competitive salary of £90,000 per annum A full-time
    // position", which the sentence splitter then treated as one sentence and
    // the clause rule cut at its first comma. Same family as the card summary
    // that once read "What you'll be doingCovering chef de partie shifts".
    //
    // A full stop is inserted only where there is not already terminal
    // punctuation, so a properly written paragraph is untouched.
    .replace(/([^.!?>\s])\s*<\/(p|li|h[1-6]|div|blockquote)>/gi, '$1.')
    .replace(/<(br|hr)\s*\/?>/gi, '. ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The text under one `<h3>` heading, up to the next heading or the end.
 *
 * The post-a-job form composes the description as `<h3>What you'll be
 * doing</h3><p>…</p><h3>Experience or skills needed</h3>…`, so the sections are
 * real structure rather than something inferred from prose.
 *
 * The apostrophe in "What you'll be doing" is a RIGHT SINGLE QUOTE (U+2019) in
 * the composed HTML, not an ASCII one — matching on `'` finds nothing. Both are
 * accepted here rather than relying on either.
 */
function sectionUnder(html: string, headingPattern: RegExp): string | null {
  // Find every h3 and its offset, then take what lies between the match and the
  // next heading. Done positionally rather than with one greedy regex so a
  // section containing markup cannot swallow the section after it.
  const headings: { end: number; start: number; text: string }[] = []
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    headings.push({ start: m.index, end: m.index + m[0].length, text: toPlainText(m[1]) })
  }
  if (!headings.length) return null

  for (let i = 0; i < headings.length; i++) {
    if (!headingPattern.test(headings[i].text)) continue
    const to = i + 1 < headings.length ? headings[i + 1].start : html.length
    const body = toPlainText(html.slice(headings[i].end, to))
    return body || null
  }
  return null
}

/** Does this description carry headed sections at all? */
function hasSections(html: string): boolean {
  return /<h3[^>]*>/i.test(html)
}

/**
 * The first sentence, stripped of a leading boilerplate opener, or null if what
 * remains is unusable.
 *
 * A sentence ends at `.`, `!` or `?` followed by a space or the end of the
 * string. The trailing-space requirement is what stops "Mon.-Fri." and
 * "£16.95" from ending a sentence two words in.
 *
 * Returns the sentence WITHOUT its full stop. On a card a single line reads as
 * a caption rather than prose, and design's frames all sit without one — but
 * `!` and `?` are kept, because those carry tone the employer chose.
 */
export function firstSentence(text: string): string | null {
  let s = text.trim()
  if (!s) return null

  for (const re of BOILERPLATE) {
    const stripped = s.replace(re, '')
    if (stripped !== s) {
      // Re-capitalise: cutting "We are recruiting for " off the front leaves a
      // lower-case opener, which reads as a fragment rather than a sentence.
      s = stripped.charAt(0).toUpperCase() + stripped.slice(1)
      break
    }
  }

  const m = s.match(/^(.+?[.!?])(\s|$)/)
  let sentence = m ? m[1] : s
  sentence = sentence.trim()
  if (sentence.endsWith('.')) sentence = sentence.slice(0, -1)
  return sentence || null
}

export interface QuoteSource {
  /** The advert body. HTML from the form, plain prose from the scrape. */
  fullDescription?: string | null
  /** The short summary. Used only when there is no body at all. */
  description?: string | null
}

/**
 * Words that cannot end a card line, because a phrase stopping on one reads as
 * a sentence someone cut in half — which is the whole objection to truncating.
 * "…for a boutique events brand" is a phrase; "…for a boutique events brand and"
 * is a fragment.
 */
const DANGLING = new Set([
  'and', 'or', 'but', 'so', 'as', 'if', 'than', 'then', 'that', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'while', 'with', 'without', 'for', 'from',
  'to', 'of', 'in', 'on', 'at', 'by', 'a', 'an', 'the', 'is', 'are', 'was',
  'were', 'be', 'been', 'plus', 'including',
])

/** Below this a clause is a fragment, not a line. "This is a full-time" is 19. */
const CLAUSE_MIN = 30

/**
 * HEADINGS AN EMPLOYER TYPED AS ORDINARY TEXT. Skipped, and the rule moves on
 * to the next sentence rather than giving up on the section.
 *
 * Treating a block end as a full stop — which it had to, or bullet paragraphs
 * ran together — also turned these into one-line "sentences". One advert
 * immediately started reporting "About the Role" as its card line. A fix that
 * creates a new fault is not finished, and this is the other half of it.
 *
 * IT IS A LIST AND NOT A MINIMUM LENGTH, because length cannot tell the two
 * apart. A 25-character floor did reject "About the Role" — and rejected
 * "Pension and a bonus", "Breakfast service" and "Sous chef wanted in Bath"
 * with it, which are exactly the short punchy lines this feature wants most.
 * A check that cannot distinguish the two states is not a check.
 */
const HEADINGS = new Set([
  'about the role', 'the role', 'about us', 'about the company', 'about',
  'overview', 'the opportunity', 'the position', 'the job', 'the package',
  'responsibilities', 'key responsibilities', 'requirements', 'the candidate',
  'benefits', 'what we offer', 'what you offer', 'who we are', 'the company',
  'summary', 'job description', 'role overview', 'duties', 'skills',
])

/** How far into a section to look before giving up on it. */
const MAX_SENTENCES = 3

/**
 * THE FIRST CLAUSE OF A SENTENCE, WHEN THE WHOLE SENTENCE IS TOO LONG.
 *
 * Collins King's advert is the case. It is well written and every one of its
 * nine sentences runs past 100 characters, so the whole-sentence rule dropped
 * it to a ghosted monogram — a good advert getting the worst card purely
 * because of how its author punctuates.
 *
 * THIS IS NOT TRUNCATION, and the distinction is the point. A clause ending at
 * a comma is the employer's exact words in their exact order, stopping where
 * they themselves put a break. Nothing is written, nothing is reordered, and
 * there is no ellipsis. "You'll be leading the culinary output for a boutique
 * events brand" is already sitting in that advert; it simply has a comma after
 * it rather than a full stop.
 *
 * Two guards keep it a phrase rather than a fragment: it must be long enough to
 * stand alone, and it must not stop on a word that leaves the reader waiting.
 */
export function firstClause(sentence: string): string | null {
  const cut = sentence.search(/[,;—–]\s/)
  if (cut < 0) return null

  const clause = sentence.slice(0, cut).trim()
  if (clause.length < CLAUSE_MIN) return null

  const lastWord = (clause.match(/([A-Za-z’']+)\s*$/) || [])[1]
  if (lastWord && DANGLING.has(lastWord.toLowerCase())) return null

  return clause
}

/**
 * THE SELECTION RULE. Returns the sentence, or null to fall through to tags.
 *
 * Order, and why:
 *   1  "What we offer"          — candidate-facing, and the reason to apply
 *   2  "What you'll be doing"   — the work itself
 *   3  the opening sentence, but ONLY when the advert has no sections at all
 *   4  null  →  the caller shows the tags, then the monogram
 *
 * STEP 3 IS AN ADDITION TO THE HANDOFF, and it is here because the form has two
 * modes. The guided boxes produce the headed sections steps 1 and 2 read; the
 * "write it yourself" editor produces one unstructured block with no headings,
 * and every advert written that way would otherwise skip straight to tags. It
 * is still lifted and still the employer's own opening line — no rule is
 * loosened, it just reaches a shape the first two cannot see. It is guarded on
 * there being NO sections, so it can never override a real section.
 */
export function selectQuote(job: QuoteSource): string | null {
  const html = (job.fullDescription || '').trim() || (job.description || '').trim()
  if (!html) return null

  const candidates: (string | null)[] = []

  if (hasSections(html)) {
    candidates.push(sectionUnder(html, /what\s+we\s+offer/i))
    candidates.push(sectionUnder(html, /what\s+you[’']?ll\s+be\s+doing|day\s*-?\s*to\s*-?\s*day/i))
  } else {
    candidates.push(toPlainText(html))
  }

  for (const body of candidates) {
    if (!body) continue

    // THE FIRST FEW SENTENCES, not only the first. A section can open with a
    // heading the employer typed as ordinary text, and giving up on the whole
    // section because of it throws away the real line sitting right behind it.
    const sentences = body.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)

    for (let i = 0; i < Math.min(sentences.length, MAX_SENTENCES); i++) {
      // The boilerplate strip only applies to the opener — "We are currently
      // recruiting for" never appears mid-section.
      const sentence = i === 0
        ? firstSentence(sentences[0])
        : sentences[i].replace(/\.$/, '').trim()
      if (!sentence) continue

      if (HEADINGS.has(sentence.toLowerCase())) continue

      // The length test is on the FINAL string. Measuring before the strip
      // would reject a sentence for words we were about to remove.
      if (sentence.length <= QUOTE_MAX) return sentence

      // TOO LONG WHOLE — try the employer's own first clause before moving on.
      // Still their exact words, stopping at a break they put in themselves.
      const clause = firstClause(sentence)
      if (clause && clause.length <= QUOTE_MAX) return clause
    }
  }
  return null
}

/**
 * Up to two initials for the monogram — fallback 4, and the only element in the
 * system that cannot fail.
 *
 * Two letters rather than one: "it's just C" was a fair verdict on a single
 * centred letter, and "CK" reads as a monogram where "C" reads as a placeholder.
 * Words that are not names are skipped so "Collins King & Associates" gives CK
 * rather than C&, and a one-word company still yields one letter.
 */
export function companyInitials(company?: string | null): string {
  const SKIP = /^(&|and|the|of|ltd|limited|llp|plc|inc|co|group|associates|recruitment|hospitality|staffing|international)$/i
  const words = (company || '').trim().split(/[\s\-–—]+/).filter(Boolean)
  const named = words.filter(w => /[a-z]/i.test(w) && !SKIP.test(w))
  const use = named.length ? named : words.filter(w => /[a-z]/i.test(w))
  const letters = use.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('')
  return letters || '?'
}
