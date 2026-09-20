/**
 * Runs run_() from the REAL script file against a stubbed Gmail and Drive.
 * Nothing Google is touched. The point is to watch the zero-alarm FIRE,
 * and to prove the fixed counter can tell 0 from 29 where the old one could
 * only ever say 0 or 1.
 */
import { readFileSync } from 'node:fs'

const SRC = 'C:/Users/pauld/Downloads/thrive-invoice-filer.gs'

// ── a fake mailbox shaped like the real one ───────────────────────────
function makeMailbox() {
  const mk = (from, subject, dateIso, atts) => ({
    _from: from, _subject: subject, _date: new Date(dateIso), _atts: atts,
    getFrom: function () { return this._from },
    getSubject: function () { return this._subject },
    getDate: function () { return this._date },
    getAttachments: function () {
      return this._atts.map(n => ({ getName: () => n, copyBlob: () => ({ _name: n }) }))
    },
  })
  const thread = (msgs) => ({
    _msgs: msgs, _labels: [],
    getMessages: function () { return this._msgs },
    addLabel: function (l) { this._labels.push(l) },
    getFirstMessageSubject: function () { return this._msgs[0].getSubject() },
  })
  return [
    thread([mk('Anthropic <invoice+statements@mail.anthropic.com>', 'Your receipt from Anthropic, PBC #1', '2026-08-31', ['Invoice-APVOVHFO-0017.pdf', 'Receipt-2741.pdf'])]),
    thread([mk('Anthropic <invoice+statements@mail.anthropic.com>', 'Your receipt from Anthropic, PBC #2', '2026-07-31', ['Invoice-APVOVHFO-0016.pdf', 'Receipt-2093.pdf'])]),
    thread([mk('Vercel <invoice+statements@vercel.com>', 'Your receipt from Vercel Inc.', '2026-09-06', ['Invoice-DAKCBATJ-0002.pdf'])]),
    // the one that matters: a genuine invoice AND a credential, same sender
    thread([mk('1st Formations <no-reply@1stformations.co.uk>', 'Order Ref. 5875235 Order Fulfilment', '2026-05-06',
      ['CERTIFICATE.pdf', 'Authentication Code.pdf', 'MEMARTS.pdf'])]),
    // the scanned-post service — only reachable if SENDERS is widened
    thread([mk('Mail Team <mailservice@1stformations.co.uk>', 'New item of post', '2026-05-20',
      ['Registered-Post Received.pdf'])]),
  ]
}

function run(sendersOverride, label) {
  let src = readFileSync(SRC, 'utf8')
  if (sendersOverride) {
    const before = src
    src = src.replace(/var SENDERS = \[[\s\S]*?\n\];/, 'var SENDERS = ' + JSON.stringify(sendersOverride) + ';')
    if (src === before) throw new Error('SENDERS anchor missed — the harness is not testing what it thinks')
  }

  const mailbox = makeMailbox()
  const saved = [], alerts = [], logs = []

  const GmailApp = {
    // Honours `from:`, `-label:` and MAX, because MAX is where the bug lived.
    search(query, start, max) {
      const froms = [...query.matchAll(/from:([^\s}]+)/g)].map(m => m[1].toLowerCase())
      const excludeLabelled = /-label:/.test(query)
      let hits = mailbox.filter(t =>
        t.getMessages().some(m => froms.some(f => m.getFrom().toLowerCase().includes(f))))
      if (excludeLabelled) hits = hits.filter(t => t._labels.length === 0)
      return hits.slice(0, max)
    },
    getUserLabelByName: () => ({ _name: 'stub' }),
    createLabel: () => ({ _name: 'stub' }),
  }
  // A stub summary file, so the append path is exercised rather than
  // erroring. Without it the run alerts "summary file not found", which is
  // the script behaving correctly about a folder the harness built wrong.
  let summaryContent = '# EXISTING RECORD\n\nforty-two rows live here\n'
  const summaryFile = {
    getName: () => '0000 SUMMARY - stub.md',
    getBlob: () => ({ getDataAsString: () => summaryContent }),
    setContent: (s) => { summaryContent = s },
  }
  const folder = {
    getFilesByName: (n) => ({ hasNext: () => saved.includes(n) }),
    createFile: () => ({ setName: (n) => { saved.push(n) } }),
    getFiles: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return summaryFile } } },
    _summary: () => summaryContent,
  }
  const DriveApp = {
    getFoldersByName: (n) => ({
      hasNext: () => true,
      next: () => ({ getFoldersByName: () => ({ hasNext: () => true, next: () => folder }) }),
    }),
  }
  const MailApp = { sendEmail: (to, subject, body) => alerts.push({ subject, body }) }
  const Logger = { log: (s) => logs.push(s) }
  const Utilities = {
    formatDate: (d, tz, fmt) => d.toISOString().slice(0, 10),
  }
  const ScriptApp = { getProjectTriggers: () => [], newTrigger: () => ({}) }

  const factory = new Function('GmailApp', 'DriveApp', 'MailApp', 'Logger', 'Utilities', 'ScriptApp',
    src + '\nreturn { run_: run_, guardStatus_: guardStatus_ };')
  const api = factory(GmailApp, DriveApp, MailApp, Logger, Utilities, ScriptApp)

  let threw = null
  try { api.run_({ query: 'after:2026/01/01', dry: false, label }) } catch (e) { threw = e }

  const text = logs.join('\n')
  const ever = (text.match(/ever matched: (\d+)/) || [])[1]
  const proc = (text.match(/to process  : (\d+)/) || [])[1]
  return { saved, alerts, ever: Number(ever), proc: Number(proc), guard: api.guardStatus_(),
           threw, text, summary: folder._summary() }
}

