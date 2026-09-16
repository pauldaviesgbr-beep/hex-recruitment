// Did the roundup actually ARRIVE?
//
// "sent" from the cron route counts what Resend ACCEPTED, not what a mail server
// took. Two candidates asked why they hadn't received an email the run had
// reported as sent, and answering it meant querying Resend by hand. This turns
// that into a line in the Actions log nobody has to ask for.
//
//   node scripts/check-roundup-delivery.mjs <emails.json> <expected-count>
//
// <emails.json> is the body of GET https://api.resend.com/emails?limit=100.
// Fetching happens in the workflow so the API key never reaches this file.
//
// EXIT CODES — INVERTED 16 Sept 2026, AND THE INVERSION IS THE POINT
//   0  the check COULD SEE Resend. Everything delivered, still settling, or
//      some addresses bounced (named and warned about, see below).
//   1  the check COULD NOT SEE Resend. Unreadable response, an error body with
//      no data[], or timestamps it cannot parse.
//   2  usage
//
// WHAT THIS USED TO DO AND WHY IT WAS BACKWARDS. It failed the run when one
// address bounced, and passed the run when it could not see Resend at all —
// news about one recipient was fatal, news about the instrument was silent.
// A bounce is a fact about one mailbox that nobody here can fix by rerunning;
// it is worth a name in the log and is not a failed send. Blindness is the
// thing that must be loud, because a check that cannot see anything reports a
// clean run forever.
//
// It still does NOT fail on a status that has not settled. Resend reports
// 'sent' the instant it accepts a message and only 'delivered' once the
// receiving server takes it — usually seconds, occasionally longer. Treating
// "not yet known" as "not delivered" would make this cry wolf on a good run.

import { readFileSync } from 'node:fs'

const [, , file, expectedRaw] = process.argv
if (!file) {
  console.error('usage: check-roundup-delivery.mjs <emails.json> [expected-count]')
  process.exit(2)
}

const expected = Number.parseInt(expectedRaw ?? '0', 10) || 0

/** Messages from THIS run: the real roundup subject, no test marker, recent. */
const WINDOW_MS = 30 * 60 * 1000
const FAILED = new Set(['bounced', 'complained', 'failed'])

/**
 * Resend sends `created_at` as "2026-09-15 13:06:36.787000+00".
 *
 * THAT STRING PARSES AS-IS. The version of this file that ran until 16 Sept
 * 2026 did `Date.parse(created_at.replace(' ', 'T'))` — and the replace is
 * exactly what broke it: with a space it goes down V8's lenient path and
 * parses, and with a `T` it looks ISO-ish enough to go down the STRICT path,
 * where the bare `+00` offset is not a legal ISO 8601 offset and the answer is
 * NaN. Every message therefore failed `Number.isFinite` and was filtered out,
 * so the check saw an empty list on every run and had nothing to report.
 *
 * The lesson worth more than the fix: a normalisation that makes a value look
 * MORE standard can move it onto a stricter parser and break it. Raw first,
 * then a genuinely ISO form as a fallback.
 */
