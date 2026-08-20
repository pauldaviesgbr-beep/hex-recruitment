// THE TWO URL FORMS, SIDE BY SIDE, AND THEY MUST DIFFER IN THE RIGHT
// DIRECTION.
//
// Both /jobs?id=<uuid> and /job/<uuid> load the advert perfectly well for a
// human, which is exactly why this shipped: nothing is broken until someone
// pastes the link somewhere that renders a preview.
//
//   /jobs?id=<uuid>  the BOARD. A 'use client' page, so a crawler gets the
//                    root metadata: "Hospitality Jobs in the UK — Thrive" and
//                    the default site image. No role, no salary, no photo.
//   /job/<uuid>      the advert's own server-rendered page, with the role's
//                    title, company, location, salary and its 1200x630 image.
//
// WHY THE REDIRECT CHECK CANNOT SEE THIS. prove-redirect-targets.mjs walks
// router.push/replace path literals against the route table. This fault is on a
// QUERY STRING of a route that legitimately exists and legitimately resolves,
// so every question that check asks comes back correct. Named here because the
// tempting assumption is that the earlier check now covers the whole family.
//
// NOT IN npm run verify: it needs the network and a live advert. Run it
// against production by hand. Exit 2 = SKIP.

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const JOB_ID = process.argv[3] || 'f7e505fb-dbf8-4d57-aae2-23401cd53ae4'

function metaOf(html, prop) {
  // Attribute order varies, so match either way round rather than assuming.
  const a = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i')
  return (html.match(a) || html.match(b) || [])[1] ?? null
}

async function grab(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } })
  const html = await res.text()
  return {
    path, status: res.status,
    title: metaOf(html, 'og:title'),
    image: metaOf(html, 'og:image'),
    description: metaOf(html, 'og:description'),
  }
}

let board, advert
try {
  board = await grab(`/jobs?id=${JOB_ID}`)
  advert = await grab(`/job/${JOB_ID}`)
} catch (e) {
  console.error(`SKIP  could not reach ${BASE}: ${e.message}`)
  process.exit(2)
}

console.log('  /jobs?id=<uuid>   (the board — what the share controls used to emit)')
console.log(`      status      ${board.status}`)
console.log(`      og:title    ${board.title}`)
console.log(`      og:image    ${board.image}`)
console.log('')
console.log('  /job/<uuid>       (the advert — what they emit now)')
console.log(`      status      ${advert.status}`)
console.log(`      og:title    ${advert.title}`)
console.log(`      og:image    ${advert.image}`)
console.log('')

const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

// BOTH RETURN 200. Stated as an assertion rather than left implied, because
// "one of them 200s" is the check that would have passed on the bug.
check('both forms load for a human', `${board.status} / ${advert.status}`,
  board.status === 200 && advert.status === 200)

// THE DISCRIMINATOR. Not "the advert has a title" — the board has one too.
// They must DIFFER, which is the only form of this question the bug fails.
check('their og:titles differ', `${JSON.stringify(board.title)} vs ${JSON.stringify(advert.title)}`,
  !!board.title && !!advert.title && board.title !== advert.title)
check('their og:images differ', `${board.image === advert.image ? 'IDENTICAL' : 'different'}`,
  !!board.image && !!advert.image && board.image !== advert.image)

// And differ in the RIGHT direction: the advert names the role, the board does
// not. A pair that merely differs could be different-and-still-wrong.
check('the advert names the role, the board does not',
  advert.title, /reception|manager|chef|head of/i.test(advert.title || '') &&
  !/reception|manager|chef|head of/i.test(board.title || ''))

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}\n          ${r.got}`)
  else { failed++; console.log(`  FAIL  ${r.name}\n          ${r.got}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
