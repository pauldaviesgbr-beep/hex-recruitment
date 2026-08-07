const fs = require('fs'); const path = require('path')
const REPO = 'c:/Users/pauld/hex-recruitment'
const { chromium } = require(REPO + '/node_modules/playwright')
const { createClient } = require(REPO + '/node_modules/@supabase/supabase-js')
const E = {}
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const HOST = process.argv[2]
const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TITLE = 'Chef de Partie — SEO validThrough test (delete me)'
const OUT = __dirname
const notes = []
const note = t => { notes.push(t); console.log('   NOTE: ' + t) }

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': E.VERCEL_AUTOMATION_BYPASS_SECRET } })
  await ctx.addInitScript(() => { try { localStorage.setItem('cookie-consent', 'all') } catch {} })
  const p = await ctx.newPage()
  const posts = []
  p.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/')) posts.push(`${r.method()} /api/${r.url().split('/api/')[1].split('?')[0]}`) })

  const { data } = await db.auth.admin.generateLink({ type: 'magiclink', email: 'pauldavies.gbr+employer@gmail.com' })
  await p.goto(`https://${HOST}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&role=employer&next=${encodeURIComponent('/post-job')}`,
    { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(12000)

  // ── STEP 1 ──
  await p.getByLabel(/job title/i).first().fill(TITLE)
  await p.getByLabel(/location/i).first().fill('Bath')
  const cat = p.locator('select').first()
  const opts = await cat.locator('option').allTextContents()
  const hosp = opts.find(o => /hospitality/i.test(o)) || opts[1]
  await cat.selectOption({ label: hosp })
  console.log('category chosen:', hosp)
  await p.getByText('Full-time', { exact: true }).first().click()
  await p.getByText('Permanent', { exact: true }).first().click()
  const salary = p.locator('input[placeholder*="12"]').first()
  await salary.fill('32000')
  // The unit select sits beside it; pick the yearly option if present.
  const unit = p.locator('select').last()
  const uopts = await unit.locator('option').allTextContents().catch(() => [])
  const yearly = uopts.find(o => /year|annum|annual/i.test(o))
  if (yearly) { await unit.selectOption({ label: yearly }); console.log('salary unit:', yearly) }
  else note('could not find a yearly option in the salary unit select — left as default')

  await p.screenshot({ path: path.join(OUT, 'pj-1.png'), fullPage: true })
  await p.getByRole('button', { name: /next.*advert/i }).first().click()
  await p.waitForTimeout(6000)
  await p.screenshot({ path: path.join(OUT, 'pj-2.png'), fullPage: true })
  console.log('\n── STEP 2 ──')
  console.log((await p.locator('h1,h2').first().textContent().catch(()=>''))?.trim().slice(0,70))

  // The AI generator, if it is on this step.
  const gen = p.getByRole('button', { name: /generate|write it for me|ai/i }).first()
  if (await gen.count().catch(()=>0)) {
    console.log('AI generator button found — clicking')
    await gen.click(); await p.waitForTimeout(20000)
    await p.screenshot({ path: path.join(OUT, 'pj-2-generated.png'), fullPage: true })
    const ta = p.locator('textarea').first()
    const text = await ta.inputValue().catch(()=> '')
    console.log('description length after generate:', text.length)
    if (text.length < 80) note('the AI generator produced little or nothing — a real employer would be stuck here')
  } else {
    note('no AI generator control found on step 2')
    const ta = p.locator('textarea').first()
    if (await ta.count()) await ta.fill('Test posting created to verify structured data. Safe to delete.')
  }

  // Publish.
  const pub = p.getByRole('button', { name: /publish|post the job|go live/i }).first()
  if (!(await pub.count().catch(()=>0))) { note('NO PUBLISH BUTTON FOUND on step 2'); }
  else {
    console.log('publish control:', (await pub.textContent()).trim())
    await pub.click(); await p.waitForTimeout(12000)
  }
  await p.screenshot({ path: path.join(OUT, 'pj-3.png'), fullPage: true })
  console.log('\n── AFTER PUBLISH ──')
  console.log('url  :', p.url())
  console.log('h1/h2:', (await p.locator('h1,h2').first().textContent().catch(()=>''))?.trim().slice(0,70))
  console.log('\nnon-GET /api calls made by the form:', posts.length ? posts.join(', ') : 'NONE')
  fs.writeFileSync(path.join(OUT,'pj-notes.json'), JSON.stringify({notes,posts,url:p.url()},null,2))
  await br.close()
})().catch(e => { console.error('FAILED:', e.message.slice(0,300)); process.exitCode = 1 })
