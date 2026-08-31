// THE RIGHT-TO-WORK LINE, ON THE ADVERT AND ON THE CARD.
//
// jobs.work_authorization has carried "Right to work in the UK required" on 231
// live adverts since import and rendered NOWHERE. This proves it now renders —
// and, more importantly, that it does NOT render on the 20 adverts that never
// said it.
//
// THE NEGATIVE IS THE HALF THAT MATTERS. A drive that only opened a Goldenkeys
// advert would pass just as happily if we defaulted every job to "required",
// which is the exact fault this was written to avoid. So it opens one advert of
// each kind and asserts opposite answers from the same check.
//
// TWO JOBS, CHOSEN BY WHAT THEY CARRY RATHER THAN BY WHO POSTED THEM:
//   WITH    a Goldenkeys advert, work_authorization length 1
//   WITHOUT a Host advert, work_authorization empty
// Both are live rows and both are READ ONLY here — the drive never writes.

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2]
const TAG = process.argv[3]
if (!BASE || !TAG) {
  console.error('usage: node scripts/drive-right-to-work-on-the-ad.mjs <base-url> <before|after>')
  process.exit(2)
}

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET || ''
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const JOBS = [
  { key: 'with',    id: '60a5092f-12b0-473b-b60b-060b243e52cc', expect: true,  who: 'Goldenkeys, work_authorization set' },
  { key: 'without', id: 'bc053e32-74b6-461e-a022-aafb8a9536b6', expect: false, who: 'Host, work_authorization empty' },
]

