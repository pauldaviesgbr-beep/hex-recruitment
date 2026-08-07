#!/usr/bin/env node
/**
 * What is actually unmerged, and what it carries.
 *
 * WHY THIS EXISTS. feat/insights-page sat on the unmerged list in state report
 * after state report for days. Nobody asked why — the list said "unmerged" and
 * it got repeated, which is a fact carried forward without being retested. When
 * it was finally checked it was neither of the two things everyone assumed: the
 * feature HAD merged and the page WAS live, and the branch still carried one
 * commit main had never seen — a CLAUDE.md rule that would have gone with it.
 *
 * Worse, that commit had never been pushed, so `origin/feat/insights-page` read
 * as fully merged. The question "is it merged?", asked of the remote the way
 * anyone would ask it, answered YES and was wrong.
 *
 * So this does not ask whether a branch LOOKS merged. It asks what each branch
 * CARRIES that main does not have, across local AND remote refs, and prints it.
 * A branch with nothing to carry does not appear at all.
 *
 * Same argument as migrations:check and the pre-push hook: discipline is what
 * already failed — twice, on this exact branch — so make the correct move the
 * automatic one.
 *
 *   npm run unmerged
 *
 * Exit codes: 0 always. This reports, it does not gate — an unmerged branch is
 * a normal state of the world, not a fault.
 */
const { execFileSync } = require('child_process')

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch (err) {
    return ''
  }
}

// Fetch so remote refs are current, and prune so branches deleted on the
// server stop appearing. A stale ref is exactly the kind of thing that gets
// read as a real finding.
try {
  execFileSync('git', ['fetch', 'origin', '--prune', '--quiet'], { stdio: 'ignore' })
} catch {
  console.log('(could not fetch — reporting against local knowledge of the remote)\n')
}

const refs = git('for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin')
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean)
  .filter(r => r !== 'main' && r !== 'origin/main' && r !== 'origin' && r !== 'origin/HEAD')

const carried = []
for (const ref of refs) {
  const count = git('rev-list', '--count', `main..${ref}`)
  if (!count || count === '0') continue
  const commits = git('log', '--format=%h %s', `main..${ref}`).split('\n').filter(Boolean)
  carried.push({ ref, commits })
}

console.log(`${refs.length} refs checked against main.\n`)

if (!carried.length) {
  console.log('Nothing unmerged. Every branch is fully contained in main.')
  process.exit(0)
}

// Group local and remote copies of the same branch, since they are one thing to
// a person and two refs to git — and they can DISAGREE, which is the whole point.
const byName = new Map()
for (const c of carried) {
  const name = c.ref.replace(/^origin\//, '')
  if (!byName.has(name)) byName.set(name, { local: null, remote: null })
  byName.get(name)[c.ref.startsWith('origin/') ? 'remote' : 'local'] = c
}

console.log(`${byName.size} branch${byName.size === 1 ? '' : 'es'} carrying work main does not have:\n`)

for (const [name, { local, remote }] of byName) {
  const where = local && remote ? 'local + remote' : local ? 'LOCAL ONLY — not pushed' : 'remote only'
  console.log(`  ${name}  (${where})`)
  for (const line of (local || remote).commits) console.log(`      ${line}`)
  // The case that nearly lost a rule: the local branch is ahead of its own
  // remote, so asking the remote whether it is merged gives the wrong answer.
  if (local && remote && local.commits.length !== remote.commits.length) {
    console.log(`      !! local carries ${local.commits.length} and remote ${remote.commits.length} —`)
    console.log('         asking the REMOTE whether this is merged would mislead')
  }
  if (local && !remote) {
    console.log('      !! never pushed — invisible to any question asked of origin')
  }
  console.log('')
}