console.log('═══ SCENARIO A — healthy mailbox ═══')
const a = run(null, 'TEST-A')
console.log('  ever matched :', a.ever)
console.log('  to process   :', a.proc)
console.log('  ever >= proc :', a.ever >= a.proc, '  <- the old code could never satisfy this')
console.log('  alerts sent  :', a.alerts.length, a.alerts.map(x => x.subject).join('; ') || '(none)')
console.log('  files saved  :', a.saved.length)
console.log('  credential filed?', a.saved.some(f => /authentication/i.test(f)) ? 'YES — FAULT' : 'no')
console.log('  flagged      :', a.saved.filter(f => f.startsWith('FLAG ')).length)
console.log('  guard        :', a.guard)
console.log('  summary APPENDED, not overwritten:',
  a.summary.startsWith('# EXISTING RECORD') && /AUTOMATED RUN/.test(a.summary))

console.log('\n═══ SCENARIO B — SENDERS broken, the failure the alarm exists for ═══')
const b = run(['no-such-vendor@example.invalid'], 'TEST-B')
console.log('  ever matched :', b.ever)
console.log('  to process   :', b.proc)
console.log('  alerts sent  :', b.alerts.length)
b.alerts.forEach(x => console.log('    ALERT:', x.subject))
console.log('  files saved  :', b.saved.length)

console.log('\n═══ SCENARIO C — SENDERS widened to the bare domain (the realistic mistake) ═══')
const c = run(['1stformations.co.uk'], 'TEST-C')
console.log('  guard        :', c.guard)
console.log('  files saved  :', c.saved.length)
console.log('  scanned post filed?', c.saved.some(f => /Registered-Post/i.test(f)) ? 'YES — FAULT' : 'no — blocked')
console.log('  credential filed? ', c.saved.some(f => /authentication/i.test(f)) ? 'YES — FAULT' : 'no — blocked')

const ok =
  a.ever >= a.proc && a.alerts.length === 0 && !a.saved.some(f => /authentication/i.test(f)) &&
  a.summary.startsWith('# EXISTING RECORD') && /AUTOMATED RUN/.test(a.summary) &&
  b.ever === 0 && b.alerts.length === 1 &&
  /THE SEARCH MATCHED NOTHING AT ALL/.test(b.alerts[0].subject) &&
  /LOAD-BEARING/.test(c.guard) && !c.saved.some(f => /Registered-Post/i.test(f))

console.log('\nALL EXPECTATIONS MET:', ok)
process.exitCode = ok ? 0 : 1