const rows = []
const fails = []
const note = t => rows.push('  ' + t)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    ...(BYPASS ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()

  for (const j of JOBS) {
    await page.goto(BASE + '/job/' + j.id, { waitUntil: 'domcontentloaded' })
    // Wait on the advert having rendered, never on a clock. An unsettled job
    // page says "Job Not Found" or nothing, and both look like a real answer.
    await page.waitForFunction(() => {
      const t = document.body ? document.body.innerText || '' : ''
      return t.includes('Apply') || t.includes('Job Not Found')
    }, undefined, { timeout: 45000 }).catch(() => {})

    const seen = await page.evaluate(() => {
      const t = document.body.innerText || ''
      return {
        notFound: t.includes('Job Not Found'),
        hasHeading: t.includes('Eligibility'),
        hasSentence: t.includes('Right to work in the UK required'),
        hasAttribution: t.includes('Stated by the employer on this advert'),
      }
    })

    rows.push('')
    rows.push('=== ' + j.key.toUpperCase() + ' — ' + j.who + ' ===')
    note('landed:                  ' + page.url().replace(BASE, ''))
    note('advert rendered:         ' + (seen.notFound ? 'NO — Job Not Found' : 'yes'))
    note('"Eligibility" heading:   ' + (seen.hasHeading ? 'YES' : 'no'))
    note('the sentence:            ' + (seen.hasSentence ? 'YES' : 'no'))
    note('"Stated by the employer":' + (seen.hasAttribution ? 'YES' : 'no'))

    await page.screenshot({ path: SHOTS + '/' + TAG + '-job-' + j.key + '.png', fullPage: true })

    if (seen.notFound) { fails.push(j.key + ': the advert did not render, so nothing below is about it'); continue }

    if (TAG === 'after') {
      if (j.expect) {
        if (!seen.hasHeading) fails.push('WITH: no Eligibility heading')
        if (!seen.hasSentence) fails.push('WITH: the sentence is not rendered')
        if (!seen.hasAttribution) fails.push('WITH: the attribution line is missing — it must read as the employer’s statement')
      } else {
        // ABSENT STAYS ABSENT. This is the assertion that stops a default.
        if (seen.hasHeading) fails.push('WITHOUT: an Eligibility heading rendered on an advert that never said it')
        if (seen.hasSentence) fails.push('WITHOUT: THE SENTENCE WAS INVENTED for an advert with an empty work_authorization')
      }
    }
    if (TAG === 'before' && seen.hasSentence) {
      fails.push(j.key + ': the sentence already renders — this is not the state being changed')
    }
  }

  // THE CARD. Same two jobs, on the board, by searching for each title.
  await page.goto(BASE + '/jobs', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const t = document.body ? document.body.innerText || '' : ''
    return /\d+\s+(jobs|roles)/i.test(t) && !t.includes('Loading roles')
  }, undefined, { timeout: 45000 }).catch(() => {})

  const board = await page.evaluate(() => {
    const t = document.body.innerText || ''
    const m = t.match(/(\d[\d,]*)\s+(?:jobs|roles)/i)
    return {
      count: m ? m[1] : '(not found)',
      badgeCount: (t.match(/Right to work required/g) || []).length,
    }
  })
  rows.push('')
  rows.push('=== the board ===')
  note('board says:              ' + board.count + ' jobs')
  note('"Right to work required" badges on screen: ' + board.badgeCount)
  await page.screenshot({ path: SHOTS + '/' + TAG + '-board.png' })

  // THE CARD BADGE WAS DROPPED DELIBERATELY — see lib/jobCard.ts. Asserting
  // its ABSENCE rather than deleting the check, so a future re-add is a
  // decision somebody makes rather than something that drifts back in.
  if (TAG === 'after' && board.badgeCount > 0) {
    fails.push('the card badge is back — it was measured and dropped; see lib/jobCard.ts')
  }

  // THE BOARD'S OWN COPY OF THE ADVERT, WHICH IS WHERE APPLYING ACTUALLY
  // HAPPENS. /jobs?id= carries its own benefits, description, requirements and
  // its own Apply Now button, so a candidate can read and apply without ever
  // opening /job/[id]. A version of this change that only covered /job/[id]
  // would have missed exactly the people the requirement is for.
  for (const j of JOBS) {
    await page.goto(BASE + '/jobs?id=' + j.id, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {
      const t = document.body ? document.body.innerText || '' : ''
      return /Apply Now|Applied|Checking/i.test(t)
    }, undefined, { timeout: 45000 }).catch(() => {})

    const seen = await page.evaluate(() => {
      const t = document.body.innerText || ''
      return {
        hasApply: /Apply Now|Applied/i.test(t),
        hasHeading: t.includes('Eligibility'),
        hasSentence: t.includes('Right to work in the UK required'),
        hasAttribution: t.includes('Stated by the employer on this advert'),
      }
    })
    rows.push('')
    rows.push('=== board detail /jobs?id= — ' + j.key.toUpperCase() + ' ===')
    note('Apply control present:   ' + (seen.hasApply ? 'YES' : 'no'))
    note('"Eligibility" heading:   ' + (seen.hasHeading ? 'YES' : 'no'))
    note('the sentence:            ' + (seen.hasSentence ? 'YES' : 'no'))
    note('"Stated by the employer":' + (seen.hasAttribution ? 'YES' : 'no'))
    await page.screenshot({ path: SHOTS + '/' + TAG + '-boarddetail-' + j.key + '.png' })

    if (TAG === 'after') {
      if (!seen.hasApply) fails.push('board detail ' + j.key + ': no Apply control found — this run is not measuring the apply surface')
      if (j.expect) {
        if (!seen.hasSentence) fails.push('BOARD DETAIL WITH: the sentence is missing on the surface people actually apply from')
        if (!seen.hasAttribution) fails.push('BOARD DETAIL WITH: the attribution line is missing')
      } else {
        if (seen.hasSentence) fails.push('BOARD DETAIL WITHOUT: the sentence was invented for an advert that never said it')
      }
    }
  }

  // THE PHONE. The badge adds a SECOND badge row to 231 of 251 cards — card
  // height is unchanged at 1280 and the title block absorbs it, but a desktop
  // screenshot says nothing about 390, which is where this product's layout
  // faults have all been found. Asserts the class rather than eyeballing it:
  // nothing may overflow the viewport, and no title may be clipped.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/jobs', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const t = document.body ? document.body.innerText || '' : ''
    return /\d+\s+(jobs|roles)/i.test(t) && !t.includes('Loading roles')
  }, undefined, { timeout: 45000 }).catch(() => {})

  const phone = await page.evaluate(() => {
    const overflowing = [...document.querySelectorAll('*')]
      .filter(el => !el.children.length && el.getBoundingClientRect().right > window.innerWidth + 1)
      .map(el => (el.textContent || '').trim().slice(0, 40))
      .filter(Boolean)
    // A DELIBERATE LINE-CLAMP LOOKS EXACTLY LIKE ACCIDENTAL CLIPPING — both
    // are overflow:hidden with scrollHeight > clientHeight. The first version
    // of this check could not tell them apart and reported the card's quote
    // panel, which is clamped on purpose. Verified against production BEFORE
    // this change: identical two elements, so it was never about the badge.
    // A check that cannot distinguish the two states it cares about is a red
    // nobody reads, so the clamped ones are excluded by name.
    const clipped = [...document.querySelectorAll('*')]
      .filter(el => {
        const cs = getComputedStyle(el)
        if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return false
        return /hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2
      })
      .map(el => {
        const cs = getComputedStyle(el)
        return {
          text: (el.textContent || '').trim().slice(0, 34),
          cls: String(el.className || '').slice(0, 40),
          overflowY: cs.overflowY,
          clamp: cs.webkitLineClamp,
          maxHeight: cs.maxHeight,
          scroll: el.scrollHeight,
          client: el.clientHeight,
        }
      })
      .filter(x => x.text)
    return { pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1, overflowing, clipped }
  })
  rows.push('')
  rows.push('=== the board at 390 ===')
  note('page scrolls sideways:   ' + (phone.pageScrollsSideways ? 'YES' : 'no'))
  note('elements past the edge:  ' + (phone.overflowing.length || 'none'))
  for (const o of phone.overflowing.slice(0, 5)) note('   "' + o + '"')
  note('vertically clipped:      ' + (phone.clipped.length || 'none'))
  for (const c of phone.clipped.slice(0, 5)) note("   \"" + c.text + "\"  cls=" + c.cls + "  overflowY=" + c.overflowY + "  clamp=" + c.clamp + "  maxH=" + c.maxHeight + "  " + c.scroll + "/" + c.client)
  await page.screenshot({ path: SHOTS + '/' + TAG + '-board-390.png' })

  if (TAG === 'after') {
    if (phone.pageScrollsSideways) fails.push('the board scrolls sideways at 390')
    if (phone.overflowing.length) fails.push(phone.overflowing.length + ' elements run past the right edge at 390')
    // KNOWN AND PRE-EXISTING, SO THE CHECK ASKS ABOUT NEW CLIPPING ONLY.
    // BrandedJobFallback_body — the no-photograph panel's text — is crushed at
    // 390 with overflowY hidden, NO line-clamp and NO max-height: 48px of
    // content in a 4px box, and 60 in 29. Measured identically on PRODUCTION
    // before this change, so it is not the badge. It is a real fault and it is
    // reported separately rather than fixed here; excluding it by name keeps
    // this assertion able to catch a NEW one instead of being a permanent red
    // nobody reads.
    const novel = phone.clipped.filter(c => !/BrandedJobFallback/.test(c.cls))
    if (novel.length) fails.push(novel.length + ' NEWLY clipped elements at 390: ' + novel.map(c => '"' + c.text + '"').join(', '))
  }
} catch (e) {
  fails.push('threw: ' + e.message)
} finally {
  await browser.close()
}

console.log(rows.join('\n'))
console.log('')
if (fails.length) {
  console.log(TAG.toUpperCase() + ': ' + fails.length + ' FAILED')
  for (const f of fails) console.log('  - ' + f)
  process.exit(1)
}
console.log(TAG.toUpperCase() + ': all checks passed')
