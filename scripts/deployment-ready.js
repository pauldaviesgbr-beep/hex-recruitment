#!/usr/bin/env node
/**
 * IS A DEPLOYMENT ACTUALLY READY? — the one way to ask.
 *
 * Three probes lied about this in a single day, each one chosen to fix the
 * last, each with the identical flaw:
 *
 *   the root URL returned 200          — it was Vercel's SSO auth page
 *   curl grepped for body text         — the page is client-rendered, so the
 *                                        text never appears in the response
 *   /robots.txt returned 200           — Vercel serves it WHILE STILL BUILDING,
 *                                        and a whole sweep ran against the
 *                                        "Deployment is building" placeholder
 *
 * Every one asked WHETHER SOMETHING ANSWERED rather than WHETHER IT WAS OURS.
 * A URL cannot tell you it is ready, because something always answers.
 *
 * The deployment record has never lied, so this is a script rather than a rule:
 * discipline is what already failed three times, and the correct move has to be
 * the easy one. Same argument as migrations:check and the pre-push hook.
 *
 *   npm run deploy-ready                  latest production deployment
 *   npm run deploy-ready -- <sha|branch>  a specific commit or branch
 *   npm run deploy-ready -- --wait        block until READY (or ERROR/timeout)
 *
 * Exits 0 only when state is READY. Prints the URL to drive, which is read from
 * the record rather than guessed — the other rule this keeps breaking.
 */
const fs = require('fs')
const path = require('path')

const ENV = {}
for (const f of ['.env.local', '.env']) {
  const p = path.join(process.cwd(), f)
  if (!fs.existsSync(p)) continue
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !(m[1] in ENV)) ENV[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const TOKEN = process.env.VERCEL_TOKEN || ENV.VERCEL_TOKEN
const proj = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.vercel/project.json'), 'utf8'))

const args = process.argv.slice(2)
const wait = args.includes('--wait')
const target = args.find(a => !a.startsWith('--'))

if (!TOKEN) {
  // SKIP, NOT FAIL — a missing token must not become a reason to go back to
  // guessing, but it must also never read as "ready".
  console.log('SKIP  no VERCEL_TOKEN — cannot read the deployment record.')
  console.log('      Do NOT fall back to curling a URL: that is what lied three times.')
  console.log('      Read the record in the Vercel dashboard, or set VERCEL_TOKEN.')
  process.exit(2)
}

async function fetchDeployments() {
  const url = `https://api.vercel.com/v6/deployments?projectId=${proj.projectId}&teamId=${proj.orgId}&limit=20`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!res.ok) throw new Error(`Vercel API ${res.status}`)
  return (await res.json()).deployments || []
}

function pick(deployments) {
  if (!target) return deployments.find(d => d.target === 'production') || null
  return deployments.find(d =>
    (d.meta?.githubCommitSha || '').startsWith(target) ||
    d.meta?.githubCommitRef === target) || null
}

;(async () => {
  const deadline = Date.now() + 15 * 60_000
  for (;;) {
    const d = pick(await fetchDeployments())
    if (!d) {
      console.log(`no deployment found for ${target || 'production'}`)
      process.exit(1)
    }
    const sha = (d.meta?.githubCommitSha || '').slice(0, 7)
    const line = `${d.state.padEnd(8)} ${sha} ${d.meta?.githubCommitRef || ''}`

    if (d.state === 'READY') {
      console.log(`READY    ${sha}  ${d.meta?.githubCommitRef || ''}`)
      console.log(`  drive  https://${d.url}`)
      if (d.meta?.branchAlias) console.log(`  alias  https://${d.meta.branchAlias}`)
      console.log(`  id     ${d.id}`)
      process.exit(0)
    }
    if (d.state === 'ERROR' || d.state === 'CANCELED') {
      console.log(`FAILED   ${line}`)
      process.exit(1)
    }
    if (!wait) {
      console.log(`NOT READY  ${line}`)
      console.log('  Anything that answers on that host right now is the build placeholder.')
      process.exit(1)
    }
    if (Date.now() > deadline) {
      console.log(`TIMEOUT  still ${d.state} after 15 minutes`)
      process.exit(1)
    }
    process.stdout.write(`  ${d.state}…\n`)
    await new Promise(r => setTimeout(r, 10_000))
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
