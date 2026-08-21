'use client'

/**
 * TEMPORARY. A gallery of the no-photograph card, for design review only.
 *
 * IT EXISTS BECAUSE THE PRODUCT CANNOT CURRENTLY SHOW ITS OWN DESIGN. The
 * branded card only renders on an advert with no photograph; there is exactly
 * one of those on the live board, its own text produces no quotation under the
 * 90-character rule, and no employer has a stored brand colour yet. So the two
 * states anyone has actually seen are the two weakest rungs of a four-rung
 * ladder, and the design has never been on screen.
 *
 * Every value below is REAL: the colours are what lib/brandColour resolves from
 * the five live logos, and the sentences are what lib/jobQuote lifts from live
 * adverts. Nothing here is written for the mock. The component is the shipped
 * one — this page only supplies it with data the board cannot yet produce.
 *
 * DELETE THIS ROUTE once the gallery has been looked at. It is not linked from
 * anywhere and it is not part of the feature.
 *
 * (Not app/_diag/… — a leading underscore makes a folder private in the App
 * Router and the route 404s however good the file is.)
 */

import FeedCard, { type FeedCardModel } from '@/components/FeedCard'

const base = (over: Partial<FeedCardModel>): FeedCardModel => ({
  id: Math.random().toString(36).slice(2),
  banner: null,
  logo: null,
  company: 'Company',
  title: 'Job title',
  where: 'Location',
  pay: '£30k/year',
  badges: [{ label: 'Full-time' }, { label: 'Permanent' }, { label: 'Easy apply', accent: true }],
  ...over,
})

// The four rungs, in the order the selection rule tries them.
const CARDS: { note: string; model: FeedCardModel }[] = [
  {
    note: '1 · a quotation, on the employer’s own colour — Collins King #433468',
    model: base({
      company: 'Collins King & Associates', title: 'Head Chef Events',
      where: 'London E9 5EN', pay: '£50k–£60k/year', brandColour: '#433468',
      quote: 'Full ownership of the food offer, Monday to Friday',
      isNew: true,
    }),
  },
  {
    note: '1 · the same rung, near-black — Sauce #2E2E2E, a real Host Staffing line',
    model: base({
      company: 'Sauce Hospitality', title: 'Sous Chef',
      where: 'Bath', pay: '£32k/year', brandColour: '#2E2E2E',
      quote: 'Sous Chef for a prestigious private members golf club in Richmond',
    }),
  },
  {
    note: '1 · navy, because the logo is a rainbow — a real Goldenkeys line',
    model: base({
      company: 'Goldenkeys Recruitment', companyNote: '· via recruiter',
      title: 'Head Chef', where: 'Bristol', pay: '£45k/year', brandColour: '#0F172A',
      quote: 'Take charge of a brand-new gourmet kitchen in Bristol!',
    }),
  },
  {
    note: '3 · no usable sentence — the employer’s own tags, at size',
    model: base({
      company: 'Collins King & Associates', title: 'Head Chef Events',
      where: 'London E9 5EN', pay: '£50k–£60k/year', brandColour: '#433468',
      quote: null,
      panelTags: ['Monday–Friday', 'No late finishes', 'Immediate start', 'Pension'],
    }),
  },
  {
    note: '4 · no tags either — the monogram. THIS IS THE ONE YOU HAVE SEEN.',
    model: base({
      company: 'Collins King & Associates', title: 'Head Chef Events',
      where: 'London E9 5EN', pay: '£50k–£60k/year', brandColour: '#433468',
      quote: null, panelTags: [],
    }),
  },
  {
    note: '4 · and the same rung on our navy, which is the LIVE board today',
    model: base({
      company: 'Collins King & Associates', title: 'Head Chef Events',
      where: 'London E9 5EN', pay: '£50k–£60k/year', brandColour: null,
      quote: null, panelTags: [],
    }),
  },
]

export default function CardGallery() {
  return (
    <div style={{ padding: 40, background: '#EEF1F5', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 26 }}>The no-photograph card — all four rungs</h1>
      <p style={{ margin: '0 0 28px', color: '#475569', fontSize: 14, maxWidth: 760, lineHeight: 1.6 }}>
        Real colours, resolved by lib/brandColour from the five live logos. Real sentences,
        lifted by lib/jobQuote from live adverts. The shipped component, not a mock — this
        page only feeds it data the board cannot produce yet, because the one advert with no
        photograph has no stored colour and no sentence short enough to quote.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 22, maxWidth: 1240 }}>
        {CARDS.map(c => (
          <div key={c.note}>
            <p style={{ margin: '0 0 8px', font: '500 12px/1.4 ui-monospace, monospace', color: '#6B7688' }}>{c.note}</p>
            <FeedCard model={c.model} />
          </div>
        ))}
      </div>
    </div>
  )
}