function parseTimestamp(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  const direct = Date.parse(s)
  if (Number.isFinite(direct)) return direct
  return Date.parse(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
}

/** Exit 1 with a reason. Reserved for "the check cannot see", never for a bounce. */
function blind(reason, detail) {
  console.log(`::error::Delivery check could not see Resend — ${reason}`)
  if (detail) console.log(`  ${detail}`)
  console.log(
    '  This is a check failure, not a send failure. The roundup may well have ' +
    'gone out; nothing here can confirm it either way.',
  )
  process.exit(1)
}

let raw
try {
  raw = readFileSync(file, 'utf8')
} catch (err) {
  blind(`could not read ${file}`, err.message)
}

let payload
try {
  payload = JSON.parse(raw)
} catch (err) {
  blind("Resend's response was not JSON", `${err.message} :: ${raw.slice(0, 200)}`)
}

// THE SEND-ONLY KEY LANDS HERE, AND IT USED TO LAND ON A GREEN TICK.
// Measured against the real send-only key on 16 Sept 2026 — BOTH of these are
// states this check will meet, and neither carries a data[] array:
//   401 {"statusCode":401,"message":"This API key is restricted to only send
//        emails","name":"restricted_api_key"}   <- a valid key without read access
//   400 {"statusCode":400,"message":"API key is invalid", ...}
//        <- a MALFORMED key. Worth knowing: the value in .env.local is quoted,
//        and passing the quotes through gets you this rather than the 401, which
//        sends you looking for a permissions problem that is really a parsing one.
// `(payload.data || [])` turned either into an empty list, which read as
// "nothing recent" and exited 0.
if (!Array.isArray(payload.data)) {
  blind(
    'the response carried no data[] array',
    `keys: ${Object.keys(payload).join(', ')} :: ${JSON.stringify(payload).slice(0, 200)}\n` +
    '  A send-only Resend key answers GET /emails this way. The delivery check ' +
    'needs a key with READ access — set the RESEND_READ_API_KEY repo secret.',
  )
}

const now = Date.now()
const roundups = payload.data.filter(e => {
  const subject = e.subject || ''
  return subject.includes('recommended for you') && !subject.includes('[test')
})

// An unparseable timestamp on a roundup message is blindness, not a row to drop.
// The old code filtered these out silently, which is how a format change could
// empty the list without anything going red.
const undateable = roundups.filter(e => !Number.isFinite(parseTimestamp(e.created_at)))
if (undateable.length > 0) {
  blind(
    `${undateable.length} roundup message(s) carried a created_at this check cannot parse`,
    `sample: ${JSON.stringify(undateable[0].created_at)} — the format has changed, ` +
    'so no message can be attributed to this run.',
  )
}

const recent = roundups.filter(e => now - parseTimestamp(e.created_at) <= WINDOW_MS)

const delivered = []
const pending = []
const failed = []

for (const e of recent) {
  const status = String(e.last_event || e.status || 'unknown').toLowerCase()
  const to = (e.to && e.to[0]) || '(unknown recipient)'
  if (status === 'delivered') delivered.push(to)
  else if (FAILED.has(status)) failed.push([to, status])
  else pending.push([to, status])
}

console.log(
  `${expected} sent, ${delivered.length} delivered, ` +
  `${pending.length} not yet known, ${failed.length} failed`,
)
// Name them. A count tells you something is wrong; a name tells you who to ring.
for (const [to, status] of failed) console.log(`  FAILED   ${to}  (${status})`)
for (const [to, status] of pending) console.log(`  pending  ${to}  (${status} — not settled yet)`)

// A BOUNCE WARNS. It is news about one mailbox — a closed account, a full
// inbox, a typo — and rerunning the workflow cannot change it. It goes in the
// log with the address on it so somebody can act; it does not turn the run red.
if (failed.length > 0) {
  console.log(
    `::warning::${failed.length} message(s) did not reach the recipient: ` +
    failed.map(([to]) => to).join(', '),
  )
}

// FINDING NOTHING AT ALL IS SEEING NOTHING, AND IT IS THE LAST WAY THIS COULD
// GO GREEN WHILE BLIND. The run has just told us it sent N messages and Resend
// answered with a readable list; zero of them being in it means the subject
// changed, the window is wrong, or they never reached Resend — every one of
// which is the check failing, not the send. A PARTIAL find stays a warning:
// limit=100 genuinely cannot show more than 100.
if (expected > 0 && recent.length === 0) {
  blind(
    `none of the ${expected} messages just sent are in Resend's recent list`,
    'Resend answered normally, so this is not a key problem — the subject filter, ' +
    'the 30-minute window, or the send itself has moved.',
  )
}

if (expected > 0 && recent.length < expected) {
  console.log(
    `::warning::Found ${recent.length} of ${expected} messages in Resend's recent list — ` +
    `the remainder could not be checked.`,
  )
}

console.log(
  `::notice::Delivery check: ${delivered.length}/${expected} confirmed delivered` +
  (pending.length > 0 ? `, ${pending.length} still settling` : '') +
  (failed.length > 0 ? `, ${failed.length} did not arrive` : ''),
)
